"""Export Tier 2 leads in a revenue band to JSON.

Defaults to leads whose annual revenue is between $300M and $3B inclusive.

Usage:
    uv run python scripts/export_tier2_revenue_leads.py
    uv run python scripts/export_tier2_revenue_leads.py --output exports/tier2_leads.json
    uv run python scripts/export_tier2_revenue_leads.py --min-revenue-m 500 --max-revenue-m 2500
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import selectinload

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import async_session, engine as db_engine
from app.models.enums import LeadTier
from app.models.lead import Lead, LeadCompanyProfile

_REVENUE_PATTERN = re.compile(
    r"^(?P<value>\d+(?:\.\d+)?)\s*(?P<suffix>b|bn|billion|m|mm|million)?$",
    re.IGNORECASE,
)

def _parse_decimal_arg(raw: str) -> Decimal:
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise argparse.ArgumentTypeError(f"Invalid decimal value: {raw!r}") from exc
    if value < 0:
        raise argparse.ArgumentTypeError("Revenue bounds must be non-negative.")
    return value


def _decimal_to_string(value: Decimal) -> str:
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def _parse_revenue_m(raw: str | None) -> Decimal | None:
    """Parse revenue strings into millions of USD."""
    if raw is None:
        return None

    cleaned = raw.strip()
    if not cleaned:
        return None

    cleaned = cleaned.replace(",", "")
    cleaned = cleaned.replace("$", "")
    cleaned = re.sub(r"\busd\b", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)

    match = _REVENUE_PATTERN.fullmatch(cleaned)
    if match is None:
        try:
            return Decimal(cleaned)
        except InvalidOperation:
            return None

    value = Decimal(match.group("value"))
    suffix = (match.group("suffix") or "").lower()
    if suffix in {"b", "bn", "billion"}:
        return value * Decimal("1000")
    return value


def _display_user_name(first_name: str | None, last_name: str | None) -> str | None:
    full_name = " ".join(part for part in [first_name, last_name] if part)
    return full_name or None


def _lead_to_row(lead: Lead, revenue_m_numeric: Decimal) -> dict[str, str | int | None]:
    profile = lead.profile
    strategic_context = lead.strategic_context
    user = lead.user
    if profile is None:
        raise ValueError(f"Lead {lead.id} has no profile loaded.")

    return {
        "lead_id": lead.id,
        "company": lead.company,
        "domain": lead.domain,
        "assigned_user_id": lead.user_id,
        "assigned_user_email": user.email if user else None,
        "assigned_user_name": (
            _display_user_name(user.first_name, user.last_name) if user else None
        ),
        "tier": profile.type.value if profile.type else None,
        "revenue_m_raw": profile.revenue_m,
        "revenue_m_numeric": _decimal_to_string(revenue_m_numeric),
        "erp": profile.erp.value if profile.erp else None,
        "primary_industry": (
            profile.primary_industry.value if profile.primary_industry else None
        ),
        "company_type": profile.company_type.value if profile.company_type else None,
        "num_erp_users": profile.num_erp_users,
        "num_locations": profile.num_locations,
        "employee_count": profile.employee_count,
        "hq_address": profile.hq_address,
        "hq_phone": profile.hq_phone,
        "hq_timezone": profile.hq_timezone,
        "company_background": (
            strategic_context.company_background if strategic_context else None
        ),
    }


async def _fetch_matching_rows(
    min_revenue_m: Decimal, max_revenue_m: Decimal
) -> tuple[list[dict[str, str | int | None]], int, int]:
    stmt = (
        select(Lead)
        .join(LeadCompanyProfile, LeadCompanyProfile.lead_id == Lead.id)
        .options(
            selectinload(Lead.profile),
            selectinload(Lead.strategic_context),
            selectinload(Lead.user),
        )
        .where(
            LeadCompanyProfile.type == LeadTier.TIER_2,
            LeadCompanyProfile.revenue_m.is_not(None),
        )
        .order_by(Lead.company.asc())
    )

    async with async_session() as db:
        leads = (await db.execute(stmt)).scalars().all()

    rows: list[dict[str, str | int | None]] = []
    skipped_unparseable = 0
    for lead in leads:
        profile = lead.profile
        if profile is None:
            continue

        revenue_m_numeric = _parse_revenue_m(profile.revenue_m)
        if revenue_m_numeric is None:
            skipped_unparseable += 1
            continue
        if revenue_m_numeric < min_revenue_m or revenue_m_numeric > max_revenue_m:
            continue

        rows.append(_lead_to_row(lead, revenue_m_numeric))

    return rows, len(leads), skipped_unparseable


def _write_json(path: Path, rows: list[dict[str, str | int | None]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(rows, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


async def _main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Export Tier 2 leads whose annual revenue falls within a given "
            "USD-millions range."
        )
    )
    parser.add_argument(
        "--min-revenue-m",
        type=_parse_decimal_arg,
        default=Decimal("300"),
        help="Minimum annual revenue in USD millions, inclusive (default: 300).",
    )
    parser.add_argument(
        "--max-revenue-m",
        type=_parse_decimal_arg,
        default=Decimal("3000"),
        help="Maximum annual revenue in USD millions, inclusive (default: 3000).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=BACKEND_ROOT / "tier2_leads_300m_to_3b.json",
        help="Where to write the JSON (default: tier2_leads_300m_to_3b.json).",
    )
    args = parser.parse_args()

    if args.min_revenue_m > args.max_revenue_m:
        raise SystemExit("--min-revenue-m cannot be greater than --max-revenue-m.")

    try:
        rows, tier2_with_revenue_count, skipped_unparseable = await _fetch_matching_rows(
            min_revenue_m=args.min_revenue_m,
            max_revenue_m=args.max_revenue_m,
        )

        output_path = args.output.resolve()
        _write_json(output_path, rows)

        print(
            f"Tier 2 leads with non-empty revenue: {tier2_with_revenue_count}. "
            f"Skipped {skipped_unparseable} unparseable revenue value(s)."
        )
        print(
            "Matched "
            f"{len(rows)} lead(s) with revenue between "
            f"{_decimal_to_string(args.min_revenue_m)}M and "
            f"{_decimal_to_string(args.max_revenue_m)}M inclusive."
        )
        print(f"Wrote JSON to {output_path}")
    finally:
        await db_engine.dispose()


if __name__ == "__main__":
    asyncio.run(_main())
