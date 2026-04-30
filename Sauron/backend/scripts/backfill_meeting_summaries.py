import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import async_session
from app.services.meeting_summary import (
    list_meeting_ids_needing_summary,
    refresh_meeting_summary_for_meeting,
)
from scripts._backfill_script import run_backfill_cli


async def _list_ids(include_existing: bool) -> list[int]:
    async with async_session() as db:
        return await list_meeting_ids_needing_summary(
            db, include_existing=include_existing
        )


async def _refresh_one(meeting_id: int) -> tuple[int, bool, str | None]:
    try:
        async with async_session() as db:
            updated = await refresh_meeting_summary_for_meeting(db, meeting_id)
            return meeting_id, updated, None
    except Exception as exc:
        return meeting_id, False, str(exc)


if __name__ == "__main__":
    run_backfill_cli(
        list_ids=_list_ids,
        refresh_one=_refresh_one,
        label="Meeting summaries",
        description="Generate meeting summaries from meeting recording transcripts.",
        stats_all_label="with_transcripts",
        stats_missing_label="missing_summary",
    )
