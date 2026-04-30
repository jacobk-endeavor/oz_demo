"""Run key-people enrichment as a standalone script.

Usage:
    uv run python scripts/enrich_company_key_people.py --company "Acme Corp" --domain acme.com
    uv run python scripts/enrich_company_key_people.py --lead-id 123
    uv run python scripts/enrich_company_key_people.py --lead-id 123 --persist

Progress logs are written to stderr. The final structured result is written to
stdout as JSON so it can be piped into other tooling if needed.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import async_session, engine as db_engine
from app.models.lead import Lead
from app.services.lead_enrich import (
    _CONTACTS_JSON_SCHEMA,
    _RESEARCH_PROMPT,
    _build_enrich_messages,
    _parse_contacts_output,
    _persist_contacts,
    _run_enrich_sse,
)


def _positive_int(raw: str) -> int:
    value = int(raw)
    if value <= 0:
        raise argparse.ArgumentTypeError("Value must be greater than zero.")
    return value


def _log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def _event_to_message(payload: dict[str, Any]) -> str | None:
    event = payload.get("event")
    if event == "started":
        return f"Starting key-people enrichment for {payload.get('company', 'unknown company')}."
    if event == "error":
        return f"Error: {payload.get('message', 'unknown error')}"
    if event != "progress":
        return None

    status = payload.get("status")
    if status == "thinking":
        return f"Research round {payload.get('round', '?')}."
    if status == "calling_tools":
        tools = ", ".join(payload.get("tools") or [])
        if tools:
            return f"Calling tools: {tools}"
        return "Calling enrichment tools."
    if status == "retrying":
        return (
            "Retrying enrichment "
            f"({payload.get('attempt', '?')}/{payload.get('max_attempts', '?')})."
        )
    if status == "extracting":
        return "Extracting structured contacts."
    if status == "saving":
        return "Finalizing result."
    return None


def _parse_sse_chunk(chunk: str) -> dict[str, Any] | None:
    if not chunk.startswith("data: "):
        return None

    raw = chunk.removeprefix("data: ").strip()
    if raw == "[DONE]":
        return {"event": "stream_done"}

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None

    return payload if isinstance(payload, dict) else None


async def _load_lead(lead_id: int) -> Lead:
    async with async_session() as db:
        result = await db.execute(
            select(Lead)
            .options(selectinload(Lead.profile))
            .where(Lead.id == lead_id)
        )
        lead = result.scalar_one_or_none()

    if lead is None:
        raise ValueError(f"Lead {lead_id} not found.")

    return lead


async def _run_key_people_enrichment(
    *,
    lead: Lead,
    persist: bool,
) -> dict[str, Any]:
    messages = _build_enrich_messages(
        _RESEARCH_PROMPT,
        "Find all key leadership and stakeholders at this company and return their details.",
        lead,
    )

    async def persist_contacts(contacts_data: list[dict[str, Any]]) -> dict[str, Any]:
        if persist:
            if lead.id is None:
                raise ValueError("Cannot persist contacts without a lead ID.")
            async with async_session() as db:
                saved = await _persist_contacts(db, lead.id, contacts_data)
            contact_count = len(saved)
        else:
            contact_count = len(contacts_data)

        return {
            "company": lead.company,
            "domain": lead.domain,
            "lead_id": lead.id,
            "persisted": persist,
            "contact_count": contact_count,
            "contacts": contacts_data,
        }

    stream = _run_enrich_sse(
        lead=lead,
        messages=messages,
        response_format=_CONTACTS_JSON_SCHEMA,
        parse=_parse_contacts_output,
        persist=persist_contacts,
    )

    last_done: dict[str, Any] | None = None
    last_error: str | None = None

    async for chunk in stream:
        payload = _parse_sse_chunk(chunk)
        if payload is None:
            continue

        if payload.get("event") == "stream_done":
            break

        message = _event_to_message(payload)
        if message:
            _log(message)

        if payload.get("event") == "done":
            last_done = payload
            last_error = None
        elif payload.get("event") == "error":
            last_error = payload.get("message", "unknown error")

    if last_done is not None:
        return last_done
    if last_error:
        raise RuntimeError(last_error)
    raise RuntimeError("Enrichment completed without returning a result.")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Discover key people at a company using the same contact "
            "enrichment flow as the app."
        )
    )
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument(
        "--lead-id",
        type=_positive_int,
        help="Existing lead to enrich. Reuses the lead's company/domain context.",
    )
    target.add_argument(
        "--company",
        help="Company name to enrich without needing an existing lead.",
    )
    parser.add_argument(
        "--domain",
        help="Company domain to include in the research context.",
    )
    parser.add_argument(
        "--persist",
        action="store_true",
        help=(
            "Persist contacts to the lead's existing lead_contacts rows. "
            "Only valid with --lead-id."
        ),
    )
    return parser


async def _run(args: argparse.Namespace) -> None:
    try:
        if not settings.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY is empty; cannot run enrichment.")

        if args.persist and args.lead_id is None:
            raise ValueError("--persist can only be used with --lead-id.")

        if args.lead_id is not None:
            lead = await _load_lead(args.lead_id)
        else:
            lead = Lead(company=args.company, domain=args.domain)

        result = await _run_key_people_enrichment(lead=lead, persist=args.persist)
        if result.get("event") == "done":
            result = {k: v for k, v in result.items() if k != "event"}
        print(json.dumps(result, indent=2, default=str))
    finally:
        await db_engine.dispose()


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    try:
        asyncio.run(_run(args))
    except KeyboardInterrupt:
        _log("Cancelled.")
        return 130
    except Exception as exc:
        _log(f"Failed: {exc}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
