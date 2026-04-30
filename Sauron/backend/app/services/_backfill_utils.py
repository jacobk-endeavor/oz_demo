from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session

logger = logging.getLogger(__name__)


def terminal(label: str, msg: str) -> None:
    """Print a timestamped log line to stdout for backfill visibility."""
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[{label} {ts}] {msg}", flush=True)


async def backfill_batch(
    *,
    fetch_ids: Callable[[AsyncSession], Awaitable[list[int]]],
    refresh_one: Callable[[AsyncSession, int], Awaitable[bool]],
    label: str,
    max_concurrency: int = 5,
) -> dict[str, int]:
    """Run *refresh_one* concurrently for every ID returned by *fetch_ids*."""
    async with async_session() as db:
        entity_ids = await fetch_ids(db)

    if not entity_ids:
        return {"targeted": 0, "updated": 0, "failed": 0}

    terminal(label, f"Found {len(entity_ids)} item(s) to process: {entity_ids}")

    semaphore = asyncio.Semaphore(max_concurrency)
    total = len(entity_ids)

    async def _bounded(eid: int, idx: int) -> tuple[int, bool, str | None]:
        async with semaphore:
            try:
                async with async_session() as db:
                    updated = await refresh_one(db, eid)
                    status = "updated" if updated else "unchanged"
                    terminal(label, f"  [{idx}/{total}] id={eid} → {status}")
                    return eid, updated, None
            except Exception as exc:
                logger.exception("Backfill failed for %s id=%s", label, eid)
                terminal(label, f"  [{idx}/{total}] id={eid} → FAILED: {exc}")
                return eid, False, str(exc)

    tasks = [
        asyncio.create_task(_bounded(eid, i))
        for i, eid in enumerate(entity_ids, 1)
    ]
    updated = 0
    failed = 0
    for coro in asyncio.as_completed(tasks):
        _, was_updated, error = await coro
        if error:
            failed += 1
        elif was_updated:
            updated += 1

    return {"targeted": len(entity_ids), "updated": updated, "failed": failed}


async def run_periodic_backfill(
    *,
    run_backfill: Callable[[], Awaitable[dict[str, int]]],
    label: str,
    interval_seconds: int,
    run_immediately: bool = True,
) -> None:
    """Infinite loop: call *run_backfill* then sleep until next tick."""
    interval_seconds = max(interval_seconds, 30)
    first_iteration = True
    while True:
        if first_iteration and not run_immediately:
            terminal(label, f"Waiting {interval_seconds}s before first scan")
            await asyncio.sleep(interval_seconds)
        first_iteration = False

        terminal(label, "Scanning for items to process")
        started = datetime.now(timezone.utc)
        try:
            result = await run_backfill()
            targeted, up, fail = (
                result["targeted"],
                result["updated"],
                result["failed"],
            )
            elapsed = (datetime.now(timezone.utc) - started).total_seconds()
            if targeted > 0:
                terminal(
                    label,
                    f"Tick done in {elapsed:.1f}s: "
                    f"{targeted} targeted, {up} updated, "
                    f"{targeted - up - fail} unchanged, {fail} failed",
                )
            else:
                terminal(label, f"Tick done in {elapsed:.1f}s: all up to date")
        except asyncio.CancelledError:
            terminal(label, "Periodic loop cancelled")
            raise
        except Exception:
            elapsed = (datetime.now(timezone.utc) - started).total_seconds()
            logger.exception("%s backfill loop failed", label)
            terminal(label, f"Tick FAILED after {elapsed:.1f}s; will retry next tick")

        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        sleep_seconds = max(interval_seconds - elapsed, 0)
        terminal(label, f"Sleeping {sleep_seconds:.0f}s until next scan")
        await asyncio.sleep(sleep_seconds)
