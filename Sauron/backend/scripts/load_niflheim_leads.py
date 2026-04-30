"""Load Niflheim.csv into leads + lead_company_profiles.

By default this runs as a dry-run and reports what would be created/updated.
Pass --force to write changes to the database.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import async_session, engine as db_engine
from app.domain_utils import normalize_domain
from app.lead_profile_taxonomy import (
    normalize_buying_groups,
    normalize_lead_company_type,
    normalize_lead_industry,
)
from app.models.lead import Lead, LeadCompanyProfile
from app.services.csv_parsers import match_erp

CSV_PATH = BACKEND_ROOT / "Niflheim.csv"
_ASSOCIATION_SPLIT_RE = re.compile(r"[;,\n]+")


def _log(msg: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[load-niflheim-leads {ts}] {msg}", flush=True)


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned or cleaned in {"-", "N/A", "n/a"}:
        return None
    return cleaned


def _company_key(value: str | None) -> str | None:
    if not value:
        return None
    return re.sub(r"\s+", " ", value).strip().casefold()


def _safe_int(value: str | None) -> int | None:
    cleaned = _normalize_text(value)
    if cleaned is None:
        return None
    try:
        return int(float(cleaned))
    except (TypeError, ValueError):
        return None


def _normalize_revenue_m(raw_value: str | None, revenue_tier: str | None) -> str | None:
    cleaned = _normalize_text(raw_value)
    if cleaned is not None:
        try:
            normalized = Decimal(cleaned)
            return format(normalized.normalize(), "f").rstrip("0").rstrip(".") or "0"
        except InvalidOperation:
            return cleaned
    return _normalize_text(revenue_tier)


def _normalize_associations(value: str | None) -> str | None:
    cleaned = _normalize_text(value)
    if cleaned is None:
        return None
    parts: list[str] = []
    seen: set[str] = set()
    for part in _ASSOCIATION_SPLIT_RE.split(cleaned):
        entry = re.sub(r"\s+", " ", part).strip()
        if not entry:
            continue
        key = entry.casefold()
        if key in seen:
            continue
        seen.add(key)
        parts.append(entry)
    return "; ".join(parts) or None


def _merge_associations(existing: str | None, incoming: str | None) -> str | None:
    if existing is None:
        return incoming
    if incoming is None:
        return existing
    merged = _normalize_associations(f"{existing}; {incoming}")
    return merged or existing


def _merge_buying_groups(
    existing: list[str] | None,
    incoming: list[str] | None,
) -> list[str] | None:
    if existing is None and incoming is None:
        return None
    merged = normalize_buying_groups(existing or [], incoming or [])
    return merged if merged is not None else existing


def _row_score(row: dict[str, Any]) -> int:
    score = 0
    if row.get("domain"):
        score += 4
    for key in (
        "erp",
        "num_erp_users",
        "num_locations",
        "buying_groups",
        "associations",
        "primary_industry",
        "company_type",
        "revenue_m",
    ):
        value = row.get(key)
        if value not in (None, [], ""):
            score += 1
    return score


def _parse_rows(path: Path) -> tuple[list[dict[str, Any]], Counter]:
    rows: list[dict[str, Any]] = []
    counts: Counter = Counter()

    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for line_no, raw in enumerate(reader, start=2):
            company = _normalize_text(raw.get("company"))
            if company is None:
                counts["skipped_missing_company"] += 1
                continue

            primary_industry_raw = _normalize_text(raw.get("primary industry"))
            row = {
                "source_line": line_no,
                "company": company,
                "company_key": _company_key(company),
                "domain": normalize_domain(_normalize_text(raw.get("domain"))),
                "erp": match_erp(_normalize_text(raw.get("erp")) or ""),
                "num_erp_users": _safe_int(raw.get("num of users")),
                "num_locations": _safe_int(raw.get("# locations") or raw.get("Num of Locations")),
                "buying_groups": normalize_buying_groups(
                    _normalize_text(raw.get("primary buying group")),
                    _normalize_text(raw.get("other buying group")),
                ),
                "associations": _normalize_associations(raw.get("associations")),
                "primary_industry": normalize_lead_industry(primary_industry_raw),
                "company_type": normalize_lead_company_type(primary_industry_raw),
                "revenue_m": _normalize_revenue_m(
                    raw.get("revenue (M)"),
                    raw.get("revenue_tier"),
                ),
            }
            row["score"] = _row_score(row)
            rows.append(row)

    rows.sort(
        key=lambda row: (
            -int(row["score"]),
            row["company_key"] or "",
            row["domain"] or "",
            int(row["source_line"]),
        )
    )
    counts["parsed_rows"] = len(rows)
    return rows, counts


def _build_indexes(
    leads: list[Lead],
) -> tuple[dict[str, list[Lead]], dict[str, list[Lead]]]:
    by_domain: dict[str, list[Lead]] = defaultdict(list)
    by_name: dict[str, list[Lead]] = defaultdict(list)

    for lead in leads:
        domain = normalize_domain(lead.domain)
        if domain:
            by_domain[domain].append(lead)
        name_key = _company_key(lead.company)
        if name_key:
            by_name[name_key].append(lead)

    return by_domain, by_name


def _apply_row_to_profile(profile: LeadCompanyProfile, row: dict[str, Any]) -> int:
    updated = 0

    for key in (
        "erp",
        "num_erp_users",
        "num_locations",
        "primary_industry",
        "company_type",
        "revenue_m",
    ):
        incoming = row.get(key)
        if incoming is not None and getattr(profile, key) is None:
            setattr(profile, key, incoming)
            updated += 1

    merged_groups = _merge_buying_groups(profile.buying_groups, row.get("buying_groups"))
    if merged_groups is not None and merged_groups != profile.buying_groups:
        profile.buying_groups = merged_groups
        updated += 1

    merged_associations = _merge_associations(profile.associations, row.get("associations"))
    if merged_associations is not None and merged_associations != profile.associations:
        profile.associations = merged_associations
        updated += 1

    return updated


async def main(force: bool, preview_limit: int) -> None:
    rows, parse_counts = _parse_rows(CSV_PATH)
    _log(f"Parsed {parse_counts['parsed_rows']} rows from {CSV_PATH.name}")
    if parse_counts["skipped_missing_company"]:
        _log(f"Skipped {parse_counts['skipped_missing_company']} rows with no company name")

    if not rows:
        _log("Nothing to import.")
        return

    async with async_session() as session:
        leads = (
            await session.execute(select(Lead).options(selectinload(Lead.profile)).order_by(Lead.id))
        ).scalars().all()
        by_domain, by_name = _build_indexes(leads)
        _log(f"Loaded {len(leads)} existing leads for matching")

        stats: Counter = Counter()
        previews: list[str] = []

        for row in rows:
            stats["rows_seen"] += 1

            lead: Lead | None = None
            match_type: str | None = None
            filled_domain = False

            domain = row.get("domain")
            name_key = row.get("company_key")

            if domain:
                domain_matches = by_domain.get(domain, [])
                if len(domain_matches) == 1:
                    lead = domain_matches[0]
                    match_type = "domain"
                elif len(domain_matches) > 1:
                    stats["ambiguous_domain_matches"] += 1
                    if len(previews) < preview_limit:
                        previews.append(
                            f"skip line {row['source_line']} ambiguous domain match: "
                            f"{row['company']} [{domain}]"
                        )
                    continue

            if lead is None and name_key:
                name_matches = by_name.get(name_key, [])
                if len(name_matches) == 1:
                    lead = name_matches[0]
                    match_type = "name"
                elif len(name_matches) > 1:
                    stats["ambiguous_name_matches"] += 1
                    if len(previews) < preview_limit:
                        previews.append(
                            f"skip line {row['source_line']} ambiguous name match: {row['company']}"
                        )
                    continue

            if lead is None:
                lead = Lead(
                    company=row["company"],
                    domain=row.get("domain"),
                    user_id=None,
                )
                session.add(lead)
                await session.flush()

                profile = LeadCompanyProfile(lead_id=lead.id)
                session.add(profile)
                lead.profile = profile
                await session.flush()

                if domain:
                    by_domain[domain].append(lead)
                if name_key:
                    by_name[name_key].append(lead)

                field_updates = _apply_row_to_profile(profile, row)
                stats["created_leads"] += 1
                stats["created_profiles"] += 1
                stats["profile_field_updates"] += field_updates
                if len(previews) < preview_limit:
                    previews.append(
                        f"create lead {row['company']}"
                        + (f" [{domain}]" if domain else "")
                    )
                continue

            stats[f"matched_by_{match_type}"] += 1

            if lead.domain is None and domain is not None:
                lead.domain = domain
                if domain not in by_domain or lead not in by_domain[domain]:
                    by_domain[domain].append(lead)
                stats["lead_domains_filled"] += 1
                filled_domain = True
            elif (
                match_type == "name"
                and domain is not None
                and lead.domain is not None
                and normalize_domain(lead.domain) != domain
            ):
                stats["name_match_domain_conflicts"] += 1
                if len(previews) < preview_limit:
                    previews.append(
                        "skip name/domain conflict "
                        f"{row['company']} [csv={domain}, existing={normalize_domain(lead.domain)}]"
                    )
                continue

            if lead.profile is None:
                lead.profile = LeadCompanyProfile(lead_id=lead.id)
                session.add(lead.profile)
                await session.flush()
                stats["created_profiles"] += 1

            field_updates = _apply_row_to_profile(lead.profile, row)
            stats["profile_field_updates"] += field_updates

            if len(previews) < preview_limit:
                action = f"match {match_type} {row['company']}"
                details: list[str] = []
                if field_updates:
                    details.append(f"{field_updates} profile updates")
                if filled_domain and lead.domain is not None and domain is not None:
                    details.append(f"domain={domain}")
                if details:
                    action += " (" + ", ".join(details) + ")"
                previews.append(action)

        _log(
            "Summary: "
            f"create={stats['created_leads']}, "
            f"match_domain={stats['matched_by_domain']}, "
            f"match_name={stats['matched_by_name']}, "
            f"profiles_created={stats['created_profiles']}, "
            f"profile_updates={stats['profile_field_updates']}, "
            f"lead_domains_filled={stats['lead_domains_filled']}, "
            f"ambiguous_domain={stats['ambiguous_domain_matches']}, "
            f"ambiguous_name={stats['ambiguous_name_matches']}, "
            f"name_domain_conflicts={stats['name_match_domain_conflicts']}"
        )

        if previews:
            _log("Preview:")
            for item in previews:
                _log(f"  {item}")

        if force:
            await session.commit()
            _log("Import committed.")
        else:
            await session.rollback()
            _log("Dry run only. Re-run with --force to write changes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Load Niflheim.csv into leads and lead_company_profiles."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Actually write changes. Without this flag, runs as dry-run.",
    )
    parser.add_argument(
        "--preview-limit",
        type=int,
        default=15,
        help="How many sample actions to print in the summary.",
    )
    args = parser.parse_args()

    async def _run() -> None:
        try:
            await main(force=args.force, preview_limit=args.preview_limit)
        finally:
            await db_engine.dispose()

    asyncio.run(_run())
