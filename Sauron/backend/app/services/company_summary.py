from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.associations import company_email_company, meeting_company
from app.models.company import Company
from app.models.company_email import CompanyEmail
from app.models.meeting import Meeting
from app.models.meeting_recording import MeetingRecording
from app.repositories.company_repo import CompanyRepo
from app.repositories.meeting_recording_repo import (
    TranscriptSource,
    MeetingRecordingRepo,
)
from app.services._backfill_utils import backfill_batch, run_periodic_backfill
from app.services._openrouter import chat_completion, extract_content, get_client
from app.services._transcript_utils import render_transcript_blocks

logger = logging.getLogger(__name__)

_MAX_CONCURRENT_SUMMARIES = 5
_SUMMARY_MODEL = "anthropic/claude-sonnet-4.6"
_SUMMARY_REQUEST_SEMAPHORE = asyncio.Semaphore(5)


class CompanySummaryGenerationError(RuntimeError):
    """Raised when summary generation fails for operational reasons."""


def _compact_text(value: str | None, *, limit: int = 400) -> str:
    if not value:
        return ""
    compacted = " ".join(value.split())
    if len(compacted) <= limit:
        return compacted
    return compacted[: limit - 3].rstrip() + "..."


def current_date_label(now: datetime | None = None) -> str:
    reference = now or datetime.now(timezone.utc)
    return reference.astimezone(timezone.utc).strftime("%Y-%m-%d")


async def load_company_email_context(
    db: AsyncSession,
    company_id: int,
) -> str:
    rows = (
        await db.execute(
            select(CompanyEmail)
            .join(
                company_email_company,
                company_email_company.c.company_email_id == CompanyEmail.id,
            )
            .where(company_email_company.c.company_id == company_id)
            .order_by(CompanyEmail.occurred_at.desc(), CompanyEmail.id.desc())
        )
    ).scalars().all()

    if not rows:
        return ""

    lines = [
        "Below are all emails tied to this company. Use them as supplemental context",
        "alongside the meeting transcripts for account status, stakeholders, risks,",
        "objections, and next steps. Prefer the most recent dated evidence when there",
        "is a conflict, and do not invent details beyond the transcripts and emails.",
        "",
    ]

    for email in rows:
        occurred_at = (
            email.occurred_at.strftime("%Y-%m-%d") if email.occurred_at else "Unknown date"
        )
        direction = getattr(email.direction, "value", str(email.direction))
        to_emails = ", ".join(email.to_emails or []) or "Unknown recipients"
        subject = _compact_text(email.subject or "", limit=160) or "(No subject)"
        lines.append(
            f"- [{occurred_at}] {direction.upper()} | Subject: {subject}"
        )
        lines.append(f"  From: {email.from_email or 'Unknown sender'}")
        lines.append(f"  To: {to_emails}")
        thread_summary = _compact_text(email.hubspot_thread_summary, limit=320)
        if thread_summary:
            lines.append(f"  Thread summary: {thread_summary}")
        body_preview = _compact_text(email.body_preview, limit=320)
        if body_preview:
            lines.append(f"  Body preview: {body_preview}")
        lines.append("")

    return "\n".join(lines).strip()


async def load_company_meeting_context(
    db: AsyncSession,
    company_id: int,
    *,
    now: datetime | None = None,
) -> str:
    rows = (
        await db.execute(
            select(Meeting)
            .join(meeting_company, meeting_company.c.meeting_id == Meeting.id)
            .where(meeting_company.c.company_id == company_id)
            .order_by(
                Meeting.start_at.desc().nullslast(),
                Meeting.id.desc(),
            )
        )
    ).scalars().all()

    today = current_date_label(now)
    if not rows:
        return f"Current date: {today}\nNo meetings are tied to this company."

    lines = [
        f"Current date: {today}",
        "Below are all meetings tied to this company, including past and future bookings.",
        "Use them to reason about recency, next steps, and whether anything is scheduled.",
        "",
    ]

    for meeting in rows:
        start_label = (
            meeting.start_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            if meeting.start_at
            else "No scheduled time"
        )
        status = "Cancelled" if meeting.cancelled_at else (
            "Upcoming" if meeting.start_at and meeting.start_at >= (now or datetime.now(timezone.utc)) else "Past"
        )
        lines.append(f"- [{status}] {start_label} | {meeting.title}")
        if meeting.duration_minutes:
            lines.append(f"  Duration: {meeting.duration_minutes} minutes")
        if meeting.location:
            lines.append(f"  Location: {_compact_text(meeting.location, limit=200)}")
        if meeting.summary:
            lines.append(f"  Summary: {_compact_text(meeting.summary, limit=280)}")
        lines.append("")

    return "\n".join(lines).strip()


async def generate_company_summary(
    *,
    company_name: str,
    transcript_sources: list[TranscriptSource],
    email_context: str | None = None,
    meeting_context: str | None = None,
) -> str | None:
    if get_client() is None:
        return None
    if not transcript_sources:
        return None

    transcript_blocks = render_transcript_blocks(transcript_sources)
    if not transcript_blocks:
        return None

    try:
        async with _SUMMARY_REQUEST_SEMAPHORE:
            response = await chat_completion(
                model=_SUMMARY_MODEL,
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You summarize account-level meeting activity for a CRM profile. "
                            "Use the provided meeting transcripts as the primary evidence base. "
                            "You may also use the provided company email context as supplemental evidence. "
                            "You may also use the provided current date and full company meeting list "
                            "to reason about recency and future bookings. "
                            "Do not invent facts beyond the supplied transcripts and emails. "
                            "Format the output in Markdown. Start with a Markdown title for the company, "
                            "then use Markdown section headers for each section below.\n\n"
                            "1. **Account Status** — Classify as one of: New Lead, Open, Closed, Dead. "
                            "If there has been no meeting or email activity in the last 14 days "
                            "relative to the current date, and nothing is booked in the future, "
                            "classify the account as Dead. "
                            "Briefly justify based on the conversation tone, next steps, and engagement level.\n\n"
                            "2. **Main Champion** — Identify the primary internal champion driving the deal on the prospect side.\n\n"
                            "3. **People Involved** — List every person mentioned or participating, with their role/title if known.\n\n"
                            "4. **Call Analysis**\n"
                            "   - **Objections** — What objections were raised by the prospect?\n"
                            "   - **Risks** — What are the risks to closing this deal?\n"
                            "   - **Key Factors** — What are the key factors influencing the decision?\n"
                            "   - **What to Lean Into** — Nuggets from the calls that the sales team should emphasize going forward. "
                            "These are positive signals, strong reactions, or moments of excitement that should be revisited in follow-ups.\n"
                            "   - **Prospect Concerns & Rebuttals** — What specific concerns were raised "
                            "(e.g. company age, data quality, integration timelines) and suggested rebuttals to address each one.\n\n"
                            "5. **Action Items** — Concrete next steps for the sales team."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Company: {company_name}\n\n"
                            "Below are calls for this company. Each call includes an explicit "
                            "call date and a transcript delimited by markers.\n\n"
                            f"{transcript_blocks}"
                            + (
                                f"\n\n--- CURRENT DATE AND COMPANY MEETINGS ---\n{meeting_context}"
                                if meeting_context
                                else ""
                            )
                            + (
                                f"\n\n--- EMAIL CONTEXT ---\n{email_context}"
                                if email_context
                                else ""
                            )
                        ),
                    },
                ],
                extra_body={"transforms": ["middle-out"]},
            )
    except Exception as exc:
        logger.exception(
            "Failed generating company summary for company=%s", company_name
        )
        raise CompanySummaryGenerationError(
            f"OpenRouter summary generation failed for company={company_name}"
        ) from exc

    generated_summary = extract_content(response)
    if not generated_summary:
        raise CompanySummaryGenerationError(
            f"OpenRouter returned an empty summary for company={company_name}"
        )

    return generated_summary


async def refresh_company_summary_for_company(
    db: AsyncSession, company_id: int
) -> bool:
    company_repo = CompanyRepo(db)
    company = await company_repo.get_by_id(company_id)
    if company is None:
        return False

    recording_repo = MeetingRecordingRepo(db)
    transcript_sources = await recording_repo.list_company_transcript_sources(
        company_id
    )
    meeting_context = await load_company_meeting_context(db, company_id)
    email_context = await load_company_email_context(db, company_id)
    summary = await generate_company_summary(
        company_name=company.name,
        transcript_sources=transcript_sources,
        email_context=email_context,
        meeting_context=meeting_context,
    )
    if not summary:
        return False
    if company.summary == summary:
        return False

    company.summary = summary
    await company_repo.commit()
    return True


# ---------------------------------------------------------------------------
# Backfill helpers
# ---------------------------------------------------------------------------

_BACKFILL_LABEL = "company-summary-backfill"


async def list_company_ids_needing_summary(
    db: AsyncSession, *, include_existing: bool = False
) -> list[int]:
    """Return company IDs that have transcripts but (optionally) no summary."""
    filters = [
        MeetingRecording.transcript.is_not(None),
        func.length(func.trim(MeetingRecording.transcript)) > 0,
    ]
    if not include_existing:
        filters.append(
            or_(
                Company.summary.is_(None),
                func.length(func.trim(Company.summary)) == 0,
            )
        )
    result = await db.execute(
        select(Company.id)
        .join(meeting_company, meeting_company.c.company_id == Company.id)
        .join(Meeting, Meeting.id == meeting_company.c.meeting_id)
        .join(MeetingRecording, MeetingRecording.meeting_id == Meeting.id)
        .where(*filters)
        .distinct()
        .order_by(Company.id.asc())
    )
    return [cid for cid in result.scalars().all() if cid is not None]


async def backfill_missing_company_summaries() -> dict[str, int]:
    """One-shot: generate summaries for every company that has transcripts but no summary."""
    return await backfill_batch(
        fetch_ids=list_company_ids_needing_summary,
        refresh_one=refresh_company_summary_for_company,
        label=_BACKFILL_LABEL,
        max_concurrency=_MAX_CONCURRENT_SUMMARIES,
    )


async def run_periodic_company_summary_backfill(
    *, run_immediately: bool = True
) -> None:
    await run_periodic_backfill(
        run_backfill=backfill_missing_company_summaries,
        label=_BACKFILL_LABEL,
        interval_seconds=settings.company_summary_backfill_interval_seconds,
        run_immediately=run_immediately,
    )
