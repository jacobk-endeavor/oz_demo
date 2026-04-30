"""Rerun company summaries for all companies with meetings.

Usage:
    uv run python scripts/backfill_company_summaries_with_meetings.py
    uv run python scripts/backfill_company_summaries_with_meetings.py --stats-only
    uv run python scripts/backfill_company_summaries_with_meetings.py --max-concurrency 5
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


async def _refresh_one(company_id: int) -> tuple[int, bool, str | None]:
    try:
        async with async_session() as db:
            updated = await refresh_company_summary_for_company(db, company_id)
        return company_id, updated, None
    except Exception as exc:
        return company_id, False, str(exc)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rerun company summaries for all companies with meetings."
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
            print(f"Company summary backfill stats: with_meetings={len(company_ids)}")

            if args.stats_only:
                return

            if not company_ids:
                print("Nothing to do.")
                return

            if not settings.openrouter_api_key:
                raise RuntimeError("OPENROUTER_API_KEY is empty; cannot run backfill.")

            semaphore = asyncio.Semaphore(max(1, args.max_concurrency))

            async def _bounded(company_id: int) -> tuple[int, bool, str | None]:
                async with semaphore:
                    return await _refresh_one(company_id)

            tasks = [asyncio.create_task(_bounded(company_id)) for company_id in company_ids]

            updated = 0
            unchanged = 0
            failed = 0

            progress = tqdm(total=len(tasks), desc="Company summaries", unit="company")
            try:
                for task in asyncio.as_completed(tasks):
                    _, was_updated, error = await task
                    if error:
                        failed += 1
                    elif was_updated:
                        updated += 1
                    else:
                        unchanged += 1
                    progress.update(1)
            finally:
                progress.close()

            print(
                "Backfill complete: "
                f"targeted={len(company_ids)} "
                f"updated={updated} "
                f"unchanged={unchanged} "
                f"failed={failed}"
            )
        finally:
            await db_engine.dispose()

    asyncio.run(_run())


if __name__ == "__main__":
    main()
