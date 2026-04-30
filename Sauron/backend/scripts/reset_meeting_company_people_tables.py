import argparse
import asyncio
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.config import settings
from app.database import engine as db_engine


TARGET_TABLES = [
    # Meeting tables and meeting relation tables
    "meeting_company",
    "meeting_person",
    "meeting_sales_rep",
    "meetings",
    # Meeting recording tables and relation tables
    "meeting_recording_sales_rep",
    "meeting_recording_person",
    "meeting_recording_company",
    "meeting_recordings",
    # Core entities requested
    "people",
    "companies",
]


def _terminal(message: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[db-reset {ts}] {message}", flush=True)


def _redact_database_url(database_url: str) -> str:
    parsed = urlsplit(database_url)
    if not parsed.netloc or "@" not in parsed.netloc:
        return database_url

    credentials, host_part = parsed.netloc.rsplit("@", 1)
    if ":" in credentials:
        username = credentials.split(":", 1)[0]
    else:
        username = credentials
    safe_netloc = f"{username}:***@{host_part}"
    return urlunsplit(
        (parsed.scheme, safe_netloc, parsed.path, parsed.query, parsed.fragment)
    )


async def _get_existing_tables(db_engine: AsyncEngine) -> set[str]:
    async with db_engine.connect() as conn:
        result = await conn.execute(
            text(
                """
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                """
            )
        )
        return {row[0] for row in result}


async def _truncate_tables(db_engine: AsyncEngine, tables: list[str]) -> None:
    if not tables:
        _terminal("No matching tables found to truncate.")
        return

    sql = f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE"
    async with db_engine.begin() as conn:
        await conn.execute(text(sql))


async def main(force: bool, db_engine: AsyncEngine) -> None:
    _terminal("Using database URL from backend/.env via app.config settings")
    _terminal(f"Configured database_url: {_redact_database_url(settings.database_url)}")

    existing = await _get_existing_tables(db_engine)
    tables_to_truncate = [table for table in TARGET_TABLES if table in existing]
    missing = [table for table in TARGET_TABLES if table not in existing]

    if not force:
        _terminal("Dry run only. Re-run with --force to execute truncate.")
        _terminal(f"Would truncate: {', '.join(tables_to_truncate) or '(none)'}")
        if missing:
            _terminal(f"Not found (skipped): {', '.join(missing)}")
        _terminal(
            "Note: TRUNCATE ... CASCADE may also clear dependent tables "
            "(e.g. positions, deals, donations, event_visits_person)."
        )
        return

    _terminal(f"Truncating: {', '.join(tables_to_truncate) or '(none)'}")
    if missing:
        _terminal(f"Not found (skipped): {', '.join(missing)}")

    await _truncate_tables(db_engine, tables_to_truncate)
    _terminal("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Truncate meeting/company/people tables (and meeting relation tables) "
            "and reset identities."
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
            await main(force=args.force, db_engine=db_engine)
        finally:
            await db_engine.dispose()

    asyncio.run(_run())
