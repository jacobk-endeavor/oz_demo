"""Rerun company summaries and key facts for all companies with meetings.

Usage:
    uv run python scripts/backfill_company_summary_and_key_facts.py
    uv run python scripts/backfill_company_summary_and_key_facts.py --stats-only
    uv run python scripts/backfill_company_summary_and_key_facts.py --max-concurrency 5
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import select
from tqdm import tqdm

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings
from app.database import async_session, engine as db_engine
from app.models.associations import meeting_company
from app.models.company import Company
from app.services.company_key_facts import refresh_company_key_facts
from app.services.company_summary import refresh_company_summary_for_company


async def _list_company_ids_with_meetings() -> list[int]:
    async with async_session() as db:
        result = await db.execute(
            select(Company.id)
            .join(meeting_company, meeting_company.c.company_id == Company.id)
            .distinct()
            .order_by(Company.id.asc())
        )
        return [company_id for company_id in result.scalars().all() if company_id is not None]


async def _refresh_one(
    company_id: int,
) -> tuple[int, bool, bool, str | None]:
    try:
        async with async_session() as db:
            summary_updated = await refresh_company_summary_for_company(db, company_id)
            key_facts_updated = await refresh_company_key_facts(db, company_id)
        return company_id, summary_updated, key_facts_updated, None
    except Exception as exc:
        return company_id, False, False, str(exc)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rerun company summaries and key facts for companies with meetings."
    )
    parser.add_argument(
        "--stats-only",
        action="store_true",
        help="Print counts only; do not process.",
    )
    parser.add_argument(
        "--max-concurrency",
        type=int,
        default=5,
        help="Maximum number of companies to process concurrently (default: 5).",
    )
    args = parser.parse_args()

    async def _run() -> None:
        try:
            company_ids = await _list_company_ids_with_meetings()
            print(f"Company summary + key facts backfill stats: with_meetings={len(company_ids)}")

            if args.stats_only:
                return

            if not company_ids:
                print("Nothing to do.")
                return

            if not settings.openrouter_api_key:
                raise RuntimeError("OPENROUTER_API_KEY is empty; cannot run backfill.")

            semaphore = asyncio.Semaphore(max(1, args.max_concurrency))

            async def _bounded(company_id: int) -> tuple[int, bool, bool, str | None]:
                async with semaphore:
                    return await _refresh_one(company_id)

            tasks = [asyncio.create_task(_bounded(company_id)) for company_id in company_ids]

            summary_updated = 0
            key_facts_updated = 0
            both_updated = 0
            unchanged = 0
            failed = 0

            progress = tqdm(total=len(tasks), desc="Company summaries + key facts", unit="company")
            try:
                for task in asyncio.as_completed(tasks):
                    _, summary_changed, key_facts_changed, error = await task
                    if error:
                        failed += 1
                    else:
                        if summary_changed:
                            summary_updated += 1
                        if key_facts_changed:
                            key_facts_updated += 1
                        if summary_changed and key_facts_changed:
                            both_updated += 1
                        elif not summary_changed and not key_facts_changed:
                            unchanged += 1
                    progress.update(1)
            finally:
                progress.close()

            print(
                "Backfill complete: "
                f"targeted={len(company_ids)} "
                f"summary_updated={summary_updated} "
                f"key_facts_updated={key_facts_updated} "
                f"both_updated={both_updated} "
                f"unchanged={unchanged} "
                f"failed={failed}"
            )
        finally:
            await db_engine.dispose()

    asyncio.run(_run())


if __name__ == "__main__":
    main()
