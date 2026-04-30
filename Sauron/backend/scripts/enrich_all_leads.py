"""Bulk-enrich all leads that are assigned to a user.

Runs all four enrichment passes (profile, contacts, strategic context,
company background) for every assigned lead, with bounded concurrency.

Usage:
    uv run python scripts/enrich_all_leads.py
    uv run python scripts/enrich_all_leads.py --max-concurrency 5
    uv run python scripts/enrich_all_leads.py --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from tqdm import tqdm

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select

from app.config import settings
from app.database import async_session, engine as db_engine
from app.models.lead import Lead, LeadCompanyProfile, LeadStrategicContext
from app.services.lead_enrich import (
    enrich_lead_company_background,
    enrich_lead_contacts,
    enrich_lead_profile,
    enrich_lead_strategic_context,
)

_PROFILE_FIELDS = [
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
]
_STRATEGIC_TEXT_FIELDS = [
    "recent_initiatives",
    "public_priorities",
    "operational_changes",
    "workflow_modernization_signals",
]


def _needs_profile(lead: Lead) -> bool:
    return True


def _needs_contacts(lead: Lead) -> bool:
    return not lead.contacts


def _needs_strategic_context(lead: Lead) -> bool:
    ctx = lead.strategic_context
    if ctx is None:
        return True
    return not any(getattr(ctx, k, None) for k in _STRATEGIC_TEXT_FIELDS)


def _needs_company_background(lead: Lead) -> bool:
    ctx = lead.strategic_context
    return ctx is None or not ctx.company_background


ENRICH_KINDS: list[tuple[str, Any, Any]] = [
    ("profile", enrich_lead_profile, _needs_profile),
    ("contacts", enrich_lead_contacts, _needs_contacts),
    ("strategic_context", enrich_lead_strategic_context, _needs_strategic_context),
    ("company_background", enrich_lead_company_background, _needs_company_background),
]


async def _drain_sse(gen) -> dict | None:
    """Consume an SSE async generator and return the 'done' event payload."""
    last_done: dict | None = None
    async for chunk in gen:
        if not chunk.startswith("data: "):
            continue
        raw = chunk.removeprefix("data: ").strip()
        if raw == "[DONE]":
            break
        try:
            payload = json.loads(raw)
            if payload.get("event") == "done":
                last_done = payload
            elif payload.get("event") == "error":
                return {"error": payload.get("message", "unknown error")}
        except json.JSONDecodeError:
            pass
    return last_done


async def _enrich_one_lead(
    lead_id: int,
    semaphore: asyncio.Semaphore,
) -> tuple[int, str, dict]:
    """Run the configured enrichment passes for a lead."""
    async with semaphore:
        async with async_session() as db:
            result = await db.execute(select(Lead).where(Lead.id == lead_id))
            lead = result.scalar_one_or_none()
            if lead is None:
                return lead_id, "???", {"error": "lead not found"}

            company = lead.company
            results: dict = {}

            for kind, enrich_fn, needs_fn in ENRICH_KINDS:
                if not needs_fn(lead):
                    results[kind] = {"skipped": True}
                    continue
                try:
                    gen = enrich_fn(lead=lead, db=db)
                    done = await _drain_sse(gen)
                    results[kind] = done or {"done": True}
                except Exception as exc:
                    results[kind] = {"error": str(exc)}

            return lead_id, company, results


async def _main(max_concurrency: int, dry_run: bool) -> None:
    try:
        async with async_session() as db:
            rows = (
                await db.execute(
                    select(Lead.id, Lead.company)
                    .where(Lead.user_id.is_not(None))
                    .order_by(Lead.company)
                )
            ).all()

        print(f"Found {len(rows)} assigned leads.")

        if dry_run:
            for lead_id, company in rows:
                print(f"  [{lead_id}] {company}")
            return

        if not rows:
            return

        if not settings.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY is empty; cannot run enrichment.")

        semaphore = asyncio.Semaphore(max_concurrency)
        tasks = [
            asyncio.create_task(_enrich_one_lead(lead_id, semaphore))
            for lead_id, _ in rows
        ]

        succeeded = 0
        failed = 0
        fully_skipped = 0

        progress = tqdm(total=len(tasks), desc="Enriching leads", unit="lead")
        try:
            for coro in asyncio.as_completed(tasks):
                lead_id, company, results = await coro
                errors = [
                    f"{k}: {v['error']}"
                    for k, v in results.items()
                    if "error" in v
                ]
                skipped = [k for k, v in results.items() if v.get("skipped")]
                enriched = [
                    k for k, v in results.items()
                    if not v.get("skipped") and "error" not in v
                ]

                if errors:
                    failed += 1
                    progress.write(f"  FAIL [{lead_id}] {company} — {'; '.join(errors)}")
                elif not enriched:
                    fully_skipped += 1
                else:
                    succeeded += 1
                    if skipped:
                        progress.write(
                            f"  OK   [{lead_id}] {company} — "
                            f"enriched: {', '.join(enriched)} | "
                            f"skipped (already done): {', '.join(skipped)}"
                        )
                progress.update(1)
        finally:
            progress.close()

        print(
            f"\nDone: total={len(tasks)} enriched={succeeded} "
            f"already_complete={fully_skipped} failed={failed}"
        )
    finally:
        await db_engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Bulk-enrich all leads assigned to users."
    )
    parser.add_argument(
        "--max-concurrency",
        type=int,
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
