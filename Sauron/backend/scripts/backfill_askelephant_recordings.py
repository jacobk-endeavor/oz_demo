import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings
from app.database import async_session, engine as db_engine
from app.services.ask_elephant_sync import AskElephantSyncer


def _terminal(message: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[askelephant-backfill {ts}] {message}", flush=True)


class BackfillStats:
    def __init__(self) -> None:
        self.pages_scanned = 0
        self.engagements_seen = 0
        self.engagements_missing_id = 0
        self.already_present = 0
        self.would_backfill = 0
        self.would_reprocess_existing = 0
        self.backfilled = 0
        self.reprocessed_existing = 0
        self.failed = 0


async def run_backfill(
    *,
    force: bool,
    max_pages: int | None,
    start_cursor: str | None,
    include_existing: bool,
    stop_after_consecutive_known_pages: int | None,
) -> None:
    if not settings.ask_elephant_api_key:
        raise RuntimeError("ASK_ELEPHANT_API_KEY is empty")

    stats = BackfillStats()
    consecutive_known_pages = 0
    cursor = start_cursor

    if not force:
        _terminal("Dry run only. Re-run with --force to persist changes.")

    async with async_session() as db:
        async with httpx.AsyncClient(
            base_url=settings.ask_elephant_base_url.rstrip("/"),
            timeout=30.0,
        ) as client:
            syncer = AskElephantSyncer(db, client)

            while True:
                params: dict[str, str] = {"sortDirection": "desc"}
                if cursor:
                    params["cursor"] = cursor

                page = await syncer._request_json(  # noqa: SLF001
                    "GET",
                    "v1/meetings/export",
                    params=params,
                )

                stats.pages_scanned += 1
                engagements = page.get("engagements", [])
                page_had_unseen = False

                for engagement in engagements:
                    stats.engagements_seen += 1
                    engagement_id = engagement.get("engagementId")
                    if not engagement_id:
                        stats.engagements_missing_id += 1
                        continue

                    exists = await syncer._recording_repo.exists_by_engagement_id(  # noqa: SLF001
                        engagement_id
                    )
                    if exists:
                        stats.already_present += 1
                        if not include_existing:
                            continue

                        if force:
                            ok = await syncer._process_engagement(engagement)  # noqa: SLF001
                            if ok:
                                stats.reprocessed_existing += 1
                            else:
                                stats.failed += 1
                        else:
                            stats.would_reprocess_existing += 1
                        continue

                    page_had_unseen = True
                    if force:
                        ok = await syncer._process_engagement(engagement)  # noqa: SLF001
                        if ok:
                            stats.backfilled += 1
                        else:
                            stats.failed += 1
                    else:
                        stats.would_backfill += 1

                if page_had_unseen:
                    consecutive_known_pages = 0
                else:
                    consecutive_known_pages += 1

                if stats.pages_scanned % 10 == 0:
                    _terminal(
                        "Progress: "
                        f"pages={stats.pages_scanned} "
                        f"seen={stats.engagements_seen} "
                        f"existing={stats.already_present} "
                        f"{'backfilled' if force else 'would_backfill'}="
                        f"{stats.backfilled if force else stats.would_backfill} "
                        f"failed={stats.failed}"
                    )

                cursor = page.get("nextCursor")
                if not cursor:
                    _terminal("Reached end of AskElephant pagination (no nextCursor).")
                    break

                if max_pages is not None and stats.pages_scanned >= max_pages:
                    _terminal(f"Stopping after max_pages={max_pages}.")
                    break

                if (
                    stop_after_consecutive_known_pages is not None
                    and consecutive_known_pages >= stop_after_consecutive_known_pages
                ):
                    _terminal(
                        "Stopping after "
                        f"{stop_after_consecutive_known_pages} consecutive fully-known page(s)."
                    )
                    break

    _terminal("Backfill complete.")
    _terminal(
        "Summary: "
        f"pages_scanned={stats.pages_scanned} "
        f"engagements_seen={stats.engagements_seen} "
        f"engagements_missing_id={stats.engagements_missing_id} "
        f"already_present={stats.already_present} "
        f"{'backfilled' if force else 'would_backfill'}="
        f"{stats.backfilled if force else stats.would_backfill} "
        f"{'reprocessed_existing' if force else 'would_reprocess_existing'}="
        f"{stats.reprocessed_existing if force else stats.would_reprocess_existing} "
        f"failed={stats.failed}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Backfill AskElephant meeting recordings by scanning paginated "
            "meetings/export history and upserting unseen engagements."
        )
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Persist changes. Without this flag, the script runs in dry-run mode.",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Optional cap on number of pages to scan (default: scan until no nextCursor).",
    )
    parser.add_argument(
        "--start-cursor",
        type=str,
        default=None,
        help="Optional AskElephant cursor to resume scanning from.",
    )
    parser.add_argument(
        "--include-existing",
        action="store_true",
        help=(
            "Also reprocess already-ingested engagements (useful to re-attempt "
            "meeting linkage on existing unlinked rows)."
        ),
    )
    parser.add_argument(
        "--stop-after-consecutive-known-pages",
        type=int,
        default=None,
        help=(
            "Optional early stop after N consecutive pages with no unseen engagement. "
            "Leave unset to scan until end (or max-pages)."
        ),
    )
    args = parser.parse_args()

    if args.max_pages is not None and args.max_pages <= 0:
        parser.error("--max-pages must be greater than 0 when provided.")
    if (
        args.stop_after_consecutive_known_pages is not None
        and args.stop_after_consecutive_known_pages <= 0
    ):
        parser.error(
            "--stop-after-consecutive-known-pages must be greater than 0 when provided."
        )

    async def _run() -> None:
        try:
            await run_backfill(
                force=args.force,
                max_pages=args.max_pages,
                start_cursor=args.start_cursor,
                include_existing=args.include_existing,
                stop_after_consecutive_known_pages=(
                    args.stop_after_consecutive_known_pages
                ),
            )
        finally:
            await db_engine.dispose()

    asyncio.run(_run())
