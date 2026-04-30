"""Load leads from BDR_Sheet_Filtered.csv into the leads table.

By default runs as dry-run (prints what would be inserted).
Pass --force to actually insert rows.
"""

import argparse
import asyncio
import csv
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.database import engine as db_engine, async_session
from app.lead_profile_taxonomy import (
    normalize_buying_groups,
    normalize_lead_company_type,
    normalize_lead_industry,
)
from app.models.lead import Lead, LeadCompanyProfile
from app.models.enums import ERP

CSV_PATH = Path(__file__).resolve().parent.parent / "BDR_Sheet_Filtered.csv"

ERP_ALIASES: dict[str, ERP] = {
    "prophet 21": ERP.EPICOR_PROPHET_21,
    "eclipse": ERP.EPICOR_ECLIPSE,
}


def _log(msg: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[load-bdr-leads {ts}] {msg}", flush=True)


def _safe_int(val: str) -> int | None:
    if not val:
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _match_erp(raw: str) -> ERP | None:
    """Return the first recognised ERP from a potentially comma-separated value."""
    if not raw:
        return None
    for part in raw.split(","):
        erp = ERP_ALIASES.get(part.strip().lower())
        if erp:
            return erp
    return None


def _parse_rows(path: Path) -> list[dict]:
    rows: list[dict] = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            company = row.get("company", "").strip()
            if not company:
                continue
            raw_primary_industry = row.get("primary industry", "").strip() or None

            rows.append({
                "company": company,
                "revenue_m": row.get("revenue_tier", "").strip() or None,
                "erp": _match_erp(row.get("erp", "")),
                "num_erp_users": _safe_int(row.get("num of users", "")),
                "num_locations": _safe_int(row.get("Num of Locations", "") or row.get("# locations", "")),
                "buying_groups": normalize_buying_groups(
                    row.get("primary buying group", "").strip() or None,
                    row.get("other buying group", "").strip() or None,
                ),
                "associations": row.get("associations", "").strip() or None,
                "primary_industry": normalize_lead_industry(raw_primary_industry),
                "company_type": normalize_lead_company_type(raw_primary_industry),
            })
    return rows


async def main(force: bool) -> None:
    rows = _parse_rows(CSV_PATH)
    _log(f"Parsed {len(rows)} rows from {CSV_PATH.name}")

    if not rows:
        _log("Nothing to insert.")
        return

    # Preview first 5 rows
    for i, r in enumerate(rows[:5]):
        _log(f"  sample [{i}]: {r}")
    if len(rows) > 5:
        _log(f"  ... and {len(rows) - 5} more")

    # Check for existing leads
    async with async_session() as session:
        result = await session.execute(select(Lead.id))
        existing_count = len(result.all())
    _log(f"Existing leads in DB: {existing_count}")

    erp_counts = {}
    for r in rows:
        erp_val = r["erp"]
        key = erp_val.value if erp_val else "(none)"
        erp_counts[key] = erp_counts.get(key, 0) + 1
    _log(f"ERP breakdown: {erp_counts}")

    fields_populated = {k: 0 for k in rows[0]}
    for r in rows:
        for k, v in r.items():
            if v is not None:
                fields_populated[k] += 1
    _log(f"Fields populated: {fields_populated}")

    if not force:
        _log("Dry run only. Re-run with --force to execute inserts.")
        return

    _log("Inserting leads...")
    async with async_session() as session:
        lead_fields = {"company", "revenue_m", "erp"}
        for r in rows:
            lead = Lead(company=r["company"])
            session.add(lead)
            await session.flush()
            profile_data = {k: v for k, v in r.items() if k != "company"}
            profile_data["lead_id"] = lead.id
            session.add(LeadCompanyProfile(**profile_data))
        await session.commit()
    _log(f"Inserted {len(rows)} leads. Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load BDR leads from CSV into the leads table.")
    parser.add_argument("--force", action="store_true", help="Actually insert. Without this flag, runs as dry-run.")
    args = parser.parse_args()

    async def _run() -> None:
        try:
            await main(force=args.force)
        finally:
            await db_engine.dispose()

    asyncio.run(_run())
