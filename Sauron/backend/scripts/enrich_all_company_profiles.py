"""Bulk-enrich company profiles for all leads.

Runs only the profile enrichment pass for every lead whose company
profile still has missing fields.

Usage:
    uv run python scripts/enrich_all_company_profiles.py
    uv run python scripts/enrich_all_company_profiles.py --max-concurrency 5
    uv run python scripts/enrich_all_company_profiles.py --dry-run
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
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import async_session, engine as db_engine
from app.models.lead import Lead
from app.services.lead_enrich import enrich_lead_profile

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


def _has_profile_value(field: str, value: object) -> bool:
    if field == "buying_groups":
        return value is not None
    if isinstance(value, str):
        return bool(value.strip())
    return value is not None


def _needs_profile(lead: Lead) -> bool:
    if not _has_profile_value("domain", lead.domain):
        return True

    profile = lead.profile
    if profile is None:
        return True

    for field in _PROFILE_FIELDS[1:]:
        if not _has_profile_value(field, getattr(profile, field, None)):
            return True
    return False


async def _drain_sse(gen) -> dict | None:
    """Consume an SSE async generator and return the 'done' event payload."""
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
            if payload.get("event") == "done":
                last_done = payload
                last_error = None
            elif payload.get("event") == "error":
                last_error = {"error": payload.get("message", "unknown error")}
        except json.JSONDecodeError:
            pass
    return last_done or last_error


def _is_retryable_error(message: str) -> bool:
    normalized = message.lower()
    return any(snippet in normalized for snippet in _RETRYABLE_ERROR_SNIPPETS)


async def _enrich_one(lead_id: int, semaphore: asyncio.Semaphore) -> tuple[int, str, dict]:
    async with semaphore:
        company = "???"
        last_result: dict = {"error": "unknown error"}
        max_attempts = len(_LEAD_RETRY_BACKOFF_SECONDS) + 1
        for attempt in range(1, max_attempts + 1):
            try:
                async with async_session() as db:
                    result = await db.execute(select(Lead).where(Lead.id == lead_id))
                    lead = result.scalar_one_or_none()
                    if lead is None:
                        return lead_id, "???", {"error": "lead not found"}

                    company = lead.company
                    done = await _drain_sse(enrich_lead_profile(lead=lead, db=db))
                    last_result = done or {"done": True}
            except Exception as exc:
                last_result = {"error": str(exc)}

            if "error" not in last_result:
                return lead_id, company, last_result
            if attempt >= max_attempts or not _is_retryable_error(last_result["error"]):
                return lead_id, company, last_result

            wait_seconds = _LEAD_RETRY_BACKOFF_SECONDS[attempt - 1]
            print(
                f"Retrying [{lead_id}] {company} after transient error "
                f"(attempt {attempt + 1}/{max_attempts}) in {wait_seconds}s: "
                f"{last_result['error']}"
            )
            await asyncio.sleep(wait_seconds)

        return lead_id, company, last_result


async def _main(max_concurrency: int, dry_run: bool) -> None:
    try:
        async with async_session() as db:
            leads = (
                await db.execute(
                    select(Lead)
                    .options(selectinload(Lead.profile))
                    .order_by(Lead.company)
                )
            ).scalars().all()
            targets = [(lead.id, lead.company) for lead in leads if _needs_profile(lead)]
        skipped_complete = len(leads) - len(targets)
        print(
            f"Found {len(targets)} leads needing company profile enrichment "
            f"({skipped_complete} already complete)."
        )

        if dry_run:
            for lead_id, company in targets:
                print(f"  [{lead_id}] {company}")
            return

        if not targets:
            return

        if not settings.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY is empty; cannot run enrichment.")

        semaphore = asyncio.Semaphore(max_concurrency)
        tasks = [
            asyncio.create_task(_enrich_one(lead_id, semaphore))
            for lead_id, _ in targets
        ]

        succeeded = 0
        failed = 0
        skipped = 0

        progress = tqdm(total=len(tasks), desc="Enriching company profiles", unit="lead")
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
        description="Bulk-enrich company profiles for all leads."
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
