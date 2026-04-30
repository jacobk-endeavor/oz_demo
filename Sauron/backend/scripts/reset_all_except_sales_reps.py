"""Truncate all companies, meetings, meeting recordings, people, and deals.

Keeps sales_reps and sales_rep_calendars intact.

Usage:
    # Dry-run (shows what would be truncated):
    uv run python scripts/reset_all_except_sales_reps.py

    # Actually truncate:
    uv run python scripts/reset_all_except_sales_reps.py --force
"""

import argparse
import asyncio
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.config import settings
from app.database import engine as db_engine

TARGET_TABLES = [
    # Meeting junction tables
    "meeting_company",
    "meeting_person",
    "meeting_sales_rep",
    # Meeting recording junction tables
    "meeting_recording_company",
    "meeting_recording_person",
    "meeting_recording_sales_rep",
    # Deal junction tables
    "deal_participants",
    # Company junction tables
    "company_industry_group",
    "pe_group_company",
    "company_hubspot_ids",
    "entity_domains",
    # People-related child tables
    "positions",
    "event_visits_company",
    "event_visits_person",
    "donations",
    # Core entity tables
    "meeting_recordings",
    "meetings",
    "deals",
    "people",
    "companies",
    # AskElephant sync state (stale once recordings are wiped)
    "ask_elephant_sync_state",
    "ask_elephant_sync_failures",
]

PRESERVED_TABLES = [
    "sales_reps",
    "sales_rep_calendars",
]


def _log(message: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[reset-all {ts}] {message}", flush=True)


def _redact_database_url(database_url: str) -> str:
    parsed = urlsplit(database_url)
    if not parsed.netloc or "@" not in parsed.netloc:
        return database_url
    credentials, host_part = parsed.netloc.rsplit("@", 1)
    username = credentials.split(":", 1)[0] if ":" in credentials else credentials
    safe_netloc = f"{username}:***@{host_part}"
    return urlunsplit(
        (parsed.scheme, safe_netloc, parsed.path, parsed.query, parsed.fragment)
    )


async def _get_existing_tables(engine: AsyncEngine) -> set[str]:
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            )
        )
        return {row[0] for row in result}


async def _get_row_counts(
    engine: AsyncEngine, tables: list[str]
) -> dict[str, int]:
    counts: dict[str, int] = {}
    async with engine.connect() as conn:
        for table in tables:
            result = await conn.execute(text(f"SELECT count(*) FROM {table}"))
            counts[table] = result.scalar() or 0
    return counts


async def _truncate_tables(engine: AsyncEngine, tables: list[str]) -> None:
    sql = f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE"
    async with engine.begin() as conn:
        await conn.execute(text(sql))


async def main(force: bool, engine: AsyncEngine) -> None:
    _log("Using database URL from backend/.env via app.config settings")
    _log(f"Configured database_url: {_redact_database_url(settings.database_url)}")

    existing = await _get_existing_tables(engine)
    tables_to_truncate = [t for t in TARGET_TABLES if t in existing]
    missing = [t for t in TARGET_TABLES if t not in existing]

    if not tables_to_truncate:
        _log("No matching tables found. Nothing to do.")
        return

    counts = await _get_row_counts(engine, tables_to_truncate)

    _log(f"Tables to truncate ({len(tables_to_truncate)}):")
    for t in tables_to_truncate:
        _log(f"  {t}: {counts[t]} rows")
    if missing:
        _log(f"Not found (skipped): {', '.join(missing)}")

    _log(f"Preserved (untouched): {', '.join(PRESERVED_TABLES)}")

    if not force:
        _log("DRY RUN — re-run with --force to execute truncation.")
        return

    _log("Truncating...")
    await _truncate_tables(engine, tables_to_truncate)
    _log("Done. All data wiped except sales_reps and sales_rep_calendars.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Truncate all companies, meetings, meeting recordings, people, "
            "and deals. Keeps sales_reps and sales_rep_calendars."
        )
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Actually execute TRUNCATE. Without this flag, script runs as dry-run.",
    )
    args = parser.parse_args()

    async def _run() -> None:
        try:
            await main(force=args.force, engine=db_engine)
        finally:
            await db_engine.dispose()

    asyncio.run(_run())
