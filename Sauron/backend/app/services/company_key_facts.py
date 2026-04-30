from __future__ import annotations

import asyncio
import json
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.company_pipeline import KEY_FACTS_PIPELINE_STAGES
from app.config import settings
from app.models.associations import meeting_company
from app.models.company import Company
from app.models.meeting import Meeting
from app.models.meeting_recording import MeetingRecording
from app.repositories.company_repo import CompanyRepo
from app.repositories.meeting_recording_repo import (
    TranscriptSource,
    MeetingRecordingRepo,
)
from app.services._backfill_utils import backfill_batch, run_periodic_backfill
from app.services._openrouter import chat_completion, extract_content, get_client
from app.services.company_summary import load_company_meeting_context
from app.services._transcript_utils import render_transcript_blocks

logger = logging.getLogger(__name__)

_MAX_CONCURRENCY = 5
_MODEL = "openai/gpt-5.4"
_SEMAPHORE = asyncio.Semaphore(_MAX_CONCURRENCY)

_KEY_FACTS_SCHEMA = {
    "type": "object",
    "properties": {
        "products_of_interest": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": [
                    "Order Entry",
                    "Quoting",
                    "Price Optimization",
                    "Accounts Payable",
                    "Accounts Receivable",
                    "Sales Analytics",
                    "Other",
                ],
            },
            "description": "Products the prospect indicated interest in.",
        },
        "other_products_detail": {
            "type": "string",
            "description": (
                "If 'Other' is in products_of_interest, describe what other "
                "products or capabilities they expressed interest in. "
                "Empty string if not applicable."
            ),
        },
        "order_entry_volume": {
            "anyOf": [{"type": "number"}, {"type": "null"}],
            "description": (
                "Annual volume for order entry as a number, converted to per-year "
                "(e.g. if they said 500/day, return 125000). "
                "Only if a volume figure was explicitly stated. null if not stated."
            ),
        },
        "accounts_payable_volume": {
            "anyOf": [{"type": "number"}, {"type": "null"}],
            "description": (
                "Annual volume for accounts payable as a number, converted to per-year. "
                "Only if a volume figure was explicitly stated. null if not stated."
            ),
        },
        "accounts_receivable_volume": {
            "anyOf": [{"type": "number"}, {"type": "null"}],
            "description": (
                "Annual volume for accounts receivable as a number, converted to per-year. "
                "Only if a volume figure was explicitly stated. null if not stated."
            ),
        },
        "annual_revenue": {
            "anyOf": [{"type": "number"}, {"type": "null"}],
            "description": (
                "The company's annual revenue in USD as a number "
                "(e.g. 220000000 for $220M). ONLY if explicitly stated in the "
                "transcripts. Do NOT make up a number. null if not stated."
            ),
        },
        "key_contact_name": {
            "type": "string",
            "description": "Name of the primary person we are talking to on their team.",
        },
        "key_contact_description": {
            "type": "string",
            "description": "Role, title, and brief description of the key contact.",
        },
        "main_concerns": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Main concerns or objections raised by the prospect, as bullet points.",
        },
        "main_selling_points": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Main selling points or positive signals from the conversations "
                "that the sales team should lean into."
            ),
        },
        "erp_system": {
            "type": "string",
            "description": (
                "ERP system the prospect is currently using. "
                "Empty string if not mentioned."
            ),
        },
        "actively_migrating_erp": {
            "type": "boolean",
            "description": "Whether the prospect is actively migrating ERP systems.",
        },
        "next_step": {
            "type": "string",
            "description": "The next concrete step for this deal.",
        },
        "deal_stage": {
            "type": "string",
            "enum": list(KEY_FACTS_PIPELINE_STAGES),
            "description": (
                "Classification of the current deal stage. "
                "Use 'Dead' only when there is clear evidence the prospect is no longer interested, "
                "not merely because activity has slowed down. "
                "Use 'Disqualified' when the company does not appear to be a real Endeavor buying opportunity "
                "or the conversations are for some other purpose besides selling to them."
            ),
        },
    },
    "required": [
        "products_of_interest",
        "other_products_detail",
        "order_entry_volume",
        "accounts_payable_volume",
        "accounts_receivable_volume",
        "annual_revenue",
        "key_contact_name",
        "key_contact_description",
        "main_concerns",
        "main_selling_points",
        "erp_system",
        "actively_migrating_erp",
        "next_step",
        "deal_stage",
    ],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "You extract structured key facts about a company from sales call transcripts. "
    "Use the provided transcripts as the primary evidence base. "
    "You may also use the current date and the full list of meetings tied to the company "
    "to classify deal_stage and understand what is booked next. "
    "Use 'Dead' only when the evidence suggests the prospect is no longer interested or the deal is effectively over. "
    "Do not use 'Dead' for a deal that is merely quiet or waiting on follow-up. "
    "Use 'Disqualified' when the company is not actually a fit or buyer for Endeavor, "
    "or when the conversations are happening for a non-selling purpose rather than trying to close them. "
    "If a field was not discussed or mentioned, use an empty string for text fields, "
    "an empty array for list fields, or false for boolean fields. "
    "Do not guess or hallucinate values. "
    "For numeric fields like annual revenue and volumes, only use figures that were "
    "explicitly stated in the transcripts. Do NOT estimate or make up numbers. "
    "Convert stated figures to a per-year basis (e.g. '500 orders/day' becomes "
    "'~125,000 orders/year'), but never invent numbers that weren't mentioned at all."
)


class CompanyKeyFactsGenerationError(RuntimeError):
    """Raised when key facts extraction fails for operational reasons."""


async def generate_company_key_facts(
    *,
    company_name: str,
    transcript_sources: list[TranscriptSource],
    meeting_context: str | None = None,
) -> dict | None:
    if get_client() is None:
        return None
    if not transcript_sources:
        return None

    transcript_blocks = render_transcript_blocks(transcript_sources)
    if not transcript_blocks:
        return None

    try:
        async with _SEMAPHORE:
            response = await chat_completion(
                model=_MODEL,
                temperature=0,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            f"Company: {company_name}\n\n"
                            "Below are sales call transcripts for this company. "
                            "Each call includes an explicit call date and a "
                            "transcript delimited by markers.\n\n"
                            + (
                                f"--- CURRENT DATE AND COMPANY MEETINGS ---\n{meeting_context}\n\n"
                                if meeting_context
                                else ""
                            )
                            + f"{transcript_blocks}"
                        ),
                    },
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "company_key_facts",
                        "strict": True,
                        "schema": _KEY_FACTS_SCHEMA,
                    },
                },
                extra_body={"transforms": ["middle-out"]},
            )
    except Exception as exc:
        logger.exception("Failed extracting key facts for company=%s", company_name)
        raise CompanyKeyFactsGenerationError(
            f"OpenRouter key facts extraction failed for company={company_name}"
        ) from exc

    raw = extract_content(response)
    if not raw:
        raise CompanyKeyFactsGenerationError(
            f"OpenRouter returned empty key facts for company={company_name}"
        )

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise CompanyKeyFactsGenerationError(
            f"OpenRouter returned invalid JSON for company={company_name}: {raw[:200]}"
        ) from exc

    return parsed


async def refresh_company_key_facts(db: AsyncSession, company_id: int) -> bool:
    company_repo = CompanyRepo(db)
    company = await company_repo.get_by_id(company_id)
    if company is None:
        return False

    recording_repo = MeetingRecordingRepo(db)
    transcript_sources = await recording_repo.list_company_transcript_sources(
        company_id
    )
    meeting_context = await load_company_meeting_context(db, company_id)
    key_facts = await generate_company_key_facts(
        company_name=company.name,
        transcript_sources=transcript_sources,
        meeting_context=meeting_context,
    )
    if not key_facts:
        return False
    if company.key_facts == key_facts:
        return False

    company.key_facts = key_facts
    await company_repo.commit()
    return True


# ---------------------------------------------------------------------------
# Backfill helpers
# ---------------------------------------------------------------------------

_BACKFILL_LABEL = "company-key-facts-backfill"


async def list_company_ids_needing_key_facts(
    db: AsyncSession, *, include_existing: bool = False
) -> list[int]:
    """Return company IDs that have transcripts but (optionally) no key_facts."""
    filters = [
        MeetingRecording.transcript.is_not(None),
        func.length(func.trim(MeetingRecording.transcript)) > 0,
    ]
    if not include_existing:
        filters.append(Company.key_facts.is_(None))
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


async def backfill_missing_company_key_facts() -> dict[str, int]:
    """One-shot: extract key facts for every company that has transcripts but no key_facts."""
    return await backfill_batch(
        fetch_ids=list_company_ids_needing_key_facts,
        refresh_one=refresh_company_key_facts,
        label=_BACKFILL_LABEL,
        max_concurrency=_MAX_CONCURRENCY,
    )


async def run_periodic_company_key_facts_backfill(
    *, run_immediately: bool = True
) -> None:
    await run_periodic_backfill(
        run_backfill=backfill_missing_company_key_facts,
        label=_BACKFILL_LABEL,
        interval_seconds=settings.company_key_facts_backfill_interval_seconds,
        run_immediately=run_immediately,
    )
