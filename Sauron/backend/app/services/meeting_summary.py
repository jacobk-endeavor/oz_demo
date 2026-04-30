from __future__ import annotations

import asyncio
import logging

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.meeting import Meeting
from app.models.meeting_recording import MeetingRecording
from app.repositories.meeting_recording_repo import (
    MeetingRecordingRepo,
    TranscriptSource,
)
from app.repositories.meeting_repo import MeetingRepo
from app.services._backfill_utils import backfill_batch, run_periodic_backfill
from app.services._openrouter import chat_completion, extract_content, get_client
from app.services._transcript_utils import render_transcript_blocks

logger = logging.getLogger(__name__)

_MAX_CONCURRENCY = 5
_SUMMARY_MODEL = "anthropic/claude-sonnet-4.6"
_SUMMARY_SEMAPHORE = asyncio.Semaphore(_MAX_CONCURRENCY)


class MeetingSummaryGenerationError(RuntimeError):
    """Raised when meeting summary generation fails for operational reasons."""


async def generate_meeting_summary(
    *,
    meeting_title: str,
    transcript_sources: list[TranscriptSource],
) -> str | None:
    if get_client() is None:
        return None
    if not transcript_sources:
        return None

    transcript_blocks = render_transcript_blocks(
        transcript_sources, include_ids_in_delimiter=True
    )
    if not transcript_blocks:
        return None

    try:
        async with _SUMMARY_SEMAPHORE:
            response = await chat_completion(
                model=_SUMMARY_MODEL,
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You summarize meeting calls for an internal CRM. "
                            "Use only the provided transcript evidence. "
                            "Return plain text markdown with the following sections:\n\n"
                            "1. **People on the Call** — List every person who participated or was mentioned, "
                            "with their role/title if known.\n\n"
                            "2. **Overview** — A 3-sentence summary of what was discussed.\n\n"
                            "3. **Call Analysis**\n"
                            "   - **Objections** — What objections were raised by the prospect?\n"
                            "   - **Risks** — What are the risks here?\n"
                            "   - **Key Factors** — What are the key factors influencing the decision?\n"
                            "   - **What to Lean Into** — Positive signals, strong reactions, or moments of "
                            "excitement that the sales team should emphasize in follow-ups.\n"
                            "   - **Prospect Concerns & Rebuttals** — Specific concerns raised "
                            "(e.g. company age, data quality, integration timelines) and suggested rebuttals "
                            "to address each one.\n\n"
                            "4. **Key Stats & Numbers** — Any concrete figures stated in the meeting such as "
                            "number of orders, number of quotes, compensation figures, revenue numbers, "
                            "or which specific products they are interested in.\n\n"
                            "5. **Next Steps** — Concrete action items coming out of the call."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Meeting title: {meeting_title}\n\n"
                            "Below are call transcript blocks for this meeting. "
                            "Each block includes the explicit call date and strict transcript delimiters.\n\n"
                            f"{transcript_blocks}"
                        ),
                    },
                ],
            )
    except Exception as exc:
        logger.exception(
            "Failed generating meeting summary for meeting=%s", meeting_title
        )
        raise MeetingSummaryGenerationError(
            f"OpenRouter meeting summary generation failed for meeting={meeting_title}"
        ) from exc

    generated_summary = extract_content(response)
    if not generated_summary:
        raise MeetingSummaryGenerationError(
            f"OpenRouter returned an empty meeting summary for meeting={meeting_title}"
        )
    return generated_summary


async def refresh_meeting_summary_for_meeting(
    db: AsyncSession, meeting_id: int
) -> bool:
    meeting_repo = MeetingRepo(db)
    meeting = await meeting_repo.get_by_id(meeting_id)
    if meeting is None:
        return False

    recording_repo = MeetingRecordingRepo(db)
    transcript_sources = await recording_repo.list_meeting_transcript_sources(
        meeting_id
    )
    summary = await generate_meeting_summary(
        meeting_title=meeting.title,
        transcript_sources=transcript_sources,
    )
    if not summary:
        return False
    if meeting.summary == summary:
        return False

    meeting.summary = summary
    await meeting_repo.commit()
    return True


_BACKFILL_LABEL = "meeting-summary-backfill"


async def list_meeting_ids_needing_summary(
    db: AsyncSession, *, include_existing: bool = False
) -> list[int]:
    """Return meeting IDs that have transcripts but (optionally) no summary."""
    filters = [
        MeetingRecording.transcript.is_not(None),
        func.length(func.trim(MeetingRecording.transcript)) > 0,
    ]
    if not include_existing:
        filters.append(
            or_(
                Meeting.summary.is_(None),
                func.length(func.trim(Meeting.summary)) == 0,
            )
        )
    result = await db.execute(
        select(Meeting.id)
        .join(MeetingRecording, MeetingRecording.meeting_id == Meeting.id)
        .where(*filters)
        .distinct()
        .order_by(Meeting.id.asc())
    )
    return [mid for mid in result.scalars().all() if mid is not None]


async def backfill_missing_meeting_summaries() -> dict[str, int]:
    """One-shot: generate summaries for every meeting that has transcripts but no summary."""
    return await backfill_batch(
        fetch_ids=list_meeting_ids_needing_summary,
        refresh_one=refresh_meeting_summary_for_meeting,
        label=_BACKFILL_LABEL,
        max_concurrency=_MAX_CONCURRENCY,
    )


async def run_periodic_meeting_summary_backfill(
    *, run_immediately: bool = True
) -> None:
    await run_periodic_backfill(
        run_backfill=backfill_missing_meeting_summaries,
        label=_BACKFILL_LABEL,
        interval_seconds=settings.meeting_summary_backfill_interval_seconds,
        run_immediately=run_immediately,
    )
