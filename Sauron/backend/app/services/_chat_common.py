"""Shared helpers for entity chat services (company, meeting, person)."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime, time, timezone
from typing import Any

import httpx
from parallel import AsyncParallel
from sqlalchemy import Text, cast, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.contact_phone_utils import (
    normalize_contact_phone_entries,
    primary_phone_number,
)
from app.config import settings
from app.models.company import Company
from app.models.company_email import CompanyEmail
from app.models.enums import UserRole
from app.models.meeting_recording import MeetingRecording
from app.models.associations import company_email_company
from app.services._openrouter import (
    CHAT_MODEL,
    get_client,
    stream_chat_completion,
    stream_chat_with_tools,
)
from app.services.transcript_indexer import (
    format_search_results_as_context,
    is_enabled as tpuf_enabled,
    search_transcripts,
)

logger = logging.getLogger(__name__)

_PRIVILEGED_EMAIL_ROLES = {UserRole.ADMIN.value, UserRole.EXEC.value}
_DEFAULT_COMPANY_EMAIL_LIMIT = 20
_MAX_COMPANY_EMAIL_LIMIT = 50
_COMPANY_EMAIL_RETRIEVAL_MODES = {"recent", "date_range", "all"}


# ---------------------------------------------------------------------------
# Tool schemas
# ---------------------------------------------------------------------------


def _build_search_tool(current_label: str) -> dict:
    return {
        "type": "function",
        "function": {
            "name": "search_transcripts",
            "description": (
                "Search meeting transcripts using semantic and keyword search. "
                "Returns ranked excerpts with speaker names and timestamps. "
                "By default searches all transcripts. "
                f"Set scope to 'current' to limit results to {current_label}."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query describing what you're looking for",
                    },
                    "scope": {
                        "type": "string",
                        "enum": ["all", "current"],
                        "description": (
                            f"'all' searches every transcript (default), "
                            f"'current' limits to {current_label}"
                        ),
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of results to return (default 15). Increase for broader research.",
                    },
                },
                "required": ["query"],
            },
        },
    }


_READ_TRANSCRIPT_TOOL: dict = {
    "type": "function",
    "function": {
        "name": "read_transcript",
        "description": (
            "Read the complete transcript of a meeting recording. "
            "Use this when you need the full context of a call "
            "beyond the snippets returned by search. "
            "The recording_id can be found in search result headers."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "recording_id": {
                    "type": "integer",
                    "description": "The ID of the meeting recording to read",
                },
            },
            "required": ["recording_id"],
        },
    },
}

_COMPANY_INFO_TOOL: dict = {
    "type": "function",
    "function": {
        "name": "get_company_info",
        "description": (
            "Look up information about a company from the CRM database, "
            "including summary, industry vertical, revenue, employee count, "
            "ERP system, key facts, and more."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "company_name": {
                    "type": "string",
                    "description": "The name of the company to look up",
                },
            },
            "required": ["company_name"],
        },
    },
}

_WEB_SEARCH_TOOL: dict = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search the web for real-time information. Useful for finding "
            "current company news, industry trends, product announcements, "
            "competitor intelligence, or any information not available in "
            "transcripts or the CRM."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "objective": {
                    "type": "string",
                    "description": (
                        "A natural-language description of what you want to "
                        "find. Be specific about the information needed."
                    ),
                },
                "search_queries": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "One or more keyword search queries to execute. "
                        "Provide varied phrasings for best coverage."
                    ),
                },
            },
            "required": ["objective", "search_queries"],
        },
    },
}


def _has_global_email_access(user_role: str | None) -> bool:
    return (user_role or "").strip().lower() in _PRIVILEGED_EMAIL_ROLES


def _email_access_scope(user_role: str | None, user_email: str | None) -> str:
    if _has_global_email_access(user_role):
        return "all synced company emails"
    if (user_email or "").strip():
        return f"synced company emails that include {(user_email or '').strip()}"
    return "no synced company emails"


def _build_company_emails_tool(email_access_scope: str) -> dict:
    return {
        "type": "function",
        "function": {
            "name": "get_company_emails",
            "description": (
                "Retrieve synced CRM emails associated with a company. "
                f"For this user, the tool can access {email_access_scope}. "
                "Optionally provide a query to narrow by topic, participant, "
                "subject, or thread summary. Choose exactly one retrieval mode: "
                "'recent' with a numeric limit, 'date_range' with start_date and "
                "end_date, or 'all' to return every matching email."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "company_name": {
                        "type": "string",
                        "description": "The company whose emails should be retrieved",
                    },
                    "query": {
                        "type": "string",
                        "description": (
                            "Optional keyword/topic filter applied within that company's "
                            "emails"
                        ),
                    },
                    "retrieval_mode": {
                        "type": "string",
                        "enum": ["recent", "date_range", "all"],
                        "description": (
                            "How to choose which emails to return. "
                            "'recent' returns the latest N emails, "
                            "'date_range' returns all emails in the inclusive "
                            "date window, and 'all' returns all matching emails. "
                            "Defaults to 'recent'."
                        ),
                    },
                    "limit": {
                        "type": "integer",
                        "description": (
                            "Number of most recent emails to return when "
                            "retrieval_mode='recent' (default 20, max 50)"
                        ),
                    },
                    "start_date": {
                        "type": "string",
                        "description": (
                            "Inclusive start of the date range when "
                            "retrieval_mode='date_range'. Accepts YYYY-MM-DD "
                            "or a full ISO datetime."
                        ),
                    },
                    "end_date": {
                        "type": "string",
                        "description": (
                            "Inclusive end of the date range when "
                            "retrieval_mode='date_range'. Accepts YYYY-MM-DD "
                            "or a full ISO datetime."
                        ),
                    },
                },
                "required": ["company_name"],
            },
        },
    }


_ENRICH_PERSON_TOOL: dict = {
    "type": "function",
    "function": {
        "name": "enrich_person",
        "description": (
            "Look up detailed information about a person using the Apollo "
            "database. Returns title, headline, email, phone number(s), "
            "LinkedIn URL, employment history, seniority, department, and "
            "their organization's details. Provide as many identifying "
            "fields as possible for the best match."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "first_name": {
                    "type": "string",
                    "description": "The person's first name",
                },
                "last_name": {
                    "type": "string",
                    "description": "The person's last name",
                },
                "name": {
                    "type": "string",
                    "description": (
                        "The person's full name (use instead of first_name "
                        "and last_name if you only have the full name)"
                    ),
                },
                "organization_name": {
                    "type": "string",
                    "description": "The name of the person's employer",
                },
                "domain": {
                    "type": "string",
                    "description": (
                        "The domain of the person's employer "
                        "(e.g. 'apollo.io'). Do not include www. or @."
                    ),
                },
                "linkedin_url": {
                    "type": "string",
                    "description": "The person's LinkedIn profile URL",
                },
                "email": {
                    "type": "string",
                    "description": "The person's email address",
                },
            },
        },
    },
}

_ENRICH_ORG_TOOL: dict = {
    "type": "function",
    "function": {
        "name": "enrich_organization",
        "description": (
            "Look up detailed information about a company/organization using "
            "the Apollo database. Returns industry, employee count, "
            "funding history, technologies used, departmental headcount, "
            "social links, and more. Requires the company's domain."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "domain": {
                    "type": "string",
                    "description": (
                        "The company's domain name (e.g. 'apollo.io'). "
                        "Do not include www. or @."
                    ),
                },
            },
            "required": ["domain"],
        },
    },
}


def _apollo_enabled() -> bool:
    return bool(settings.apollo_api_key)


def _web_search_enabled() -> bool:
    return bool(settings.parallel_api_key)


# ---------------------------------------------------------------------------
# Shared helpers for tool executors
# ---------------------------------------------------------------------------


def _error_response(msg: str) -> str:
    return json.dumps({"error": msg})


def _format_location(
    city: str | None, state: str | None, country: str | None
) -> str | None:
    parts = [p for p in (city, state, country) if p]
    return ", ".join(parts) if parts else None


def _extract_org_phone(org: dict[str, Any]) -> str | None:
    primary_phone = org.get("primary_phone") or {}
    if isinstance(primary_phone, dict):
        for key in ("sanitized_number", "number", "raw_number"):
            value = primary_phone.get(key)
            if value:
                return value
    for key in ("phone", "sanitized_phone"):
        value = org.get(key)
        if value:
            return value
    return None


def _strip_revenue_fields(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _strip_revenue_fields(item)
            for key, item in value.items()
            if "revenue" not in key.casefold()
        }
    if isinstance(value, list):
        return [_strip_revenue_fields(item) for item in value]
    return value


def _compact(d: dict) -> dict:
    """Return a copy of *d* with falsy values removed."""
    return {k: v for k, v in d.items() if v}


def _truncate_for_log(value: Any, max_chars: int = 300) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        try:
            value = json.dumps(value, default=str)
        except TypeError:
            value = str(value)
    if len(value) <= max_chars:
        return value
    return f"{value[:max_chars]}... [truncated {len(value) - max_chars} chars]"


def _summarize_messages_for_log(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for message in messages[-6:]:
        role = message.get("role")
        content = message.get("content")
        summary: dict[str, Any] = {"role": role}
        if isinstance(content, str):
            summary["content_preview"] = _truncate_for_log(content, max_chars=240)
            summary["content_length"] = len(content)
        elif content is not None:
            summary["content_preview"] = _truncate_for_log(content, max_chars=240)
        if message.get("tool_calls"):
            summary["tool_call_names"] = [
                (tc.get("function") or {}).get("name")
                for tc in message["tool_calls"]
                if isinstance(tc, dict)
            ]
        summaries.append(summary)
    return summaries


async def _apollo_request(
    method: str,
    path: str,
    *,
    params: dict | None = None,
    json_body: dict | None = None,
) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.request(
            method,
            f"https://api.apollo.io{path}",
            headers={"x-api-key": settings.apollo_api_key},
            params=params,
            json=json_body,
        )
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Tool executors
# ---------------------------------------------------------------------------


async def _exec_search_transcripts(
    query: str, scope_filters: dict[str, Any], scope: str | None, top_k: int = 15
) -> str | tuple[str, Any]:
    filters = scope_filters if scope == "current" else {}
    results = await search_transcripts(query, top_k=top_k, **filters)
    context = format_search_results_as_context(results) or "No relevant results found."
    chunks = [
        {
            "title": r.title,
            "start_ts": r.start_ts,
            "end_ts": r.end_ts,
            "speakers": r.speakers,
            "text": r.text,
        }
        for r in results
    ]
    return context, chunks


async def _exec_read_transcript(
    db: AsyncSession, arguments: str
) -> str | tuple[str, Any]:
    args = json.loads(arguments)
    recording_id = args.get("recording_id")
    if recording_id is None:
        return _error_response("recording_id is required")

    row = (
        await db.execute(
            select(MeetingRecording.title, MeetingRecording.transcript).where(
                MeetingRecording.id == recording_id
            )
        )
    ).one_or_none()

    if row is None:
        return _error_response(f"Recording {recording_id} not found")

    transcript = (row.transcript or "").strip()
    if not transcript:
        return _error_response("No transcript available for this recording")

    title = row.title or "Untitled"
    llm_content = (
        f"--- FULL TRANSCRIPT: {title} (recording_id: {recording_id}) ---\n"
        f"{transcript}"
    )
    metadata = {
        "title": title,
        "recording_id": recording_id,
        "char_count": len(transcript),
    }
    return llm_content, metadata


async def _exec_get_company_info(
    db: AsyncSession, arguments: str
) -> str | tuple[str, Any]:
    args = json.loads(arguments)
    company_name = args.get("company_name", "").strip()
    if not company_name:
        return _error_response("company_name is required")

    base_query = select(Company).options(selectinload(Company.industry_groups))

    result = await db.execute(
        base_query.where(func.lower(Company.name) == company_name.lower())
    )
    company = result.scalar_one_or_none()

    if company is None:
        result = await db.execute(
            base_query.where(Company.name.ilike(f"%{company_name}%")).limit(5)
        )
        matches = list(result.scalars().all())
        if len(matches) == 1:
            company = matches[0]
        elif len(matches) > 1:
            names = [c.name for c in matches]
            return json.dumps({
                "multiple_matches": names,
                "message": (
                    f"Multiple companies match '{company_name}'. "
                    "Please be more specific."
                ),
            })
        else:
            return _error_response(f"No company found matching '{company_name}'")

    info: dict[str, Any] = {
        "name": company.name,
        "summary": company.summary,
        "vertical": company.vertical.value if company.vertical else None,
        "revenue": company.revenue,
        "annual_revenue": company.annual_revenue,
        "employee_count": company.employee_count,
        "location_count": company.location_count,
        "linkedin": company.linkedin,
        "erp": company.erp.value if company.erp else None,
        "competitor": company.competitor.value if company.competitor else None,
        "key_facts": company.key_facts,
        "is_named_account": company.is_named_account,
    }
    if company.industry_groups:
        info["industry_groups"] = [ig.name for ig in company.industry_groups]

    lines = [f"Company: {company.name}"]
    for k, v in info.items():
        if v is not None and k != "name":
            if isinstance(v, (list, dict)):
                lines.append(f"  {k}: {json.dumps(v)}")
            else:
                lines.append(f"  {k}: {v}")

    return "\n".join(lines), {k: v for k, v in info.items() if v is not None}


def _company_email_visibility_filter(user_role: str | None, user_email: str | None):
    normalized_email = (user_email or "").strip().lower()
    if _has_global_email_access(user_role):
        return None
    if not normalized_email:
        return False

    participant_emails_text = func.lower(cast(CompanyEmail.participant_emails, Text))
    return or_(
        func.lower(func.coalesce(CompanyEmail.from_email, "")) == normalized_email,
        participant_emails_text.like(f'%"{normalized_email}"%'),
    )


def _resolve_company_email_limit(raw_limit: Any) -> int:
    try:
        parsed_limit = int(raw_limit)
    except (TypeError, ValueError):
        parsed_limit = _DEFAULT_COMPANY_EMAIL_LIMIT
    return max(1, min(parsed_limit, _MAX_COMPANY_EMAIL_LIMIT))


def _parse_company_email_datetime(
    raw_value: Any, *, end_of_day: bool = False
) -> datetime | None:
    if raw_value is None:
        return None
    if not isinstance(raw_value, str):
        raise ValueError("Date values must be strings")

    value = raw_value.strip()
    if not value:
        return None

    try:
        if len(value) == 10:
            parsed_date = datetime.strptime(value, "%Y-%m-%d").date()
            parsed = datetime.combine(
                parsed_date,
                time.max if end_of_day else time.min,
            )
        else:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(
            f"Invalid date '{value}'. Use YYYY-MM-DD or ISO datetime."
        ) from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _resolve_company_email_retrieval(
    args: dict[str, Any],
) -> tuple[str, int | None, datetime | None, datetime | None]:
    retrieval_mode = str(args.get("retrieval_mode") or "").strip().lower()
    if not retrieval_mode:
        retrieval_mode = (
            "date_range"
            if args.get("start_date") or args.get("end_date")
            else "recent"
        )
    if retrieval_mode not in _COMPANY_EMAIL_RETRIEVAL_MODES:
        raise ValueError(
            "retrieval_mode must be one of: recent, date_range, all"
        )

    if retrieval_mode == "recent":
        return retrieval_mode, _resolve_company_email_limit(args.get("limit")), None, None

    if retrieval_mode == "date_range":
        start_date = _parse_company_email_datetime(args.get("start_date"))
        end_date = _parse_company_email_datetime(
            args.get("end_date"),
            end_of_day=True,
        )
        if start_date is None or end_date is None:
            raise ValueError(
                "start_date and end_date are required when retrieval_mode='date_range'"
            )
        if end_date < start_date:
            raise ValueError("end_date must be on or after start_date")
        return retrieval_mode, None, start_date, end_date

    return retrieval_mode, None, None, None


def _describe_company_email_retrieval(
    retrieval_mode: str,
    *,
    limit: int | None,
    start_date: datetime | None,
    end_date: datetime | None,
) -> str:
    if retrieval_mode == "all":
        return "all matching emails"
    if retrieval_mode == "date_range" and start_date and end_date:
        return (
            f"emails from {start_date.date().isoformat()} "
            f"through {end_date.date().isoformat()}"
        )
    return f"the most recent {limit or _DEFAULT_COMPANY_EMAIL_LIMIT} emails"


def _format_company_email_results(
    *,
    company_name: str,
    emails: list[CompanyEmail],
    query: str | None,
    retrieval_mode: str,
    limit: int | None,
    start_date: datetime | None,
    end_date: datetime | None,
    truncated: bool,
) -> str:
    qualifier = f" matching '{query}'" if query else ""
    lines = [
        f"Company email results for {company_name}{qualifier}: "
        f"{len(emails)} email(s) shown from "
        f"{_describe_company_email_retrieval(retrieval_mode, limit=limit, start_date=start_date, end_date=end_date)}."
    ]
    if truncated:
        lines.append(
            "The result set may be truncated; call get_company_emails again with a higher limit "
            "if you need broader coverage."
        )
    lines.append("")

    for idx, email in enumerate(emails, start=1):
        occurred_at = (
            email.occurred_at.isoformat()
            if getattr(email, "occurred_at", None) is not None
            else "Unknown"
        )
        direction = getattr(email.direction, "value", email.direction)
        subject = (email.subject or "").strip() or "(no subject)"
        lines.append(f"### Email {idx}")
        lines.append(f"Occurred at: {occurred_at}")
        lines.append(f"Direction: {direction}")
        lines.append(f"Subject: {subject}")
        if email.from_email:
            lines.append(f"From: {email.from_email}")
        participants = [addr for addr in (email.participant_emails or []) if addr]
        if participants:
            lines.append(f"Participants: {', '.join(participants[:12])}")
        if email.hubspot_thread_summary:
            lines.append(f"Thread summary: {email.hubspot_thread_summary[:500]}")
        if email.body_preview:
            lines.append(f"Preview: {email.body_preview[:1000]}")
        lines.append("")

    return "\n".join(lines).strip()


async def _exec_get_company_emails(
    db: AsyncSession,
    arguments: str,
    *,
    user_role: str | None,
    user_email: str | None,
) -> str | tuple[str, Any]:
    args = json.loads(arguments)
    company_name = args.get("company_name", "").strip()
    query = args.get("query", "").strip() or None
    try:
        retrieval_mode, limit, start_date, end_date = _resolve_company_email_retrieval(args)
    except ValueError as exc:
        return _error_response(str(exc))

    if not company_name:
        return _error_response("company_name is required")

    company_query = select(Company.id, Company.name)
    result = await db.execute(
        company_query.where(func.lower(Company.name) == company_name.lower())
    )
    company_row = result.one_or_none()

    if company_row is None:
        result = await db.execute(
            company_query.where(Company.name.ilike(f"%{company_name}%")).limit(5)
        )
        matches = list(result.all())
        if len(matches) == 1:
            company_row = matches[0]
        elif len(matches) > 1:
            return json.dumps({
                "multiple_matches": [match.name for match in matches],
                "message": (
                    f"Multiple companies match '{company_name}'. "
                    "Please be more specific."
                ),
            })
        else:
            return _error_response(f"No company found matching '{company_name}'")

    visibility_filter = _company_email_visibility_filter(user_role, user_email)
    if visibility_filter is False:
        return _error_response("No user email available for scoped company email access")

    filters = [
        exists(
            select(company_email_company.c.company_email_id).where(
                company_email_company.c.company_email_id == CompanyEmail.id,
                company_email_company.c.company_id == company_row.id,
            )
        )
    ]
    if visibility_filter is not None:
        filters.append(visibility_filter)
    if query:
        pattern = f"%{query.lower()}%"
        filters.append(
            or_(
                func.lower(func.coalesce(CompanyEmail.subject, "")).like(pattern),
                func.lower(func.coalesce(CompanyEmail.body_preview, "")).like(pattern),
                func.lower(func.coalesce(CompanyEmail.from_email, "")).like(pattern),
                func.lower(func.coalesce(CompanyEmail.hubspot_thread_summary, "")).like(pattern),
                func.lower(cast(CompanyEmail.participant_emails, Text)).like(pattern),
            )
        )
    if start_date is not None:
        filters.append(CompanyEmail.occurred_at >= start_date)
    if end_date is not None:
        filters.append(CompanyEmail.occurred_at <= end_date)

    email_stmt = (
        select(CompanyEmail)
        .where(*filters)
        .order_by(CompanyEmail.occurred_at.desc(), CompanyEmail.id.desc())
    )
    fetch_limit = limit + 1 if retrieval_mode == "recent" and limit is not None else None
    if fetch_limit is not None:
        email_stmt = email_stmt.limit(fetch_limit)

    emails = (await db.execute(email_stmt)).scalars().all()
    truncated = bool(
        retrieval_mode == "recent"
        and limit is not None
        and len(emails) > limit
    )
    if truncated:
        emails = emails[:limit]

    if not emails:
        qualifier = f" matching '{query}'" if query else ""
        return (
            f"No company emails found for {company_row.name}{qualifier}.",
            {
                "company_name": company_row.name,
                "query": query,
                "retrieval_mode": retrieval_mode,
                "limit": limit,
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "result_count": 0,
                "emails": [],
            },
        )

    llm_content = _format_company_email_results(
        company_name=company_row.name,
        emails=emails,
        query=query,
        limit=limit,
        retrieval_mode=retrieval_mode,
        start_date=start_date,
        end_date=end_date,
        truncated=truncated,
    )
    return llm_content, {
        "company_name": company_row.name,
        "query": query,
        "retrieval_mode": retrieval_mode,
        "limit": limit,
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "result_count": len(emails),
        "truncated": truncated,
        "emails": [
            {
                "occurred_at": email.occurred_at.isoformat()
                if getattr(email, "occurred_at", None) is not None
                else None,
                "direction": getattr(email.direction, "value", email.direction),
                "subject": (email.subject or "").strip() or "(no subject)",
                "from_email": email.from_email,
                "participant_emails": [
                    addr for addr in (email.participant_emails or []) if addr
                ][:12],
                "thread_summary": (
                    email.hubspot_thread_summary[:240]
                    if email.hubspot_thread_summary
                    else None
                ),
                "preview": email.body_preview[:320] if email.body_preview else None,
            }
            for email in emails
        ],
    }


async def _exec_web_search(arguments: str) -> str | tuple[str, Any]:
    args = json.loads(arguments)
    objective = args.get("objective", "").strip()
    search_queries = args.get("search_queries", [])
    if not objective:
        return _error_response("objective is required")
    if not search_queries:
        return _error_response("search_queries is required")

    client = AsyncParallel(api_key=settings.parallel_api_key)
    try:
        response = await client.beta.search(
            mode="agentic",
            objective=objective,
            search_queries=search_queries,
            max_results=10,
            excerpts={"max_chars_per_result": 5000},
        )
    except Exception:
        logger.exception("Parallel web search failed")
        return _error_response("Web search request failed")

    lines: list[str] = []
    metadata_results: list[dict] = []
    for result in response.results:
        title = result.title or "Untitled"
        url = result.url or ""
        lines.append(f"### {title}")
        lines.append(f"URL: {url}")
        if result.publish_date:
            lines.append(f"Published: {result.publish_date}")
        for excerpt in result.excerpts:
            lines.append(excerpt)
        lines.append("")
        metadata_results.append({
            "title": title,
            "url": url,
            "publish_date": result.publish_date,
        })

    llm_content = "\n".join(lines) if lines else "No results found."
    return llm_content, {"result_count": len(metadata_results), "results": metadata_results}


def _extract_phone_numbers(person: dict) -> list[dict[str, Any]]:
    """Extract typed phone numbers from an Apollo person response."""
    raw_phone_numbers: list[dict[str, Any]] = []
    contact = person.get("contact") or {}
    raw_phone_numbers.extend(person.get("phone_numbers") or [])
    for pn in contact.get("phone_numbers") or []:
        if isinstance(pn, dict):
            raw_phone_numbers.append(pn)
    if not raw_phone_numbers and contact.get("sanitized_phone"):
        raw_phone_numbers.append(
            {
                "number": contact["sanitized_phone"],
                "type": "unknown",
                "is_primary": True,
            }
        )
    return normalize_contact_phone_entries(raw_phone_numbers)


async def _exec_enrich_person(arguments: str) -> str | tuple[str, Any]:
    args = json.loads(arguments)
    params: dict[str, Any] = {}
    for key in (
        "first_name", "last_name", "name", "organization_name",
        "domain", "linkedin_url", "email",
    ):
        val = args.get(key, "").strip() if isinstance(args.get(key), str) else args.get(key)
        if val:
            params[key] = val

    if not params:
        return _error_response("At least one identifying parameter is required")

    params["reveal_phone_number"] = True
    params["run_waterfall_phone"] = True
    if settings.apollo_webhook_url:
        params["webhook_url"] = settings.apollo_webhook_url

    try:
        data = await _apollo_request(
            "POST", "/api/v1/people/match", json_body=params
        )
    except httpx.HTTPError:
        logger.exception("Apollo people enrichment failed")
        return _error_response("Apollo people enrichment request failed")

    person = data.get("person")
    if not person:
        return _error_response("No matching person found in Apollo")

    apollo_person_id = person.get("id")
    lines: list[str] = [f"## {person.get('name', 'Unknown')}"]
    if apollo_person_id:
        lines.append(f"**Apollo ID:** {apollo_person_id}")
    if person.get("title"):
        lines.append(f"**Title:** {person['title']}")
    if person.get("headline"):
        lines.append(f"**Headline:** {person['headline']}")
    if person.get("email"):
        lines.append(f"**Email:** {person['email']}")
    if person.get("linkedin_url"):
        lines.append(f"**LinkedIn:** {person['linkedin_url']}")
    loc = _format_location(
        person.get("city"), person.get("state"), person.get("country")
    )
    if loc:
        lines.append(f"**Location:** {loc}")
    phone_numbers = _extract_phone_numbers(person)
    if phone_numbers:
        lines.append(
            "**Phone:** "
            + ", ".join(
                f"{entry['number']} ({entry['type']})" for entry in phone_numbers
            )
        )

    if person.get("seniority"):
        lines.append(f"**Seniority:** {person['seniority']}")
    if person.get("departments"):
        lines.append(f"**Departments:** {', '.join(person['departments'])}")

    history = person.get("employment_history", [])
    if history:
        lines.append("\n**Employment History:**")
        for job in history[:6]:
            org = job.get("organization_name", "Unknown")
            title = job.get("title", "Unknown")
            start = job.get("start_date", "?")
            end = job.get("end_date", "present") if not job.get("current") else "present"
            lines.append(f"- {title} at {org} ({start} - {end})")

    org = person.get("organization")
    if org:
        lines.append(f"\n**Current Organization:** {org.get('name', 'Unknown')}")
        if org.get("industry"):
            lines.append(f"  Industry: {org['industry']}")
        if org.get("estimated_num_employees"):
            lines.append(f"  Employees: {org['estimated_num_employees']}")
        if org.get("short_description"):
            lines.append(f"  Description: {org['short_description'][:500]}")

    metadata = {
        "apollo_person_id": apollo_person_id,
        "name": person.get("name"),
        "title": person.get("title"),
        "email": person.get("email"),
        "phone": primary_phone_number(phone_numbers),
        "phone_numbers": phone_numbers,
        "linkedin_url": person.get("linkedin_url"),
        "organization": org.get("name") if org else None,
    }
    return "\n".join(lines), _compact(metadata)


async def _exec_enrich_organization(arguments: str) -> str | tuple[str, Any]:
    args = json.loads(arguments)
    domain = args.get("domain", "").strip()
    if not domain:
        return _error_response("domain is required")

    try:
        data = await _apollo_request(
            "GET", "/api/v1/organizations/enrich", params={"domain": domain}
        )
    except httpx.HTTPError:
        logger.exception("Apollo organization enrichment failed")
        return _error_response("Apollo organization enrichment request failed")

    org = data.get("organization")
    if not org:
        return _error_response(f"No organization found for domain '{domain}'")

    sanitized_data = _strip_revenue_fields(data)
    sanitized_org = sanitized_data.get("organization") or {}

    lines: list[str] = [f"## {sanitized_org.get('name', domain)}"]
    if sanitized_org.get("website_url"):
        lines.append(f"**Website:** {sanitized_org['website_url']}")
    if sanitized_org.get("industry"):
        lines.append(f"**Industry:** {sanitized_org['industry']}")
    if sanitized_org.get("estimated_num_employees"):
        lines.append(f"**Employees:** {sanitized_org['estimated_num_employees']}")
    if sanitized_org.get("founded_year"):
        lines.append(f"**Founded:** {sanitized_org['founded_year']}")

    loc = _format_location(
        sanitized_org.get("city"),
        sanitized_org.get("state"),
        sanitized_org.get("country"),
    )
    if loc:
        lines.append(f"**Location:** {loc}")
    org_phone = _extract_org_phone(sanitized_org)
    if org_phone:
        lines.append(f"**HQ Phone:** {org_phone}")

    if sanitized_org.get("linkedin_url"):
        lines.append(f"**LinkedIn:** {sanitized_org['linkedin_url']}")
    if sanitized_org.get("short_description"):
        lines.append(f"\n**Description:** {sanitized_org['short_description'][:600]}")

    if sanitized_org.get("total_funding_printed"):
        lines.append(f"\n**Total Funding:** ${sanitized_org['total_funding_printed']}")
    if sanitized_org.get("latest_funding_stage"):
        lines.append(f"**Latest Round:** {sanitized_org['latest_funding_stage']}")

    funding = sanitized_org.get("funding_events", [])
    if funding:
        lines.append("\n**Funding History:**")
        for event in funding[:5]:
            amount = event.get("amount", "?")
            currency = event.get("currency", "$")
            round_type = event.get("type", "Unknown")
            date = (event.get("date") or "")[:10]
            investors = event.get("investors", "")
            lines.append(f"- {round_type}: {currency}{amount} ({date}) — {investors}")

    dept_counts = sanitized_org.get("departmental_head_count", {})
    if dept_counts:
        lines.append("\n**Departmental Headcount:**")
        for dept, count in sorted(dept_counts.items(), key=lambda x: -x[1]):
            lines.append(f"- {dept.replace('_', ' ').title()}: {count}")

    techs = sanitized_org.get("technology_names", [])
    if techs:
        lines.append(f"\n**Technologies:** {', '.join(techs[:20])}")

    keywords = sanitized_org.get("keywords", [])
    if keywords:
        lines.append(f"**Keywords:** {', '.join(keywords[:15])}")

    lines.append("\n**Full Apollo Response JSON:**")
    lines.append("```json")
    lines.append(json.dumps(sanitized_data, indent=2, ensure_ascii=False, default=str))
    lines.append("```")

    metadata = {
        "name": sanitized_org.get("name"),
        "domain": sanitized_org.get("primary_domain"),
        "industry": sanitized_org.get("industry"),
        "employees": sanitized_org.get("estimated_num_employees"),
        "total_funding": sanitized_org.get("total_funding"),
        "phone": org_phone,
        "organization": sanitized_org,
        "apollo_response": sanitized_data,
    }
    return "\n".join(lines), _compact(metadata)


# ---------------------------------------------------------------------------
# System prompt addendum
# ---------------------------------------------------------------------------


def _tool_addendum(
    current_label: str, *, has_search: bool, has_db: bool, has_web: bool,
    has_apollo: bool, has_company_emails: bool, company_email_scope: str,
) -> str:
    if (
        not has_search
        and not has_db
        and not has_web
        and not has_apollo
        and not has_company_emails
    ):
        return ""
    lines = ["\n\nYou have access to tools:"]
    if has_search:
        lines.append(
            f"- search_transcripts: semantic + keyword search over transcripts. "
            f"Defaults to all transcripts; set scope='current' for {current_label}."
        )
    if has_db:
        lines.append(
            "- read_transcript: read a full call transcript by recording_id "
            "(found in search result headers)."
        )
        lines.append(
            "- get_company_info: look up company details by name from the CRM."
        )
    if has_company_emails:
        lines.append(
            "- get_company_emails: retrieve synced company emails for a company, "
            f"limited to {company_email_scope}. Use this for email threads, "
            "customer correspondence, follow-ups, and inbox history. It can "
            "return the most recent N emails, all emails in a date range, or "
            "all matching emails."
        )
    if has_web:
        lines.append(
            "- web_search: search the web for real-time information such as "
            "company news, industry trends, product details, or anything not "
            "in transcripts or the CRM. Provide a clear objective and varied "
            "search queries."
        )
    if has_apollo:
        lines.append(
            "- enrich_person: look up detailed information about a person via "
            "Apollo (title, email, LinkedIn, employment history, seniority). "
            "Provide name plus domain or organization for best results."
        )
        lines.append(
            "- enrich_organization: look up detailed information about a "
            "company via Apollo by domain (industry, employees, "
            "funding, tech stack, departmental headcount)."
        )
    lines.append(
        "\nTool-use strategy (IMPORTANT — follow this closely):"
        "\n- Do NOT write your answer until you have thoroughly researched the question. "
        "Always make at least 3 tool calls before responding, even for simple questions. "
        "For complex or multi-part questions, make 5 or more."
        "\n- After each tool result, consider what you learned and what gaps remain. "
        "Let earlier results guide later searches — if a search reveals a key meeting, "
        "read that transcript; if a company or person name comes up, look them up."
        "\n- Vary your search queries: rephrase and approach the topic from "
        "different angles rather than repeating similar searches."
        "\n- When search results reference a specific meeting, use read_transcript "
        "to get the full context — don't rely on snippets alone."
        "\n- Cross-reference: combine search_transcripts, read_transcript, "
        "get_company_info, get_company_emails, and web_search to build a complete "
        "picture before answering."
        "\n- If the user asks about email history, inbox activity, follow-ups, "
        "or customer correspondence, use get_company_emails."
        "\n- Use web_search when you need current information beyond what transcripts "
        "and the CRM provide — e.g. recent news, market data, or company background."
        "\n- NEVER expose internal recording IDs or database IDs in your answer. "
        "Refer to meetings by their title or date, not by recording number."
    )
    if has_web and has_apollo:
        lines.append(
            "\nPeople & leadership research (CRITICAL — follow when the question "
            "involves people, contacts, or stakeholders at a company):"
            "\n- Be EXHAUSTIVE. Use web_search aggressively — fire off many parallel "
            "searches to identify leadership and key contacts. Search for:"
            "\n  * \"[company name] leadership team\" / \"[company name] executives\""
            "\n  * \"[company name] LinkedIn\" to find their LinkedIn company page"
            "\n  * \"[domain] site:linkedin.com\" to surface individual profiles"
            "\n  * \"[company name] team page\" / \"[company name] about us\""
            "\n  * \"[company name] blog\" / \"[company name] press releases\" — "
            "authors and quoted people are often decision-makers"
            "\n  * \"[company name] [industry association]\" — conference speakers "
            "and board members are valuable contacts"
            "\n  * \"[company name] podcast\" / \"[company name] webinar\" — "
            "presenters are usually senior stakeholders"
            "\n  * Social media: Twitter/X, YouTube channels, industry forums"
            "\n- After web search surfaces names, use enrich_person for each one "
            "to get their title, email, LinkedIn, and employment history. Fire "
            "off multiple enrich_person calls in parallel."
            "\n- Also use enrich_organization on the company domain to get "
            "departmental headcount and other firmographic data."
            "\n- Cast a wide net: look beyond the C-suite. VP-level, directors, "
            "and department heads in IT, operations, finance, and procurement "
            "are often the real decision-makers and champions."
            "\n- Do at least 2 rounds: first round to discover names, second "
            "round to enrich each person and follow up on promising leads."
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main SSE streaming helper
# ---------------------------------------------------------------------------


async def stream_chat_sse(
    *,
    system_prompt: str,
    context_block: str,
    messages: list[dict],
    current_scope_label: str,
    current_scope_filters: dict[str, Any] | None = None,
    db: AsyncSession | None = None,
    user_role: str | None = None,
    user_email: str | None = None,
    error_label: str = "Chat",
) -> AsyncGenerator[str, None]:
    """Full SSE streaming generator with tool calling support.

    Parameters
    ----------
    system_prompt:
        Base system prompt (without tool addendum or context).
    context_block:
        Entity-specific context appended after the system prompt.
    messages:
        User/assistant conversation history.
    current_scope_label:
        Human-readable label for the 'current' scope.
    current_scope_filters:
        Keyword arguments forwarded to ``search_transcripts`` when
        scope='current'.
    db:
        Async database session — enables read_transcript and
        get_company_info tools.
    error_label:
        Label used in error log messages.
    """
    if get_client() is None:
        yield "data: OpenRouter API key not configured.\n\n"
        yield "data: [DONE]\n\n"
        return

    has_search = tpuf_enabled()
    has_db = db is not None
    has_web = _web_search_enabled()
    has_apollo = _apollo_enabled()
    company_email_scope = _email_access_scope(user_role, user_email)
    has_company_emails = has_db and company_email_scope != "no synced company emails"

    tools: list[dict] = []
    if has_search:
        tools.append(_build_search_tool(current_scope_label))
    if has_db:
        tools.append(_READ_TRANSCRIPT_TOOL)
        tools.append(_COMPANY_INFO_TOOL)
    if has_company_emails:
        tools.append(_build_company_emails_tool(company_email_scope))
    if has_web:
        tools.append(_WEB_SEARCH_TOOL)
    if has_apollo:
        tools.append(_ENRICH_PERSON_TOOL)
        tools.append(_ENRICH_ORG_TOOL)

    use_tools = len(tools) > 0

    system_content = (
        f"{system_prompt}"
        f"{_tool_addendum(current_scope_label, has_search=has_search, has_db=has_db, has_web=has_web, has_apollo=has_apollo, has_company_emails=has_company_emails, company_email_scope=company_email_scope) if use_tools else ''}"
        f"\n\n{context_block}"
    )

    api_messages: list[dict] = [
        {"role": "system", "content": system_content},
        *messages,
    ]

    try:
        if use_tools:
            scope_filters = current_scope_filters or {}

            async def _execute_tool(
                name: str, arguments: str
            ) -> str | tuple[str, Any]:
                args = json.loads(arguments)
                if name == "search_transcripts":
                    return await _exec_search_transcripts(
                        args.get("query", ""), scope_filters, args.get("scope"),
                        top_k=args.get("top_k", 15),
                    )
                if name == "read_transcript" and db is not None:
                    return await _exec_read_transcript(db, arguments)
                if name == "get_company_info" and db is not None:
                    return await _exec_get_company_info(db, arguments)
                if name == "get_company_emails" and db is not None:
                    return await _exec_get_company_emails(
                        db,
                        arguments,
                        user_role=user_role,
                        user_email=user_email,
                    )
                if name == "web_search":
                    return await _exec_web_search(arguments)
                if name == "enrich_person":
                    return await _exec_enrich_person(arguments)
                if name == "enrich_organization":
                    return await _exec_enrich_organization(arguments)
                return _error_response(f"Unknown tool: {name}")

            async for content in stream_chat_with_tools(
                model=CHAT_MODEL,
                temperature=0.3,
                messages=api_messages,
                tools=tools,
                tool_executor=_execute_tool,
            ):
                yield f"data: {json.dumps(content)}\n\n"
        else:
            async for content in stream_chat_completion(
                model=CHAT_MODEL,
                temperature=0.3,
                messages=api_messages,
            ):
                yield f"data: {json.dumps(content)}\n\n"
        yield "data: [DONE]\n\n"
    except Exception:
        logger.exception(
            "%s streaming failed | context=%s",
            error_label,
            json.dumps(
                {
                    "error_label": error_label,
                    "model": CHAT_MODEL,
                    "current_scope_label": current_scope_label,
                    "current_scope_filters": current_scope_filters,
                    "has_search": has_search,
                    "has_db": has_db,
                    "has_web": has_web,
                    "has_apollo": has_apollo,
                    "has_company_emails": has_company_emails,
                    "tool_names": [
                        tool.get("function", {}).get("name")
                        for tool in tools
                        if isinstance(tool, dict)
                    ],
                    "message_count": len(messages),
                    "message_summaries": _summarize_messages_for_log(messages),
                    "user_role": user_role,
                    "user_email": user_email,
                    "context_preview": _truncate_for_log(context_block, max_chars=500),
                },
                ensure_ascii=True,
                default=str,
            ),
        )
        yield (
            f"data: {json.dumps('Sorry, an error occurred while generating a response.')}\n\n"
        )
        yield "data: [DONE]\n\n"
