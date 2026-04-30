"""Load Midgard companies into leads with Tier 2 profiles.

By default this runs as a dry-run and reports what would be created/updated.
Pass --force to write changes to the database.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import async_session, engine as db_engine
from app.models.enums import LeadTier
from app.models.lead import Lead, LeadCompanyProfile

CSV_PATH = BACKEND_ROOT / "Midgard - Final.csv"


def _log(message: str) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    print(f"[load-midgard-leads {timestamp}] {message}", flush=True)


def _normalize_company(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.split()).strip()
    return cleaned or None


def _company_key(value: str | None) -> str | None:
    company = _normalize_company(value)
    return company.casefold() if company else None


def _parse_rows(path: Path) -> tuple[list[dict[str, str]], Counter]:
    rows: list[dict[str, str]] = []
    counts: Counter = Counter()
    seen: set[str] = set()

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for line_no, raw in enumerate(reader, start=2):
            company = _normalize_company(raw.get("Company"))
            if company is None:
                counts["skipped_missing_company"] += 1
                continue

            key = _company_key(company)
            if key is None:
                counts["skipped_missing_company"] += 1
                continue
            if key in seen:
                counts["skipped_duplicate_company"] += 1
                continue

            seen.add(key)
            rows.append({
                "source_line": str(line_no),
                "company": company,
                "company_key": key,
            })

    counts["parsed_rows"] = len(rows)
    return rows, counts


def _build_name_index(leads: list[Lead]) -> dict[str, list[Lead]]:
    by_name: dict[str, list[Lead]] = defaultdict(list)
    for lead in leads:
        key = _company_key(lead.company)
        if key:
            by_name[key].append(lead)
    return by_name


async def main(force: bool, preview_limit: int) -> None:
    rows, parse_counts = _parse_rows(CSV_PATH)
    _log(f"Parsed {parse_counts['parsed_rows']} unique companies from {CSV_PATH.name}")
    if parse_counts["skipped_duplicate_company"]:
        _log(f"Skipped {parse_counts['skipped_duplicate_company']} duplicate company rows")
    if parse_counts["skipped_missing_company"]:
        _log(f"Skipped {parse_counts['skipped_missing_company']} rows with no company name")

    if not rows:
        _log("Nothing to import.")
        return

    async with async_session() as session:
        leads = (
            await session.execute(select(Lead).options(selectinload(Lead.profile)).order_by(Lead.id))
        ).scalars().all()
        by_name = _build_name_index(leads)
        _log(f"Loaded {len(leads)} existing leads for company-name matching")

        stats: Counter = Counter()
        previews: list[str] = []

        for row in rows:
            stats["rows_seen"] += 1
            company = row["company"]
            company_key = row["company_key"]
            matches = by_name.get(company_key, [])

            if not matches:
                lead = Lead(company=company)
                session.add(lead)
                await session.flush()

                profile = LeadCompanyProfile(lead_id=lead.id, type=LeadTier.TIER_2)
                session.add(profile)
                lead.profile = profile

                by_name[company_key].append(lead)
                stats["created_leads"] += 1
                stats["created_profiles"] += 1
                if len(previews) < preview_limit:
                    previews.append(f"create {company} -> Tier 2")
                continue

            stats["matched_company_groups"] += 1
            if len(matches) > 1:
                stats["matched_duplicate_name_groups"] += 1

            changed = False
            for lead in matches:
                stats["matched_existing_leads"] += 1
                if lead.profile is None:
                    lead.profile = LeadCompanyProfile(lead_id=lead.id)
                    session.add(lead.profile)
                    await session.flush()
                    stats["created_profiles"] += 1
                    changed = True

                if lead.profile.type != LeadTier.TIER_2:
                    lead.profile.type = LeadTier.TIER_2
                    stats["tier_updates"] += 1
                    changed = True
                else:
                    stats["already_tier_2"] += 1

            if changed and len(previews) < preview_limit:
                previews.append(f"update {company} -> Tier 2 ({len(matches)} lead match{'es' if len(matches) != 1 else ''})")
            elif not changed and len(previews) < preview_limit:
                previews.append(f"skip {company} (already Tier 2)")

        for preview in previews:
            _log(f"  {preview}")
        if len(rows) > len(previews):
            _log(f"  ... and {len(rows) - len(previews)} more")

        _log(
            "Summary: "
            f"rows_seen={stats['rows_seen']}, "
            f"created_leads={stats['created_leads']}, "
            f"matched_company_groups={stats['matched_company_groups']}, "
            f"matched_existing_leads={stats['matched_existing_leads']}, "
            f"created_profiles={stats['created_profiles']}, "
            f"tier_updates={stats['tier_updates']}, "
            f"already_tier_2={stats['already_tier_2']}, "
            f"matched_duplicate_name_groups={stats['matched_duplicate_name_groups']}"
        )

        if force:
            await session.commit()
            _log("Committed changes.")
        else:
            await session.rollback()
            _log("Dry run only. Re-run with --force to write changes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Load Midgard companies into leads with Tier 2 profiles."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Actually write changes to the database. Without this flag, runs as a dry-run.",
    )
    parser.add_argument(
        "--preview-limit",
        type=int,
        default=10,
        help="Number of example actions to print.",
    )
    args = parser.parse_args()

    async def _run() -> None:
        try:
            await main(force=args.force, preview_limit=max(args.preview_limit, 0))
        finally:
            await db_engine.dispose()

    asyncio.run(_run())
