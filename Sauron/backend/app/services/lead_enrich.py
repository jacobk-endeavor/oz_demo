"""Service for enriching lead data (contacts, strategic context, company background)."""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import re
from collections.abc import AsyncGenerator, Awaitable, Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.contact_phone_utils import (
    normalize_contact_phone_entries,
    primary_phone_number,
    serialize_phone_model,
)
from app.config import settings
from app.lead_profile_taxonomy import (
    LEAD_COMPANY_TYPE_VALUES,
    LEAD_INDUSTRY_VALUES,
    normalize_buying_groups,
    normalize_hq_phone,
    normalize_lead_company_type,
    normalize_lead_industry,
)
from app.models.lead import (
    ApolloPhoneCache,
    ContactExperience,
    Lead,
    LeadCompanyProfile,
    LeadContact,
    LeadContactPhone,
    LeadStrategicContext,
)
from app.services._chat_common import (
    _ENRICH_ORG_TOOL,
    _ENRICH_PERSON_TOOL,
    _WEB_SEARCH_TOOL,
    _exec_enrich_organization,
    _exec_enrich_person,
    _exec_web_search,
)
from app.services._openrouter import chat_completion_with_tools

logger = logging.getLogger(__name__)

ENRICH_MODEL = "openai/gpt-5.4"
_TOOLS = [_WEB_SEARCH_TOOL, _ENRICH_PERSON_TOOL, _ENRICH_ORG_TOOL]
_MAX_TOOL_ROUNDS = 10
_MAX_ENRICH_RETRIES = 2
_TRACES_BASE = Path(__file__).resolve().parent.parent.parent / "traces"

_TOOL_EXECUTORS: dict[str, Any] = {
    "web_search": _exec_web_search,
    "enrich_person": _exec_enrich_person,
    "enrich_organization": _exec_enrich_organization,
}

# ===========================================================================
# Shared utilities
# ===========================================================================


def _json_schema(name: str, schema: dict) -> dict:
    """Wrap an inner schema dict in the OpenRouter JSON schema envelope."""
    return {
        "type": "json_schema",
        "json_schema": {"name": name, "strict": True, "schema": schema},
    }


def _parse_json_output(content: str) -> dict:
    """Parse LLM structured output into a dict."""
    payload = json.loads(content)
    if not isinstance(payload, dict):
        raise ValueError("Structured output is not an object")
    return payload


def _build_enrich_messages(
    system_prompt: str, user_content: str, lead: Lead
) -> list[dict]:
    context = _build_lead_context(lead)
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"{user_content}\n\n{context}"},
    ]


def _build_lead_context(lead: Lead) -> str:
    lines = [f"Company: {lead.company}"]
    if lead.domain:
        lines.append(f"Domain: {lead.domain}")
    if lead.profile:
        p = lead.profile
        if p.buying_groups:
            lines.append(f"Buying Groups: {', '.join(p.buying_groups)}")
        if p.primary_industry:
            lines.append(
                f"Industry: {getattr(p.primary_industry, 'value', p.primary_industry)}"
            )
        if p.company_type:
            lines.append(
                f"Company Type: {getattr(p.company_type, 'value', p.company_type)}"
            )
        if p.erp:
            lines.append(f"ERP: {p.erp.value}")
        if p.hq_phone:
            lines.append(f"HQ Phone: {p.hq_phone}")
        if p.num_locations:
            lines.append(f"Locations: {p.num_locations}")
        if p.revenue_m:
            lines.append(f"Revenue: ${p.revenue_m}M")
    return "\n".join(lines)


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _content_to_text(content: Any) -> str | None:
    if isinstance(content, str):
        text = content.strip()
        return text or None
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            text = item.get("text") if isinstance(item, dict) else None
            if isinstance(text, str) and text:
                parts.append(text)
        joined = "\n".join(parts).strip()
        return joined or None
    return None


# ===========================================================================
# Tool execution
# ===========================================================================


async def _execute_tool(name: str, arguments: str) -> str | tuple[str, Any]:
    executor = _TOOL_EXECUTORS.get(name)
    if executor is None:
        return json.dumps({"error": f"Unknown tool: {name}"})
    return await executor(arguments)


async def _safe_execute_tool(tc: dict) -> tuple[dict, str]:
    """Execute a single tool call, catching exceptions."""
    name = tc["function"]["name"]
    try:
        result = await _execute_tool(name, tc["function"]["arguments"])
        llm_content = result[0] if isinstance(result, tuple) else result
    except Exception:
        logger.exception("Tool %s failed", name)
        llm_content = json.dumps({"error": "Tool execution failed"})
    return tc, llm_content


# ===========================================================================
# Tool-calling research loop
# ===========================================================================


async def _run_tool_loop(
    messages: list[dict],
    *,
    tools: list[dict] | None = None,
    response_format: dict | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Run the tool-calling loop, yielding progress events.

    Mutates *messages* in place and emits a final assistant payload when the
    model stops tool-calling.
    """
    active_tools = tools if tools is not None else _TOOLS
    for round_num in range(_MAX_TOOL_ROUNDS):
        yield {"event": "progress", "status": "thinking", "round": round_num + 1}

        resp = await chat_completion_with_tools(
            model=ENRICH_MODEL,
            messages=messages,
            tools=active_tools,
            temperature=0.2,
            response_format=response_format,
        )

        choices = resp.get("choices") if isinstance(resp, dict) else None
        if not isinstance(choices, list) or not choices:
            logger.error(
                "OpenRouter response missing choices. Response: %s",
                json.dumps(resp, default=str)[:2000],
            )
            yield {
                "event": "error",
                "message": "Model provider rejected this request. Please retry.",
            }
            yield {"event": "research_done", "final_content": None}
            return

        choice = choices[0]
        message = choice["message"]
        tool_calls = message.get("tool_calls")

        if not tool_calls or choice.get("finish_reason") == "stop":
            messages.append(message)
            yield {
                "event": "research_done",
                "final_content": _content_to_text(message.get("content")),
            }
            return

        messages.append(message)

        tool_names = [tc["function"]["name"] for tc in tool_calls]
        yield {
            "event": "progress",
            "status": "calling_tools",
            "tools": tool_names,
            "round": round_num + 1,
        }

        results = await asyncio.gather(*(_safe_execute_tool(tc) for tc in tool_calls))
        for tc, llm_content in results:
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": llm_content,
                }
            )

    yield {"event": "research_done", "final_content": None}


# ===========================================================================
# SSE orchestration (shared by all enrichment flows)
# ===========================================================================


async def _run_enrich_sse(
    *,
    lead: Lead,
    messages: list[dict],
    response_format: dict | None,
    parse: Callable[[str], Any],
    persist: Callable[[Any], Awaitable[dict]],
    tools: list[dict] | None = None,
    trace_kind: str | None = None,
    trace_renderer: Callable[[Any], str] | None = None,
) -> AsyncGenerator[str, None]:
    """Shared SSE skeleton for all enrichment flows.

    *parse* parses the final assistant message (already constrained by
    structured outputs) into data for persistence.
    *persist* receives that data and returns the 'done' event payload dict.

    When *trace_kind* and *trace_renderer* are provided (and the
    ``ENABLE_ENRICH_TRACES`` env var is on), a JSON + Markdown trace is
    written after persistence.
    """
    yield _sse({"event": "started", "company": lead.company})

    original_messages = copy.deepcopy(messages)
    extracted: Any = None

    for attempt in range(1, _MAX_ENRICH_RETRIES + 2):
        if attempt > 1:
            messages.clear()
            messages.extend(copy.deepcopy(original_messages))
            yield _sse({
                "event": "progress",
                "status": "retrying",
                "attempt": attempt,
                "max_attempts": _MAX_ENRICH_RETRIES + 1,
            })
            logger.info(
                "Retrying enrichment for %s (attempt %d/%d)",
                lead.company,
                attempt,
                _MAX_ENRICH_RETRIES + 1,
            )

        final_content: str | None = None
        saw_research_error = False
        async for event in _run_tool_loop(
            messages, tools=tools, response_format=response_format
        ):
            evt_type = event["event"]
            if evt_type == "error":
                saw_research_error = True
                yield _sse(event)
            elif evt_type == "research_done":
                final_content = event.get("final_content")
            else:
                yield _sse(event)

        if not final_content:
            if attempt <= _MAX_ENRICH_RETRIES:
                logger.warning(
                    "Empty response for %s on attempt %d, will retry",
                    lead.company,
                    attempt,
                )
                continue
            if not saw_research_error:
                logger.error("Structured response was empty after all retries")
                yield _sse(
                    {"event": "error", "message": "Model returned an empty response"}
                )
            yield "data: [DONE]\n\n"
            return

        yield _sse({"event": "progress", "status": "extracting"})

        try:
            extracted = parse(final_content)
        except Exception:
            if attempt <= _MAX_ENRICH_RETRIES:
                logger.warning(
                    "Parse failed for %s on attempt %d, will retry",
                    lead.company,
                    attempt,
                    exc_info=True,
                )
                continue
            logger.exception("Parsing structured output failed after all retries")
            yield _sse(
                {"event": "error", "message": "Failed to extract results from research"}
            )
            yield "data: [DONE]\n\n"
            return

        break

    yield _sse({"event": "progress", "status": "saving"})

    try:
        done_payload = await persist(extracted)
        if trace_kind and trace_renderer:
            _save_trace(trace_kind, lead, messages, extracted, trace_renderer)
        yield _sse({"event": "done", **done_payload})
    except Exception:
        logger.exception("Persistence failed")
        yield _sse({"event": "error", "message": "Failed to save results"})

    yield "data: [DONE]\n\n"


# ===========================================================================
# Trace persistence
# ===========================================================================


def _save_trace(
    kind: str,
    lead: Lead,
    messages: list[dict],
    extracted: Any,
    render_results_md: Callable[[Any], str],
) -> None:
    """Save JSON + human-readable Markdown trace for an enrichment run."""
    if not settings.enable_enrich_traces:
        return

    ts = datetime.now(timezone.utc)
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", lead.company).strip("_").lower()
    run_dir = _TRACES_BASE / kind / f"{lead.id}_{slug}_{ts.strftime('%Y%m%dT%H%M%SZ')}"
    run_dir.mkdir(parents=True, exist_ok=True)

    trace = {
        "lead_id": lead.id,
        "company": lead.company,
        "domain": lead.domain,
        "timestamp": ts.isoformat(),
        "model": ENRICH_MODEL,
        "messages": messages,
        "extracted": extracted,
    }

    (run_dir / "trace.json").write_text(
        json.dumps(trace, indent=2, default=str),
        encoding="utf-8",
    )

    title = kind.replace("_", " ").title()
    header = (
        f"# {title} Enrichment — {lead.company}\n\n"
        f"- **Lead ID:** {lead.id}\n"
        f"- **Domain:** {lead.domain or 'N/A'}\n"
        f"- **Model:** {ENRICH_MODEL}\n"
        f"- **Timestamp:** {ts.isoformat()}\n"
    )
    md = (
        header
        + "\n"
        + _render_conversation_md(messages)
        + "\n"
        + render_results_md(extracted)
    )
    (run_dir / "trace.md").write_text(md, encoding="utf-8")

    logger.info("Saved %s enrichment trace to %s", kind, run_dir)


# ---------------------------------------------------------------------------
# Markdown renderers
# ---------------------------------------------------------------------------


def _render_conversation_md(messages: list[dict]) -> str:
    lines: list[str] = ["---", "## Research Conversation", ""]
    round_num = 0

    for msg in messages:
        role = msg.get("role", "unknown")

        if role == "system":
            lines += ["### System Prompt", "", msg.get("content", ""), ""]

        elif role == "user":
            lines += ["### User", "", msg.get("content", ""), ""]

        elif role == "assistant":
            round_num += 1
            lines += [f"### Assistant (Round {round_num})", ""]

            if reasoning := msg.get("reasoning"):
                lines += [
                    "<details><summary>Reasoning</summary>",
                    "",
                    reasoning,
                    "",
                    "</details>",
                    "",
                ]
            if content := msg.get("content"):
                lines += [content, ""]
            if tool_calls := msg.get("tool_calls"):
                lines.append(f"**Tool calls ({len(tool_calls)}):**")
                lines.append("")
                for tc in tool_calls:
                    fn = tc.get("function", {})
                    name = fn.get("name", "?")
                    try:
                        args_str = json.dumps(
                            json.loads(fn.get("arguments", "{}")), indent=2
                        )
                    except (json.JSONDecodeError, TypeError):
                        args_str = fn.get("arguments", "")
                    lines += [f"#### `{name}`", "", "```json", args_str, "```", ""]

        elif role == "tool":
            content = msg.get("content", "")
            preview = content[:2000]
            if len(content) > 2000:
                preview += f"\n\n... ({len(content)} chars total, truncated)"
            lines += [
                f"<details><summary>Tool result — {msg.get('tool_call_id', '')}</summary>",
                "",
                preview,
                "",
                "</details>",
                "",
            ]

    return "\n".join(lines)


def _render_contacts_md(contacts: list[dict]) -> str:
    lines: list[str] = ["---", f"## Extracted Contacts ({len(contacts)})", ""]

    for i, c in enumerate(contacts, 1):
        name = f"{c.get('first_name', '')} {c.get('last_name', '') or ''}".strip()
        phone_numbers = normalize_contact_phone_entries(
            c.get("phone_numbers")
            or (
                [{"number": c.get("phone"), "type": "unknown", "is_primary": True}]
                if c.get("phone")
                else []
            )
        )
        phone_display = (
            ", ".join(
                f"{entry['number']} ({entry['type']})"
                + (" [primary]" if entry.get("is_primary") else "")
                for entry in phone_numbers
            )
            if phone_numbers
            else "N/A"
        )
        lines.append(f"### {i}. {name} — {c.get('title') or 'N/A'}")
        lines.append("")
        lines.append(f"- **Email:** {c.get('email') or 'N/A'}")
        lines.append(f"- **Phone:** {phone_display}")
        lines.append(f"- **LinkedIn:** {c.get('linkedin_url') or 'N/A'}")
        lines.append(f"- **Facebook:** {c.get('facebook_url') or 'N/A'}")
        lines.append(f"- **Instagram:** {c.get('instagram_url') or 'N/A'}")
        lines.append(f"- **Apollo ID:** {c.get('apollo_person_id') or 'N/A'}")

        summary = c.get("summary") or {}
        if summary.get("role_description"):
            lines.append(f"- **About:** {summary['role_description']}")
        if summary.get("relevance"):
            lines.append(f"- **Why they matter:** {summary['relevance']}")
        if summary.get("personal_background"):
            lines.append(f"- **Personal:** {summary['personal_background']}")

        if experiences := c.get("experiences"):
            lines += ["", "**Experience:**", ""]
            for exp in experiences:
                start = exp.get("start_date") or "?"
                end = exp.get("end_date") or "Present"
                lines.append(
                    f"- {exp.get('title') or 'N/A'} at {exp.get('company', '?')} ({start} → {end})"
                )

        lines.append("")

    return "\n".join(lines)


def _render_strategic_context_md(ctx: dict) -> str:
    lines: list[str] = ["---", "## Extracted Strategic Context", ""]

    sections = [
        ("Recent Initiatives", "recent_initiatives", "recent_initiatives_sources"),
        ("Public Priorities", "public_priorities", "public_priorities_sources"),
        ("Operational Changes", "operational_changes", "operational_changes_sources"),
        (
            "Workflow Modernization Signals",
            "workflow_modernization_signals",
            "workflow_modernization_signals_sources",
        ),
    ]

    for heading, key, sources_key in sections:
        lines += [f"### {heading}", ""]
        if text := ctx.get(key):
            lines.append(text)
            if sources := ctx.get(sources_key):
                lines += ["", "**Sources:**"]
                lines += [f"- {url}" for url in sources]
        else:
            lines.append("*No information found.*")
        lines.append("")

    events = ctx.get("trigger_events") or []
    lines += [f"### Trigger Events ({len(events)})", ""]
    if events:
        for i, ev in enumerate(events, 1):
            lines.append(
                f"**{i}. [{ev.get('category', 'N/A')}]** {ev.get('description', '')}"
            )
            if src := ev.get("source"):
                lines.append(f"   Source: {src}")
            lines.append("")
    else:
        lines += ["*No trigger events found.*", ""]

    return "\n".join(lines)


def _render_background_md(background: str) -> str:
    return "---\n## Extracted Company Background\n\n" + background + "\n"


# ===========================================================================
# Contact enrichment
# ===========================================================================

_RESEARCH_PROMPT = """\
You are a research assistant that discovers key contacts at a company. \
Your job is to find leadership and important stakeholders using the \
tools available to you.

Target roles (find as many as possible):
- C-Suite: CEO, CIO, CTO, CFO, COO, CCO, CMO, CHRO
- Presidents, Owners, Partners, Managing Directors
- Board Members
- VP-level: VP of Sales, VP of IT, VP of Operations, VP of Finance, etc.
- Directors: Director of IT, Director of Operations, Director of Purchasing, etc.
- Key managers: Customer Service Manager, Purchasing Manager, Operations Manager, \
IT Manager, Warehouse Manager

Research strategy (CRITICAL):
1. First round: Fire off MULTIPLE parallel web_search calls to discover names. \
Use varied queries:
   - "[company] leadership team"
   - "[company] executives"
   - "[company] management team"
   - "[company] team site:linkedin.com"
   - "[company] [domain] site:linkedin.com"
   - "[company] about us team"
   - "[company] press releases" (authors/quoted people are often leaders)
   - "[company] board of directors"
Also call enrich_organization on the company domain to get firmographic data.

2. Second round: For EVERY name discovered, call enrich_person in parallel \
with as many identifying details as possible (name, domain, organization_name). \
This gives you verified title, email, LinkedIn, photo, full employment history, \
and any available phone numbers with types.

3. Third round: If you found fewer than 5 contacts, do additional web searches \
with different query patterns to find more people.

4. Social media & personal background round: For each discovered person, search \
for their social media presence and personal background. Use queries like:
   - "[first_name] [last_name] [company] facebook"
   - "[first_name] [last_name] [company] instagram"
   - "[first_name] [last_name] [company] personal background"
   - "[first_name] [last_name] [company] community involvement"
   - "[first_name] [last_name] [company] hobbies interests"
   - "[first_name] [last_name] [company] awards charity volunteer"
Fire off these searches in parallel for all discovered contacts. Look for \
Facebook profile URLs (facebook.com/...) and Instagram handles (@... or \
instagram.com/...). Also gather any personal details: hobbies, interests, \
alma mater, community involvement, volunteer work, personal achievements, \
family details, etc.

Social media verification (CRITICAL — do NOT guess):
When evaluating whether a Facebook or Instagram profile belongs to the person, \
use multiple corroborating signals:
  - **Name match:** The profile name should match the person's known name.
  - **Education:** Does the profile list a university, college, or degree that \
    aligns with what you found in their professional background (LinkedIn, \
    Apollo, or web search results)?
  - **Geography:** Does the profile's listed city, state, or region match the \
    person's known work location or company HQ?
  - **Employer/industry references:** Does the profile mention the company, \
    industry, or related professional details?
  - **Mutual connections or photos:** Any contextual clues (company events, \
    coworkers, industry conferences) that tie back to the person.
Only include a social media URL if at least TWO of these signals corroborate \
the match (name alone is not sufficient). If you cannot verify with confidence, \
set the URL to null.

Verification rules:
- Cross-reference information from multiple sources when possible.
- Only include contacts you are confident actually work at this company.
- If a person's name appeared in search results but enrich_person returned a \
different company, exclude them.
- Prefer enriched data from Apollo over web search snippets.

Keep researching until you have gathered as much information as possible. \
After your research is complete, summarize the contacts you found with their \
details and employment history.

Final answer rules:
- Return only JSON that matches the required schema.
- contacts must be sorted by seniority/decision-making power, highest first:
  1) Owners/Presidents/CEOs/Managing Directors/Partners
  2) Other C-suite
  3) General Managers
  4) VPs
  5) Directors
  6) Managers
  7) Other staff
- Within the same tier, place broader scope/purchasing authority first.
- title must be the FULL specific title, not a generic abbreviation. \
For example use "Vice President of Sales and Marketing" instead of just \
"Vice President", "Director of Information Technology" instead of just \
"Director", etc. Always include the functional area when available.
- role_description should be 1-2 sentences (~195-205 chars).
- relevance should be 1-2 sentences (~225-235 chars).
- personal_background should be 1-2 sentences (~230-250 chars). If a \
Facebook or Instagram profile was found and verified, personal_background \
MUST primarily draw from what is visible on those profiles (interests, \
hobbies, photos/activities, alma mater, family, community posts, etc.). \
Supplement with other web sources only after exhausting social media content. \
If no social media was found, use any other personal details discovered \
(alma mater, community involvement, volunteer work, hobbies, etc.). \
Set to null only if absolutely nothing personal is found.
- facebook_url and instagram_url must be full URLs or null if not found.
- phone_numbers must be an array of objects with `number`, `type`, and \
  `is_primary`. Include every known phone number. Mark exactly one as primary \
  when at least one phone number is available. If none are known, return `[]`.
- experiences must be an array of strings in this exact format:
  "Company | Title | Start Date | End Date"
  Use empty string for unknown values. Use "Present" for current roles."""

_CONTACTS_JSON_SCHEMA: dict = _json_schema(
    "enriched_contacts",
    {
        "type": "object",
        "properties": {
            "contacts": {
                "type": "array",
                "description": (
                    "List of discovered contacts at the company, ordered "
                    "from most important to least important for sales engagement"
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "apollo_person_id": {
                            "type": ["string", "null"],
                            "description": "The Apollo person ID from enrich_person results",
                        },
                        "first_name": {"type": "string"},
                        "last_name": {"type": ["string", "null"]},
                        "title": {
                            "type": ["string", "null"],
                            "description": "Current title at this company",
                        },
                        "email": {"type": ["string", "null"]},
                        "phone_numbers": {
                            "type": "array",
                            "description": (
                                "All known phone numbers for this contact. "
                                "Include a type like mobile, office, direct, or unknown."
                            ),
                            "items": {
                                "type": "object",
                                "properties": {
                                    "number": {"type": "string"},
                                    "type": {"type": ["string", "null"]},
                                    "is_primary": {"type": "boolean"},
                                },
                                "required": ["number", "type", "is_primary"],
                                "additionalProperties": False,
                            },
                        },
                        "linkedin_url": {"type": ["string", "null"]},
                        "photo_url": {"type": ["string", "null"]},
                        "role_description": {
                            "type": "string",
                            "description": "1-2 sentence description of their role. 195-205 characters.",
                        },
                        "relevance": {
                            "type": "string",
                            "description": "1-2 sentences on why this person matters for sales. 225-235 characters.",
                        },
                        "personal_background": {
                            "type": ["string", "null"],
                            "description": (
                                "1-2 sentences (~230-250 chars) about the person's "
                                "personal interests, hobbies, alma mater, community "
                                "involvement, or anything that humanizes them. "
                                "Null if unknown."
                            ),
                        },
                        "facebook_url": {
                            "type": ["string", "null"],
                            "description": "Full Facebook profile URL, or null if not found.",
                        },
                        "instagram_url": {
                            "type": ["string", "null"],
                            "description": "Full Instagram profile URL, or null if not found.",
                        },
                        "experiences": {
                            "type": "array",
                            "description": (
                                "Full employment history as strings formatted exactly: "
                                "'Company | Title | Start Date | End Date'. "
                                "Use 'Present' for current roles."
                            ),
                            "items": {"type": "string"},
                        },
                    },
                    "required": [
                        "apollo_person_id",
                        "first_name",
                        "last_name",
                        "title",
                        "email",
                        "phone_numbers",
                        "linkedin_url",
                        "photo_url",
                        "role_description",
                        "relevance",
                        "personal_background",
                        "facebook_url",
                        "instagram_url",
                        "experiences",
                    ],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["contacts"],
        "additionalProperties": False,
    },
)


def _parse_experience_item(item: Any) -> dict[str, str | None]:
    """Parse a single experience entry (pipe-delimited string or dict) into a dict."""
    _CURRENT = {"", "present", "current"}

    if isinstance(item, dict):
        company = (item.get("company") or "").strip() or "Unknown"
        title = (item.get("title") or "").strip() or None
        start_date = (item.get("start_date") or "").strip() or None
        end_raw = (item.get("end_date") or "").strip()
        return {
            "company": company,
            "title": title,
            "start_date": start_date,
            "end_date": None if end_raw.lower() in _CURRENT else end_raw,
        }

    parts = [p.strip() for p in str(item).split("|", 3)]
    while len(parts) < 4:
        parts.append("")
    company, title, start_date, end_raw = parts
    return {
        "company": company or "Unknown",
        "title": title or None,
        "start_date": start_date or None,
        "end_date": None if end_raw.lower() in _CURRENT else end_raw,
    }


def _parse_contacts_output(content: str) -> list[dict]:
    payload = json.loads(content)
    contacts = payload.get("contacts")
    if not isinstance(contacts, list):
        raise ValueError("Structured output missing contacts array")

    normalized: list[dict] = []
    for c in contacts:
        if not isinstance(c, dict):
            continue
        phone_numbers = normalize_contact_phone_entries(
            c.get("phone_numbers")
            or (
                [{"number": c.get("phone"), "type": "unknown", "is_primary": True}]
                if c.get("phone")
                else []
            )
        )
        experiences = [
            _parse_experience_item(exp) for exp in (c.get("experiences") or [])
        ]
        personal_bg = (c.get("personal_background") or "").strip() or None
        normalized.append(
            {
                **c,
                "summary": {
                    "role_description": (c.get("role_description") or "").strip(),
                    "relevance": (c.get("relevance") or "").strip(),
                    "personal_background": personal_bg,
                },
                "phone": primary_phone_number(phone_numbers),
                "phone_numbers": phone_numbers,
                "facebook_url": (c.get("facebook_url") or "").strip() or None,
                "instagram_url": (c.get("instagram_url") or "").strip() or None,
                "experiences": experiences,
            }
        )
    return normalized


async def _persist_contacts(
    db: AsyncSession,
    lead_id: int,
    contacts: list[dict],
) -> list[LeadContact]:
    """Delete existing contacts for this lead and insert new ones."""
    await db.execute(delete(LeadContact).where(LeadContact.lead_id == lead_id))
    await db.flush()

    saved: list[LeadContact] = []
    saved_ids: list[int] = []
    for c in contacts:
        phone_numbers = normalize_contact_phone_entries(
            c.get("phone_numbers")
            or (
                [{"number": c.get("phone"), "type": "unknown", "is_primary": True}]
                if c.get("phone")
                else []
            )
        )
        contact = LeadContact(
            lead_id=lead_id,
            apollo_person_id=c.get("apollo_person_id"),
            first_name=c.get("first_name", "Unknown"),
            last_name=c.get("last_name"),
            email=c.get("email"),
            phone=primary_phone_number(phone_numbers),
            title=c.get("title"),
            linkedin_url=c.get("linkedin_url"),
            facebook_url=c.get("facebook_url"),
            instagram_url=c.get("instagram_url"),
            photo_url=c.get("photo_url"),
            summary=c.get("summary"),
        )
        db.add(contact)
        await db.flush()

        for entry in phone_numbers:
            db.add(
                LeadContactPhone(
                    contact_id=contact.id,
                    number=entry["number"],
                    type=entry["type"],
                    status=entry.get("status"),
                    confidence=entry.get("confidence"),
                    is_primary=entry["is_primary"],
                )
            )
        for exp in c.get("experiences") or []:
            db.add(
                ContactExperience(
                    contact_id=contact.id,
                    company=exp.get("company", "Unknown"),
                    title=exp.get("title"),
                    start_date=exp.get("start_date"),
                    end_date=exp.get("end_date"),
                )
            )
        saved.append(contact)
        saved_ids.append(contact.id)

    await db.commit()
    if saved_ids:
        saved_rows = await db.execute(
            select(LeadContact)
            .options(selectinload(LeadContact.phone_numbers))
            .where(LeadContact.id.in_(saved_ids))
        )
        saved_by_id = {contact.id: contact for contact in saved_rows.scalars().all()}
        saved = [saved_by_id[contact_id] for contact_id in saved_ids if contact_id in saved_by_id]

    await _drain_phone_cache(db, saved)
    return saved


async def _drain_phone_cache(
    db: AsyncSession,
    contacts: list[LeadContact],
) -> None:
    """Apply any cached webhook phone results to newly persisted contacts."""
    apollo_ids = [c.apollo_person_id for c in contacts if c.apollo_person_id]
    if not apollo_ids:
        return

    result = await db.execute(
        select(ApolloPhoneCache).where(
            ApolloPhoneCache.apollo_person_id.in_(apollo_ids)
        )
    )
    cached_rows = result.scalars().all()
    if not cached_rows:
        return

    cache_by_id: dict[str, list[dict[str, Any]]] = {}
    for row in cached_rows:
        cache_by_id.setdefault(row.apollo_person_id, []).extend(row.phone_numbers or [])

    updated = 0
    for contact in contacts:
        cached_entries = cache_by_id.get(contact.apollo_person_id)
        if not cached_entries:
            continue

        merged_entries = normalize_contact_phone_entries(
            [serialize_phone_model(phone) for phone in contact.phone_numbers]
            + cached_entries
        )
        if not merged_entries:
            continue

        contact.phone = primary_phone_number(merged_entries)
        await db.execute(
            delete(LeadContactPhone).where(LeadContactPhone.contact_id == contact.id)
        )
        for entry in merged_entries:
            db.add(
                LeadContactPhone(
                    contact_id=contact.id,
                    number=entry["number"],
                    type=entry["type"],
                    status=entry.get("status"),
                    confidence=entry.get("confidence"),
                    is_primary=entry["is_primary"],
                )
            )
        updated += 1

    await db.execute(
        delete(ApolloPhoneCache).where(
            ApolloPhoneCache.apollo_person_id.in_(apollo_ids)
        )
    )
    await db.commit()

    if updated:
        ts = datetime.now(timezone.utc).isoformat()
        print(
            f"[apollo-webhook {ts}] Drained phone cache: "
            f"{updated} contacts backfilled with phone numbers",
            flush=True,
        )


async def enrich_lead_contacts(
    *,
    lead: Lead,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    messages = _build_enrich_messages(
        _RESEARCH_PROMPT,
        "Find all key leadership and stakeholders at this company and return their details.",
        lead,
    )

    async def persist(contacts_data: list[dict]) -> dict:
        saved = await _persist_contacts(db, lead.id, contacts_data)
        return {"contact_count": len(saved)}

    async for chunk in _run_enrich_sse(
        lead=lead,
        messages=messages,
        response_format=_CONTACTS_JSON_SCHEMA,
        parse=_parse_contacts_output,
        persist=persist,
        trace_kind="contacts",
        trace_renderer=_render_contacts_md,
    ):
        yield chunk


# ===========================================================================
# Strategic context enrichment
# ===========================================================================

_STRATEGIC_RESEARCH_PROMPT = """\
You are a research assistant gathering strategic context about a company. \
Your goal is to find actionable intelligence that a sales team can use to \
craft relevant outreach.

You must research ALL of the following areas:

1. **Recent Initiatives** – expansion plans, new hires/hiring sprees, \
restructuring, new product lines, geographic growth, acquisitions, \
new partnerships, or facility openings.

2. **Public Priorities from Leadership** – quotes from executives in press \
releases, earnings calls, interviews, or conference appearances about \
where the company is headed, what they're investing in, or what keeps \
them up at night.

3. **Operational Changes** – supply-chain shifts, warehouse/logistics changes, \
new distribution centers, technology rollouts, process improvements, or \
organizational restructuring.

4. **Workflow Modernization Signals** – any evidence they are moving from \
manual/legacy processes to modern tools (e.g. replacing spreadsheets or \
fax-based ordering with digital systems, adopting new ERP modules, \
investing in automation, or evaluating SaaS platforms).

5. **Trigger Events** – specific, time-bound events that create a sales \
opening. Look for as many as you can find, including:
   - Recent funding rounds or M&A activity
   - Leadership changes (new CEO, CIO, VP of Ops, etc.)
   - New systems rollout or technology adoption
   - Hiring surge in relevant functions (IT, operations, purchasing)
   - Publicly stated strategic initiatives or transformation programs
   - Major customer, channel, or product changes
   - Regulatory or compliance changes affecting their business
   - Facility expansions, relocations, or consolidations

Research strategy:
1. First round: Fire off MULTIPLE parallel web_search calls:
   - "[company] expansion plans"
   - "[company] recent news"
   - "[company] press release"
   - "[company] hiring"
   - "[company] CEO interview OR leadership priorities"
   - "[company] new technology OR digital transformation"
   - "[company] operations update"
   - "[company] acquisition OR partnership"
   Also call enrich_organization on the company domain.

2. Second round: Based on initial results, do targeted follow-up searches \
on any promising leads (e.g. a specific acquisition, a named executive's \
quotes, a mentioned technology initiative).

3. Third round: Fill in any gaps – if you found nothing for one of the \
categories above, try alternative search angles.

Be thorough but factual. Only include information you can substantiate \
from search results. Cite specific facts, dates, and names where possible.

Final answer rules:
- Return only JSON that matches the required schema.
- For each context category, write 2-4 sentences (~200-400 chars).
- Include names, dates, and concrete facts; stay neutral.
- If no information is found for a category, set its text and sources to null.
- Include only real URLs from search results in source arrays.
- trigger_events must include category + description + optional source URL and
  be ordered by recency (most recent first)."""

_SOURCE_ARRAY_SCHEMA: dict = {
    "type": ["array", "null"],
    "description": "URLs of web pages where this information was found.",
    "items": {"type": "string"},
}

_STRATEGIC_JSON_SCHEMA: dict = _json_schema(
    "strategic_context",
    {
        "type": "object",
        "properties": {
            "recent_initiatives": {
                "type": ["string", "null"],
                "description": "Recent initiatives: expansion, hiring, restructuring, new product lines, geographic growth, acquisitions.",
            },
            "recent_initiatives_sources": _SOURCE_ARRAY_SCHEMA,
            "public_priorities": {
                "type": ["string", "null"],
                "description": "Public priorities and strategic direction from leadership.",
            },
            "public_priorities_sources": _SOURCE_ARRAY_SCHEMA,
            "operational_changes": {
                "type": ["string", "null"],
                "description": "Operational changes in supply chain, logistics, technology, or processes.",
            },
            "operational_changes_sources": _SOURCE_ARRAY_SCHEMA,
            "workflow_modernization_signals": {
                "type": ["string", "null"],
                "description": "Signals that the company is moving from legacy/manual workflows to modern digital tools.",
            },
            "workflow_modernization_signals_sources": _SOURCE_ARRAY_SCHEMA,
            "trigger_events": {
                "type": "array",
                "description": "List of specific trigger events that create sales openings.",
                "items": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "description": "Event category, e.g. 'Funding / M&A', 'Leadership Change', 'New Systems Rollout'.",
                        },
                        "description": {
                            "type": "string",
                            "description": "1-2 sentence description of the event with dates and details.",
                        },
                        "source": {
                            "type": ["string", "null"],
                            "description": "URL of the web page where this was found.",
                        },
                    },
                    "required": ["category", "description", "source"],
                    "additionalProperties": False,
                },
            },
        },
        "required": [
            "recent_initiatives",
            "recent_initiatives_sources",
            "public_priorities",
            "public_priorities_sources",
            "operational_changes",
            "operational_changes_sources",
            "workflow_modernization_signals",
            "workflow_modernization_signals_sources",
            "trigger_events",
        ],
        "additionalProperties": False,
    },
)

_STRATEGIC_TEXT_KEYS = [
    "recent_initiatives",
    "public_priorities",
    "operational_changes",
    "workflow_modernization_signals",
]


_parse_strategic_context_output = _parse_json_output


async def _persist_strategic_context(
    db: AsyncSession,
    lead_id: int,
    ctx_data: dict,
) -> LeadStrategicContext:
    result = await db.execute(
        select(LeadStrategicContext).where(LeadStrategicContext.lead_id == lead_id)
    )
    ctx = result.scalar_one_or_none()
    if ctx is None:
        ctx = LeadStrategicContext(lead_id=lead_id)
        db.add(ctx)

    ctx.recent_initiatives = ctx_data.get("recent_initiatives")
    ctx.recent_initiatives_sources = ctx_data.get("recent_initiatives_sources")
    ctx.public_priorities = ctx_data.get("public_priorities")
    ctx.public_priorities_sources = ctx_data.get("public_priorities_sources")
    ctx.operational_changes = ctx_data.get("operational_changes")
    ctx.operational_changes_sources = ctx_data.get("operational_changes_sources")
    ctx.workflow_modernization_signals = ctx_data.get("workflow_modernization_signals")
    ctx.workflow_modernization_signals_sources = ctx_data.get(
        "workflow_modernization_signals_sources"
    )
    ctx.trigger_events = ctx_data.get("trigger_events")

    await db.commit()
    await db.refresh(ctx)
    return ctx


async def enrich_lead_strategic_context(
    *,
    lead: Lead,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    messages = _build_enrich_messages(
        _STRATEGIC_RESEARCH_PROMPT,
        "Research the strategic context for this company. "
        "Cover all five areas: recent initiatives, public priorities, "
        "operational changes, workflow modernization signals, "
        "and trigger events.",
        lead,
    )

    async def persist(ctx_data: dict) -> dict:
        await _persist_strategic_context(db, lead.id, ctx_data)
        filled = sum(1 for k in _STRATEGIC_TEXT_KEYS if ctx_data.get(k))
        return {"fields_filled": filled}

    async for chunk in _run_enrich_sse(
        lead=lead,
        messages=messages,
        response_format=_STRATEGIC_JSON_SCHEMA,
        parse=_parse_strategic_context_output,
        persist=persist,
        trace_kind="strategic_context",
        trace_renderer=_render_strategic_context_md,
    ):
        yield chunk


# ===========================================================================
# Company background enrichment
# ===========================================================================

_BACKGROUND_RESEARCH_PROMPT = """\
You are a research assistant writing a general background overview of a company. \
Use the tools available to you to research the company thoroughly.

Research strategy:
1. First round: Fire off MULTIPLE parallel web_search calls:
   - "[company] about"
   - "[company] company overview"
   - "[company] history founded"
   - "[company] products services"
   - "[company] headquarters locations employees"
   Also call enrich_organization on the company domain.

2. Second round: Follow up on anything interesting from the first round.

After your research, summarize everything you learned about the company.

Final answer rules:
- Return only JSON that matches the required schema.
- The company_background field must be Markdown and include sections where data
  exists:
  - Overview (what the company does, founding, HQ)
  - Products & Services
  - Scale (revenue, employee count, locations when available)
  - Market Position
  - History
- Use markdown headers, bullets, and bold text for readability.
- Keep it factual and specific (numbers, dates, names) and neutral in tone.
- Keep it concise but thorough (~300-500 words)."""

_BACKGROUND_JSON_SCHEMA: dict = _json_schema(
    "company_background",
    {
        "type": "object",
        "properties": {
            "company_background": {
                "type": "string",
                "description": (
                    "Comprehensive company background in Markdown with sections "
                    "for overview, products/services, scale, market position, and history."
                ),
            }
        },
        "required": ["company_background"],
        "additionalProperties": False,
    },
)


def _parse_company_background_output(content: str) -> str:
    payload = json.loads(content)
    background = payload.get("company_background")
    if not isinstance(background, str) or not background.strip():
        raise ValueError("Structured output missing company_background")
    return background


async def _persist_company_background(
    db: AsyncSession,
    lead_id: int,
    background: str,
) -> None:
    result = await db.execute(
        select(LeadStrategicContext).where(LeadStrategicContext.lead_id == lead_id)
    )
    ctx = result.scalar_one_or_none()
    if ctx is None:
        ctx = LeadStrategicContext(lead_id=lead_id)
        db.add(ctx)
    ctx.company_background = background
    await db.commit()


async def enrich_lead_company_background(
    *,
    lead: Lead,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    messages = _build_enrich_messages(
        _BACKGROUND_RESEARCH_PROMPT,
        "Research and write a general background for this company.",
        lead,
    )

    async def persist(background: str) -> dict:
        await _persist_company_background(db, lead.id, background)
        return {}

    async for chunk in _run_enrich_sse(
        lead=lead,
        messages=messages,
        response_format=_BACKGROUND_JSON_SCHEMA,
        parse=_parse_company_background_output,
        persist=persist,
        trace_kind="company_background",
        trace_renderer=_render_background_md,
    ):
        yield chunk


# ===========================================================================
# Company profile enrichment (employee count, revenue, HQ, phone, locations, buying groups, industry, company type)
# ===========================================================================

_PROFILE_FIELDS_TO_ENRICH = [
    ("domain", "Company website domain (e.g. example.com)"),
    ("employee_count", "Number of employees (integer)"),
    (
        "revenue_m",
        "Annual revenue in USD millions as a required numeric string "
        "(e.g. 125 or 125.5)",
    ),
    ("hq_address", "Headquarters address (city, state or full address)"),
    ("hq_phone", "Headquarters main phone number"),
    ("hq_timezone", "IANA time zone of the headquarters (e.g. America/New_York)"),
    ("num_locations", "Number of locations/branches/facilities (integer)"),
    ("buying_groups", "Buying groups, co-ops, or purchasing alliances as a list of names"),
    ("primary_industry", "Primary industry from the allowed taxonomy"),
    ("company_type", "Whether the company is a Distributor, Manufacturer, or Other"),
]

_PROFILE_RESEARCH_PROMPT = """\
You are a research assistant finding basic company profile facts. \
Use web_search to find accurate, up-to-date values for the company profile \
fields listed below and refresh existing values when stronger evidence is found.

Research strategy:
1. First round: Use Apollo organization enrichment as early as possible, but treat it as guidance rather than ground truth.
   - If the company domain is already known, call enrich_organization \
     immediately on that domain.
   - If the domain is missing, use web_search to find the official website \
     first, then call enrich_organization on the discovered domain.
2. In parallel with Apollo, fire off MULTIPLE web_search calls:
   - "[company] website"
   - "[company] headquarters location"
   - "[company] headquarters phone number"
   - "[company] number of employees"
   - "[company] annual revenue"
   - "[company] locations branches"
   - "[company] industry"
   - "[company] manufacturer distributor"
   - "[company] buying group OR cooperative OR co-op OR purchasing alliance"
   - "[company] about us"
3. Trust but verify: use web_search to verify the most important Apollo results, \
especially employee count, revenue, headquarters, headquarters phone number, \
industry, company type, and buying groups.
   - Employee count and revenue require extra scrutiny. Do not treat Apollo \
     alone as sufficient ground truth if you can find corroboration from the \
     company's website, annual reports, filings, press releases, or other \
     credible sources.
   - If Apollo and web sources disagree, prefer the value that is better \
     supported by the company's website or multiple credible sources.
   - For revenue specifically, use Apollo plus as much web_search evidence as \
     possible. Prioritize the company website, investor relations, annual \
     reports, filings, press releases, Apollo, and high-quality firmographic \
     sources surfaced by web_search.
   - If Apollo gives an employee or revenue number but you cannot reasonably \
     corroborate it, prefer a better-supported non-Apollo figure. For revenue, \
     do not return null just because corroboration is weak; keep researching \
     until you have either a sourced figure or a defensible estimate.
4. If any fields are still missing after the first round, do targeted \
follow-up searches with different query angles.
5. Revenue is mandatory:
   - Spend up to 10 distinct revenue-focused web_search calls trying to find a \
     direct revenue figure or a tight range.
   - If you still cannot find a directly reported revenue figure after those \
     searches, return your best estimate for annual revenue based on the \
     strongest available evidence (Apollo, employee count, number of locations, \
     company scale, market position, and comparable source snippets).
   - The estimate must still be a numeric string in USD millions.

Rules:
- Only fill in fields you can substantiate from search results.
- Use Apollo as an initial firmographic source and research aid, not as the \
final authority. Trust it as a clue, then verify it.
- For domain, return only the bare domain (e.g. "example.com"), not a \
full URL. Do not include "www." or "https://".
- For employee_count and num_locations, return integers (best estimate). \
For employee_count specifically, prefer numbers supported by non-Apollo sources \
when available.
- For revenue_m, return annual revenue in USD millions as a numeric string \
without "$" or "M" (e.g. "125", "125.5"). If a source reports billions, \
convert to millions (e.g. $1.2B -> "1200"). If you can only find a range or \
non-numeric tier, convert it into your best single-number estimate rather than \
returning null. Prefer revenue figures supported by non-Apollo sources when \
available, but if direct evidence is unavailable after 10 revenue-focused \
searches, provide your best estimate anyway. Never return null for revenue_m.
- For hq_address, use the format "City, State" or a fuller address if known.
- For hq_phone, return the company's main headquarters phone number as a \
  string. Prefer the main corporate or headquarters line, not a personal \
  number. Use the format shown on the source when possible.
- For hq_timezone, return the IANA time zone identifier for the \
headquarters location (e.g. "America/New_York", "America/Chicago", \
"America/Los_Angeles", "Europe/London"). Derive it from the HQ address.
- For buying_groups, return an array of buying group / cooperative / alliance \
  names. Include as many substantiated groups as you can find. Use [] if you \
  looked and found none.
- For primary_industry, choose EXACTLY ONE of these labels:
  Electrical, Plumbing, HVAC, Building Materials, Medical, Automotive, \
  Services / Contractors, Other / Unknown, Lumber, Fasteners, \
  PVF (Pipes, Valves, Fittings), Fluid Power.
- For company_type, choose EXACTLY ONE of: Distributor, Manufacturer, \
  Other. If the company is mainly a contractor, service business, or the \
  business model is unclear, use Other. If it does both distribution and \
  manufacturing, choose the dominant model described on its website or in \
  search results.
- If the company does not clearly fit one of the industry labels above, use \
  Other / Unknown.
- If you cannot find a value, set it to null.
- Return only JSON that matches the required schema."""


def _enum_or_null_schema(values: tuple[str, ...], description: str) -> dict:
    return {
        "anyOf": [
            {"type": "string", "enum": list(values)},
            {"type": "null"},
        ],
        "description": description,
    }

_PROFILE_JSON_SCHEMA: dict = _json_schema(
    "company_profile_fields",
    {
        "type": "object",
        "properties": {
            "domain": {
                "type": ["string", "null"],
                "description": "Company website domain (e.g. 'example.com'). No www. or https://.",
            },
            "employee_count": {
                "type": ["integer", "null"],
                "description": "Total number of employees.",
            },
            "revenue_m": {
                "type": "string",
                "pattern": r"^\d+(?:\.\d+)?$",
                "description": (
                    "Required annual revenue in USD millions as a numeric string "
                    "without '$' or 'M'. Never null; estimate after up to 10 "
                    "revenue-focused web searches if needed."
                ),
            },
            "hq_address": {
                "type": ["string", "null"],
                "description": "Headquarters address (city, state or full address).",
            },
            "hq_phone": {
                "type": ["string", "null"],
                "description": "Main headquarters phone number.",
            },
            "hq_timezone": {
                "type": ["string", "null"],
                "description": "IANA time zone of the headquarters (e.g. 'America/New_York').",
            },
            "num_locations": {
                "type": ["integer", "null"],
                "description": "Number of locations, branches, or facilities.",
            },
            "buying_groups": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Buying groups, co-ops, or purchasing alliances associated with the company.",
            },
            "primary_industry": _enum_or_null_schema(
                LEAD_INDUSTRY_VALUES,
                "Primary industry. Must be one of the allowed taxonomy labels.",
            ),
            "company_type": _enum_or_null_schema(
                LEAD_COMPANY_TYPE_VALUES,
                "Whether the company is a Distributor, Manufacturer, or Other.",
            ),
        },
        "required": [
            "domain",
            "employee_count",
            "revenue_m",
            "hq_address",
            "hq_phone",
            "hq_timezone",
            "num_locations",
            "buying_groups",
            "primary_industry",
            "company_type",
        ],
        "additionalProperties": False,
    },
)


_parse_profile_output = _parse_json_output


async def _persist_profile_fields(
    db: AsyncSession,
    lead: Lead,
    fields: dict,
) -> dict:
    """Apply non-null enriched fields to the company profile and lead."""
    result = await db.execute(
        select(LeadCompanyProfile).where(LeadCompanyProfile.lead_id == lead.id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = LeadCompanyProfile(lead_id=lead.id)
        db.add(profile)

    updated = 0

    def set_if_changed(obj, key: str, value) -> None:
        nonlocal updated
        if value is None:
            return
        if getattr(obj, key, None) == value:
            return
        setattr(obj, key, value)
        updated += 1

    domain = fields.get("domain")
    set_if_changed(lead, "domain", domain)

    buying_groups = normalize_buying_groups(fields.get("buying_groups"))
    primary_industry = normalize_lead_industry(fields.get("primary_industry"))
    company_type = normalize_lead_company_type(fields.get("company_type"))
    hq_phone = normalize_hq_phone(fields.get("hq_phone"))

    for key in (
        "employee_count",
        "revenue_m",
        "hq_address",
        "hq_phone",
        "hq_timezone",
        "num_locations",
    ):
        value = hq_phone if key == "hq_phone" else fields.get(key)
        set_if_changed(profile, key, value)

    for key, value in (
        ("buying_groups", buying_groups),
        ("primary_industry", primary_industry),
        ("company_type", company_type),
    ):
        set_if_changed(profile, key, value)

    await db.commit()
    await db.refresh(profile)
    return {"fields_updated": updated}


def _render_profile_md(fields: dict) -> str:
    lines = ["---", "## Extracted Profile Fields", ""]
    for key, desc in _PROFILE_FIELDS_TO_ENRICH:
        val = fields.get(key)
        lines.append(f"- **{desc}:** {val if val is not None else '*not found*'}")
    lines.append("")
    return "\n".join(lines)


async def enrich_lead_profile(
    *,
    lead: Lead,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    requested_fields = "\n".join(f"- {desc}" for _, desc in _PROFILE_FIELDS_TO_ENRICH)
    messages = _build_enrich_messages(
        _PROFILE_RESEARCH_PROMPT,
        (
            "Refresh the following company profile fields for this company. "
            "Return the best current values you can substantiate, even if the "
            "company already has existing values.\n\n"
            f"{requested_fields}\n\nKnown information:"
        ),
        lead,
    )

    async def persist(fields: dict) -> dict:
        return await _persist_profile_fields(db, lead, fields)

    async for chunk in _run_enrich_sse(
        lead=lead,
        messages=messages,
        response_format=_PROFILE_JSON_SCHEMA,
        parse=_parse_profile_output,
        persist=persist,
        tools=[_WEB_SEARCH_TOOL, _ENRICH_ORG_TOOL],
        trace_kind="company_profile",
        trace_renderer=_render_profile_md,
    ):
        yield chunk
