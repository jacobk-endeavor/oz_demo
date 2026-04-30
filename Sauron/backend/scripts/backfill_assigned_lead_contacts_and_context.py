"""Backfill missing contacts and strategic context for assigned leads.

Runs the contacts, strategic context, and company background enrichment passes
for leads assigned to a user, but only when those data sets are currently
empty.

Usage:
    uv run python scripts/backfill_assigned_lead_contacts_and_context.py
    uv run python scripts/backfill_assigned_lead_contacts_and_context.py --max-concurrency 5
    uv run python scripts/backfill_assigned_lead_contacts_and_context.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from tqdm import tqdm

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import async_session, engine as db_engine
from app.models.lead import Lead
from app.services.lead_enrich import (
    enrich_lead_company_background,
    enrich_lead_contacts,
    enrich_lead_strategic_context,
)

_STRATEGIC_TEXT_FIELDS = [
    "recent_initiatives",
    "public_priorities",
    "operational_changes",
    "workflow_modernization_signals",
]
_LEAD_RETRY_BACKOFF_SECONDS = (2, 5)
_RETRYABLE_ERROR_SNIPPETS = (
    "please retry",
    "timed out",
    "timeout",
    "connection reset",
    "connection refused",
    "temporarily unavailable",
    "bad gateway",
    "service unavailable",
    "gateway timeout",
    "failed to save results",
    "internal server error",
)


def _positive_int(raw: str) -> int:
    value = int(raw)
    if value <= 0:
        raise argparse.ArgumentTypeError("Value must be greater than zero.")
    return value


def _has_text(value: str | None) -> bool:
    return bool(value and value.strip())


def _needs_contacts(lead: Lead) -> bool:
    return not lead.contacts


def _needs_strategic_context(lead: Lead) -> bool:
    ctx = lead.strategic_context
    if ctx is None:
        return True
    has_text_fields = any(_has_text(getattr(ctx, field, None)) for field in _STRATEGIC_TEXT_FIELDS)
    has_trigger_events = bool(ctx.trigger_events)
    return not has_text_fields and not has_trigger_events


def _needs_company_background(lead: Lead) -> bool:
    ctx = lead.strategic_context
    return ctx is None or not _has_text(ctx.company_background)


ENRICH_KINDS: list[tuple[str, Any, Any]] = [
    ("contacts", enrich_lead_contacts, _needs_contacts),
    ("strategic_context", enrich_lead_strategic_context, _needs_strategic_context),
    ("company_background", enrich_lead_company_background, _needs_company_background),
]


async def _drain_sse(gen) -> dict | None:
    """Consume an SSE async generator and return the final result payload."""
    last_done: dict | None = None
    last_error: dict | None = None
    async for chunk in gen:
        if not chunk.startswith("data: "):
            continue
        raw = chunk.removeprefix("data: ").strip()
        if raw == "[DONE]":
            break
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if payload.get("event") == "done":
            last_done = payload
            last_error = None
        elif payload.get("event") == "error":
            last_error = {"error": payload.get("message", "unknown error")}
    return last_done or last_error


def _is_retryable_error(message: str) -> bool:
    normalized = message.lower()
    return any(snippet in normalized for snippet in _RETRYABLE_ERROR_SNIPPETS)


async def _run_enrich_kind(
    lead_id: int,
    kind: str,
    enrich_fn: Any,
    needs_fn: Any,
) -> tuple[str, dict]:
    max_attempts = len(_LEAD_RETRY_BACKOFF_SECONDS) + 1
    company = "???"
    last_result: dict = {"error": "unknown error"}

    for attempt in range(1, max_attempts + 1):
        try:
            async with async_session() as db:
                result = await db.execute(select(Lead).where(Lead.id == lead_id))
                lead = result.scalar_one_or_none()
                if lead is None:
                    return "???", {"error": "lead not found"}

                company = lead.company
                if not needs_fn(lead):
                    return company, {"skipped": True}

                done = await _drain_sse(enrich_fn(lead=lead, db=db))
                last_result = done or {"done": True}
        except Exception as exc:
            last_result = {"error": str(exc)}

        if "error" not in last_result:
            return company, last_result
        if attempt >= max_attempts or not _is_retryable_error(last_result["error"]):
            return company, last_result

        wait_seconds = _LEAD_RETRY_BACKOFF_SECONDS[attempt - 1]
        print(
            f"Retrying [{lead_id}] {company} {kind} "
            f"(attempt {attempt + 1}/{max_attempts}) in {wait_seconds}s: "
            f"{last_result['error']}"
        )
        await asyncio.sleep(wait_seconds)

    return company, last_result


async def _enrich_one_lead(
    lead_id: int,
    semaphore: asyncio.Semaphore,
) -> tuple[int, str, dict]:
    async with semaphore:
        company = "???"
        results: dict[str, dict] = {}
        for kind, enrich_fn, needs_fn in ENRICH_KINDS:
            company, results[kind] = await _run_enrich_kind(
                lead_id,
                kind,
                enrich_fn,
                needs_fn,
            )
            if results[kind].get("error") == "lead not found":
                break
        return lead_id, company, results


async def _load_targets() -> tuple[int, list[tuple[int, str, list[str]]], Counter[str]]:
    async with async_session() as db:
        leads = (
            await db.execute(
                select(Lead)
                .where(Lead.user_id.is_not(None))
                .options(
                    selectinload(Lead.contacts),
                    selectinload(Lead.strategic_context),
                )
                .order_by(Lead.company.asc())
            )
        ).scalars().all()

    missing_counts: Counter[str] = Counter()
    targets: list[tuple[int, str, list[str]]] = []
    for lead in leads:
        missing = [kind for kind, _, needs_fn in ENRICH_KINDS if needs_fn(lead)]
        if not missing:
            continue
        missing_counts.update(missing)
        targets.append((lead.id, lead.company, missing))

    return len(leads), targets, missing_counts


async def _main(max_concurrency: int, dry_run: bool) -> None:
    try:
        assigned_count, targets, missing_counts = await _load_targets()
        complete_count = assigned_count - len(targets)

        print(
            f"Found {assigned_count} assigned leads; "
            f"{len(targets)} need contacts/context backfill "
            f"({complete_count} already complete)."
        )
        print(
            "Missing data counts: "
            f"contacts={missing_counts['contacts']} "
            f"strategic_context={missing_counts['strategic_context']} "
            f"company_background={missing_counts['company_background']}"
        )

        if dry_run:
            for lead_id, company, missing in targets:
                print(f"  [{lead_id}] {company} — missing: {', '.join(missing)}")
            return

        if not targets:
            return

        if not settings.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY is empty; cannot run enrichment.")

        semaphore = asyncio.Semaphore(max_concurrency)
        tasks = [
            asyncio.create_task(_enrich_one_lead(lead_id, semaphore))
            for lead_id, _, _ in targets
        ]

        updated_leads = 0
        failed_leads = 0
        unchanged_leads = 0
        kind_updated: Counter[str] = Counter()
        kind_skipped: Counter[str] = Counter()
        kind_failed: Counter[str] = Counter()

        progress = tqdm(
            total=len(tasks),
            desc="Backfilling contacts/context",
            unit="lead",
        )
        try:
            for coro in asyncio.as_completed(tasks):
                lead_id, company, results = await coro

                errors = [
                    f"{kind}: {result['error']}"
                    for kind, result in results.items()
                    if "error" in result
                ]
                skipped = [kind for kind, result in results.items() if result.get("skipped")]
                enriched = [
                    kind
                    for kind, result in results.items()
                    if not result.get("skipped") and "error" not in result
                ]

                for kind, result in results.items():
                    if "error" in result:
                        kind_failed[kind] += 1
                    elif result.get("skipped"):
                        kind_skipped[kind] += 1
                    else:
                        kind_updated[kind] += 1

                if errors:
                    failed_leads += 1
                    progress.write(f"  FAIL [{lead_id}] {company} — {'; '.join(errors)}")
                elif enriched:
                    updated_leads += 1
                    details = f"enriched: {', '.join(enriched)}"
                    if skipped:
                        details += f" | skipped: {', '.join(skipped)}"
                    progress.write(f"  OK   [{lead_id}] {company} — {details}")
                else:
                    unchanged_leads += 1

                progress.update(1)
        finally:
            progress.close()

        print(
            f"\nDone: total={len(tasks)} updated={updated_leads} "
            f"unchanged={unchanged_leads} failed={failed_leads}"
        )
        for kind, _, _ in ENRICH_KINDS:
            print(
                f"  {kind}: updated={kind_updated[kind]} "
                f"skipped={kind_skipped[kind]} failed={kind_failed[kind]}"
            )
    finally:
        await db_engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Backfill missing contacts, strategic context, and company "
            "background for assigned leads."
        )
    )
    parser.add_argument(
        "--max-concurrency",
        type=_positive_int,
        default=10,
        help="Maximum number of leads to enrich concurrently (default: 10).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List leads that would be enriched without running enrichment.",
    )
    args = parser.parse_args()
    asyncio.run(_main(max_concurrency=args.max_concurrency, dry_run=args.dry_run))
