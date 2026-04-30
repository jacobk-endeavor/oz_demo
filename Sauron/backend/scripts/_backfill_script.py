"""Shared scaffolding for CLI backfill scripts.

Each backfill script provides two thin callbacks (list and refresh) and calls
``run_backfill_cli`` which handles argparse, concurrency, progress bars, and
stats reporting.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import Awaitable, Callable
from pathlib import Path

from tqdm import tqdm

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings
from app.database import engine as db_engine


def run_backfill_cli(
    *,
    list_ids: Callable[[bool], Awaitable[list[int]]],
    refresh_one: Callable[[int], Awaitable[tuple[int, bool, str | None]]],
    label: str,
    description: str,
    stats_all_label: str = "with_transcripts",
    stats_missing_label: str = "missing",
    max_concurrency: int = 5,
) -> None:
    """Parse CLI args, print stats, and optionally run a backfill."""
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "--stats-only",
        action="store_true",
        help="Print counts only; do not process.",
    )
    parser.add_argument(
        "--include-existing",
        action="store_true",
        help="Reprocess all items, including those already completed.",
    )
    args = parser.parse_args()

    async def _main() -> None:
        try:
            all_ids = await list_ids(True)
            missing_ids = await list_ids(False)
            print(
                f"{label} stats: "
                f"{stats_all_label}={len(all_ids)} "
                f"{stats_missing_label}={len(missing_ids)}"
            )

            if args.stats_only:
                return

            target_ids = all_ids if args.include_existing else missing_ids
            if not target_ids:
                print("Nothing to do.")
                return

            if not settings.openrouter_api_key:
                raise RuntimeError(
                    "OPENROUTER_API_KEY is empty; cannot run backfill."
                )

            semaphore = asyncio.Semaphore(max_concurrency)

            async def _bounded(eid: int) -> tuple[int, bool, str | None]:
                async with semaphore:
                    return await refresh_one(eid)

            tasks = [asyncio.create_task(_bounded(eid)) for eid in target_ids]

            updated = 0
            unchanged = 0
            failed = 0

            progress = tqdm(total=len(tasks), desc=label, unit="item")
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
                f"Backfill complete: targeted={len(target_ids)} "
                f"updated={updated} unchanged={unchanged} failed={failed}"
            )
        finally:
            await db_engine.dispose()

    asyncio.run(_main())
