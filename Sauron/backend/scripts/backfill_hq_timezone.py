"""Backfill hq_timezone for leads that are missing it.

Runs profile enrichment (which now includes hq_timezone) for every
assigned lead whose profile lacks the timezone field, 10 at a time.

Usage:
    uv run python scripts/backfill_hq_timezone.py
    uv run python scripts/backfill_hq_timezone.py --max-concurrency 5
    uv run python scripts/backfill_hq_timezone.py --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from tqdm import tqdm

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.config import settings
from app.database import async_session, engine as db_engine
from app.models.lead import Lead, LeadCompanyProfile
from app.services.lead_enrich import enrich_lead_profile


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


async def _enrich_one(lead_id: int, semaphore: asyncio.Semaphore) -> tuple[int, str, dict]:
    async with semaphore:
        async with async_session() as db:
            result = await db.execute(select(Lead).where(Lead.id == lead_id))
            lead = result.scalar_one_or_none()
            if lead is None:
                return lead_id, "???", {"error": "lead not found"}

            try:
                done = await _drain_sse(enrich_lead_profile(lead=lead, db=db))
                return lead_id, lead.company, done or {"done": True}
            except Exception as exc:
                return lead_id, lead.company, {"error": str(exc)}


async def _main(max_concurrency: int, dry_run: bool) -> None:
    try:
        async with async_session() as db:
            query = (
                select(Lead.id, Lead.company)
                .outerjoin(LeadCompanyProfile)
                .where(
                    Lead.user_id.is_not(None),
                    (LeadCompanyProfile.hq_timezone.is_(None))
                    | (LeadCompanyProfile.id.is_(None)),
                )
                .order_by(Lead.company)
            )
            rows = (await db.execute(query)).all()

        print(f"Found {len(rows)} leads missing hq_timezone.")

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
            asyncio.create_task(_enrich_one(lead_id, semaphore))
            for lead_id, _ in rows
        ]

        succeeded = 0
        failed = 0
        skipped = 0

        progress = tqdm(total=len(tasks), desc="Backfilling hq_timezone", unit="lead")
        try:
            for coro in asyncio.as_completed(tasks):
                lead_id, company, result = await coro
                if "error" in result:
                    failed += 1
                    progress.write(f"  FAIL [{lead_id}] {company} — {result['error']}")
                elif result.get("fields_updated", 1) == 0:
                    skipped += 1
                else:
                    succeeded += 1
                    fields = result.get("fields_updated", "?")
                    progress.write(f"  OK   [{lead_id}] {company} — updated {fields} field(s)")
                progress.update(1)
        finally:
            progress.close()

        print(
            f"\nDone: total={len(tasks)} updated={succeeded} "
            f"skipped={skipped} failed={failed}"
        )
    finally:
        await db_engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill hq_timezone for leads missing it."
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
