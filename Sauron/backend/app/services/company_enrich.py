from __future__ import annotations

import re
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.enums import Vertical
from app.repositories.meeting_recording_repo import MeetingRecordingRepo
from app.services._chat_common import _ENRICH_ORG_TOOL, _WEB_SEARCH_TOOL
from app.services.company_key_facts import generate_company_key_facts
from app.services.company_summary import (
    generate_company_summary,
    load_company_email_context,
    load_company_meeting_context,
)
from app.services.lead_enrich import (
    _json_schema,
    _parse_json_output,
    _run_enrich_sse,
    _sse,
)

_VERTICAL_VALUES = tuple(item.value for item in Vertical)


@dataclass
class _CompanyTarget:
    id: int
    company: str
    domain: str | None = None


def _normalize_label(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.strip().lower()).strip()


_VERTICAL_ALIASES = {
    "building material": Vertical.BUILDING_MATERIALS,
    "building materials": Vertical.BUILDING_MATERIALS,
    "building supplies": Vertical.BUILDING_MATERIALS,
    "fluid power": Vertical.FLUID_POWER,
    "hvac": Vertical.HVAC,
    "industrial supplies": Vertical.INDUSTRIAL_SUPPLY,
    "industrial supply": Vertical.INDUSTRIAL_SUPPLY,
    "mro": Vertical.MRO,
    "packaging": Vertical.PACKAGING,
    "plumbing": Vertical.PLUMBING,
    "power transmission": Vertical.POWER_TRANSMISSION,
    "pvf": Vertical.PVF,
    "safety": Vertical.SAFETY_EQUIPMENT,
    "safety equipment": Vertical.SAFETY_EQUIPMENT,
}


def normalize_company_vertical(value: Vertical | str | None) -> Vertical | None:
    if value is None or value == "":
        return None
    if isinstance(value, Vertical):
        return value

    normalized = _normalize_label(value)
    if not normalized:
        return None

    for item in Vertical:
        if normalized == _normalize_label(item.value):
            return item
    return _VERTICAL_ALIASES.get(normalized)


def _normalize_count(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, float):
        return int(round(value)) if value > 0 else None
    if isinstance(value, str):
        cleaned = re.sub(r"[^\d.]", "", value)
        if not cleaned:
            return None
        try:
            parsed = float(cleaned)
        except ValueError:
            return None
        return int(round(parsed)) if parsed > 0 else None
    return None


def _normalize_annual_revenue(value: Any) -> int | None:
    return _normalize_count(value)


def _sanitize_linkedin_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if not cleaned.startswith(("http://", "https://")):
        cleaned = f"https://{cleaned.lstrip('/')}"
    parsed = urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    host = parsed.netloc.lower()
    host_no_www = host[4:] if host.startswith("www.") else host
    if host_no_www != "linkedin.com" and not host_no_www.endswith(".linkedin.com"):
        return None
    return urlunparse(
        parsed._replace(
            scheme="https",
            netloc=host_no_www,
            params="",
            query="",
            fragment="",
        )
    )


def _format_revenue_display(annual_revenue: int | None) -> str | None:
    if annual_revenue is None or annual_revenue <= 0:
        return None
    if annual_revenue >= 1_000_000_000:
        value = annual_revenue / 1_000_000_000
        suffix = "B"
    elif annual_revenue >= 1_000_000:
        value = annual_revenue / 1_000_000
        suffix = "M"
    elif annual_revenue >= 1_000:
        value = annual_revenue / 1_000
        suffix = "K"
    else:
        return f"${annual_revenue}"
    rendered = f"{value:.1f}".rstrip("0").rstrip(".")
    return f"${rendered}{suffix}"


def _build_company_context(company: Company) -> str:
    domains = [ed.domain for ed in company.entity_domains]
    lines = [f"Company: {company.name}"]
    if domains:
        lines.append(f"Known domains: {', '.join(domains)}")
    if company.vertical:
        lines.append(f"Current vertical: {company.vertical.value}")
    if company.annual_revenue:
        lines.append(f"Current annual revenue (USD): {company.annual_revenue}")
    elif company.revenue:
        lines.append(f"Current revenue display: {company.revenue}")
    if company.employee_count:
        lines.append(f"Current employee count: {company.employee_count}")
    if company.location_count:
        lines.append(f"Current location count: {company.location_count}")
    if company.linkedin:
        lines.append(f"Current LinkedIn: {company.linkedin}")
    if company.summary:
        lines.append(f"Current summary:\n{company.summary}")
    return "\n".join(lines)


_PROFILE_RESEARCH_PROMPT = """\
You are a research assistant refreshing a CRM company profile.

Research and return the best current values you can substantiate for:
- summary
- vertical
- annual_revenue
- employee_count
- location_count
- linkedin

Research strategy:
1. If a domain is already known, call enrich_organization early.
2. In parallel, run multiple web_search calls to find:
   - official website
   - about/company overview
   - products/services
   - headquarters and footprint
   - employee count
   - annual revenue
   - LinkedIn company page
3. If revenue or company scale is unclear, do focused follow-up searches until you
   have the best defensible annual revenue number you can find.
4. Refresh existing values when stronger current evidence is available.

Rules:
- summary must be Markdown and concise but CRM-friendly, around 250-450 words.
- Use sections where supported by evidence: Overview, Products & Services, Scale,
  Market Position, and History.
- vertical must be exactly one of the allowed labels if you can determine it;
  otherwise return null.
- annual_revenue must be an integer in USD, not a formatted string.
- employee_count and location_count must be integers when known.
- linkedin must be the full LinkedIn company URL when found, otherwise null.
- Prefer official company sources, investor materials, credible business profiles,
  and Apollo organization enrichment over weaker third-party snippets.
- Return only JSON matching the required schema.
"""

_PROFILE_JSON_SCHEMA = _json_schema(
    "company_profile_enrichment",
    {
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": "CRM-ready company summary in Markdown.",
            },
            "vertical": {
                "anyOf": [
                    {"type": "string", "enum": list(_VERTICAL_VALUES)},
                    {"type": "null"},
                ],
                "description": "Company vertical from the allowed taxonomy.",
            },
            "annual_revenue": {
                "anyOf": [{"type": "integer"}, {"type": "null"}],
                "description": "Annual revenue in USD as an integer.",
            },
            "employee_count": {
                "anyOf": [{"type": "integer"}, {"type": "null"}],
                "description": "Estimated total employees.",
            },
            "location_count": {
                "anyOf": [{"type": "integer"}, {"type": "null"}],
                "description": "Estimated number of locations, branches, or facilities.",
            },
            "linkedin": {
                "anyOf": [{"type": "string"}, {"type": "null"}],
                "description": "Full LinkedIn company URL.",
            },
        },
        "required": [
            "summary",
            "vertical",
            "annual_revenue",
            "employee_count",
            "location_count",
            "linkedin",
        ],
        "additionalProperties": False,
    },
)


def _render_company_profile_md(fields: dict[str, Any]) -> str:
    lines = ["---", "## Extracted Company Profile", ""]
    for key in (
        "summary",
        "vertical",
        "annual_revenue",
        "employee_count",
        "location_count",
        "linkedin",
    ):
        value = fields.get(key)
        lines.append(f"- **{key}:** {value if value is not None else '*not found*'}")
    lines.append("")
    return "\n".join(lines)


async def _persist_company_profile(
    db: AsyncSession,
    company: Company,
    fields: dict[str, Any],
) -> dict[str, int]:
    updated = 0

    def set_if_changed(key: str, value: Any) -> None:
        nonlocal updated
        if value is None:
            return
        if getattr(company, key) == value:
            return
        setattr(company, key, value)
        updated += 1

    summary = (fields.get("summary") or "").strip() or None
    vertical = normalize_company_vertical(fields.get("vertical"))
    annual_revenue = _normalize_annual_revenue(fields.get("annual_revenue"))
    employee_count = _normalize_count(fields.get("employee_count"))
    location_count = _normalize_count(fields.get("location_count"))
    linkedin = _sanitize_linkedin_url(fields.get("linkedin"))

    set_if_changed("summary", summary)
    set_if_changed("vertical", vertical)
    set_if_changed("annual_revenue", annual_revenue)
    set_if_changed("employee_count", employee_count)
    set_if_changed("location_count", location_count)
    set_if_changed("linkedin", linkedin)

    revenue_display = _format_revenue_display(annual_revenue)
    if revenue_display and company.revenue != revenue_display:
        company.revenue = revenue_display

    await db.commit()
    await db.refresh(company)
    return {"fields_updated": updated}


async def enrich_company_profile(
    *,
    company: Company,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    domains = [ed.domain for ed in company.entity_domains]
    messages = [
        {"role": "system", "content": _PROFILE_RESEARCH_PROMPT},
        {
            "role": "user",
            "content": (
                "Refresh this company profile with the best researched values you can "
                "find. Return updated data even if some fields already have values.\n\n"
                f"{_build_company_context(company)}"
            ),
        },
    ]

    target = _CompanyTarget(
        id=company.id,
        company=company.name,
        domain=domains[0] if domains else None,
    )

    async def persist(fields: dict[str, Any]) -> dict[str, int]:
        return await _persist_company_profile(db, company, fields)

    async for chunk in _run_enrich_sse(
        lead=target,
        messages=messages,
        response_format=_PROFILE_JSON_SCHEMA,
        parse=_parse_json_output,
        persist=persist,
        tools=[_WEB_SEARCH_TOOL, _ENRICH_ORG_TOOL],
        trace_kind="company_profile",
        trace_renderer=_render_company_profile_md,
    ):
        yield chunk


async def enrich_company_from_meetings(
    *,
    company: Company,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    yield _sse({"event": "started", "company": company.name})
    yield _sse({"event": "progress", "message": "Loading meeting transcripts..."})

    recording_repo = MeetingRecordingRepo(db)
    transcript_sources = await recording_repo.list_company_transcript_sources(company.id)
    if not transcript_sources:
        yield _sse(
            {
                "event": "error",
                "message": "This company has meetings, but none of them have transcripts yet.",
            }
        )
        yield "data: [DONE]\n\n"
        return

    try:
        meeting_context = await load_company_meeting_context(db, company.id)
        email_context = await load_company_email_context(db, company.id)
        yield _sse(
            {
                "event": "progress",
                "message": "Summarizing account status from meeting transcripts...",
            }
        )
        summary = await generate_company_summary(
            company_name=company.name,
            transcript_sources=transcript_sources,
            email_context=email_context,
            meeting_context=meeting_context,
        )
        if not summary:
            yield _sse(
                {
                    "event": "error",
                    "message": "Could not generate a company summary from the meeting transcripts.",
                }
            )
            yield "data: [DONE]\n\n"
            return

        yield _sse(
            {
                "event": "progress",
                "message": "Classifying deal stage and company key facts...",
            }
        )
        key_facts = await generate_company_key_facts(
            company_name=company.name,
            transcript_sources=transcript_sources,
            meeting_context=meeting_context,
        )
        if not key_facts:
            yield _sse(
                {
                    "event": "error",
                    "message": "Could not classify company key facts from the meeting transcripts.",
                }
            )
            yield "data: [DONE]\n\n"
            return
    except Exception:
        yield _sse(
            {
                "event": "error",
                "message": "Meeting-based enrichment failed. Please try again.",
            }
        )
        yield "data: [DONE]\n\n"
        return

    yield _sse({"event": "progress", "status": "saving"})

    summary_updated = company.summary != summary
    key_facts_updated = company.key_facts != key_facts
    if summary_updated:
        company.summary = summary
    if key_facts_updated:
        company.key_facts = key_facts

    if summary_updated or key_facts_updated:
        await db.commit()
        await db.refresh(company)

    yield _sse(
        {
            "event": "done",
            "mode": "meeting_classification",
            "summary_updated": summary_updated,
            "key_facts_updated": key_facts_updated,
            "artifacts_updated": int(summary_updated) + int(key_facts_updated),
        }
    )
    yield "data: [DONE]\n\n"


async def enrich_company(
    *,
    company: Company,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    if company.meetings:
        async for chunk in enrich_company_from_meetings(company=company, db=db):
            yield chunk
        return

    async for chunk in enrich_company_profile(company=company, db=db):
        yield chunk
