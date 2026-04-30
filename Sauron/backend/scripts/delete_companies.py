"""Delete companies and their associated entity_domain rows by company ID.

Cascades through all referencing tables (entity_domains, meeting_company,
positions, deals, event_visits_company, etc.).

Usage:
    # Dry-run (shows what would be deleted):
    uv run python scripts/delete_companies.py 2913 3318

    # Actually delete:
    uv run python scripts/delete_companies.py 2913 3318 --force
"""

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import delete, select, text

from app.database import async_session, engine as db_engine
from app.models.company import Company
from app.models.entity_domain import EntityDomain


def _log(message: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[delete-companies {ts}] {message}", flush=True)


REFERENCING_TABLES = [
    ("company_hubspot_ids", "company_id"),
    ("entity_domains", "company_id"),
    ("meeting_company", "company_id"),
    ("meeting_recording_company", "company_id"),
    ("company_industry_group", "company_id"),
    ("pe_group_company", "company_id"),
    ("positions", "company_id"),
    ("deals", "company_id"),
    ("event_visits_company", "company_id"),
]


async def main(company_ids: list[int], force: bool) -> None:
    async with async_session() as db:
        result = await db.execute(
            select(Company).where(Company.id.in_(company_ids))
        )
        companies = {c.id: c for c in result.scalars().all()}

        ed_result = await db.execute(
            select(EntityDomain).where(EntityDomain.company_id.in_(company_ids))
        )
        domains = list(ed_result.scalars().all())

        missing = set(company_ids) - set(companies.keys())
        if missing:
            _log(f"WARNING: company IDs not found in DB: {sorted(missing)}")

        if not companies:
            _log("No matching companies found. Nothing to do.")
            return

        _log(f"Companies to delete ({len(companies)}):")
        for cid, c in sorted(companies.items()):
            _log(f"  id={cid}  name={c.name!r}")

        _log(f"Associated domains ({len(domains)}):")
        for ed in sorted(domains, key=lambda e: e.domain):
            _log(f"  entity_domain_id={ed.id}  domain={ed.domain}  company_id={ed.company_id}")

        ref_counts: dict[str, int] = {}
        for table, col in REFERENCING_TABLES:
            row = await db.execute(
                text(f"SELECT count(*) FROM {table} WHERE {col} = ANY(:ids)"),
                {"ids": list(companies.keys())},
            )
            count = row.scalar()
            if count:
                ref_counts[table] = count

        if ref_counts:
            _log("Rows in referencing tables that will be deleted:")
            for table, count in sorted(ref_counts.items()):
                _log(f"  {table}: {count}")
        else:
            _log("No rows in referencing tables.")

        if not force:
            _log("DRY RUN — re-run with --force to execute deletions.")
            return

        _log("Deleting referencing rows...")
        for table, col in REFERENCING_TABLES:
            await db.execute(
                text(f"DELETE FROM {table} WHERE {col} = ANY(:ids)"),
                {"ids": list(companies.keys())},
            )

        _log("Deleting companies...")
        await db.execute(delete(Company).where(Company.id.in_(list(companies.keys()))))
        await db.commit()
        _log(f"Done. Deleted {len(companies)} company/companies.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Delete companies (and all referencing rows) by ID."
    )
    parser.add_argument(
        "ids",
        nargs="+",
        type=int,
        help="Company IDs to delete.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Actually execute deletions. Without this flag, script runs as dry-run.",
    )
    args = parser.parse_args()

    async def _run() -> None:
        try:
            await main(company_ids=args.ids, force=args.force)
        finally:
            await db_engine.dispose()

    asyncio.run(_run())
