"""Backfill company backgrounds for leads within a revenue band.

Defaults to leads whose annual revenue is between $50M and $150M inclusive.
By default this targets matching leads without a company background.
Use ``--include-existing`` to also refresh leads that already have one.

Usage:
    uv run python scripts/backfill_company_backgrounds_by_revenue.py
    uv run python scripts/backfill_company_backgrounds_by_revenue.py --include-existing
    uv run python scripts/backfill_company_backgrounds_by_revenue.py --min-revenue-m 75 --max-revenue-m 200
    uv run python scripts/backfill_company_backgrounds_by_revenue.py --max-concurrency 5
    uv run python scripts/backfill_company_backgrounds_by_revenue.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
os.chdir(BACKEND_ROOT)

_BOOTSTRAP_ENV_VAR = "SAURON_REVENUE_BACKGROUND_BACKFILL_BOOTSTRAPPED"
_REVENUE_PATTERN = re.compile(
    r"^(?P<value>\d+(?:\.\d+)?)\s*(?P<suffix>b|bn|billion|m|mm|million)?$",
    re.IGNORECASE,
)

try:
    from tqdm import tqdm
except ModuleNotFoundError as exc:
    if exc.name == "tqdm" and os.environ.get(_BOOTSTRAP_ENV_VAR) != "1":
        env = os.environ.copy()
        env[_BOOTSTRAP_ENV_VAR] = "1"
        print(
            "tqdm was not available in the current interpreter; "
            "re-running with the backend project environment...",
            file=sys.stderr,
        )
        raise SystemExit(
            subprocess.run(
                [
                    "uv",
                    "run",
                    "--project",
                    str(BACKEND_ROOT),
                    "python",
                    str(Path(__file__).resolve()),
                    *sys.argv[1:],
                ],
                cwd=str(BACKEND_ROOT),
                env=env,
                check=False,
            ).returncode
        )
    raise

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import async_session, engine as db_engine
from app.models.lead import Lead, LeadCompanyProfile
from app.services.lead_enrich import enrich_lead_company_background

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


def _parse_decimal_arg(raw: str) -> Decimal:
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise argparse.ArgumentTypeError(f"Invalid decimal value: {raw!r}") from exc
    if value < 0:
        raise argparse.ArgumentTypeError("Revenue bounds must be non-negative.")
    return value


def _decimal_to_string(value: Decimal) -> str:
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def _parse_revenue_m(raw: str | None) -> Decimal | None:
    """Parse revenue strings into millions of USD."""
    if raw is None:
        return None

    cleaned = raw.strip()
    if not cleaned:
        return None

    cleaned = cleaned.replace(",", "")
    cleaned = cleaned.replace("$", "")
    cleaned = re.sub(r"\busd\b", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)

    match = _REVENUE_PATTERN.fullmatch(cleaned)
    if match is None:
        try:
            return Decimal(cleaned)
        except InvalidOperation:
            return None

    value = Decimal(match.group("value"))
    suffix = (match.group("suffix") or "").lower()
    if suffix in {"b", "bn", "billion"}:
        return value * Decimal("1000")
    return value


def _has_background(lead: Lead) -> bool:
    ctx = lead.strategic_context
    if ctx is None or ctx.company_background is None:
        return False
    return bool(ctx.company_background.strip())


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
                    done = await _drain_sse(
                        enrich_lead_company_background(lead=lead, db=db)
                    )
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


async def _load_targets(
    *,
    min_revenue_m: Decimal,
    max_revenue_m: Decimal,
    include_existing: bool,
) -> tuple[list[tuple[int, str]], int, int]:
    stmt = (
        select(Lead)
        .join(LeadCompanyProfile, LeadCompanyProfile.lead_id == Lead.id)
        .options(
            selectinload(Lead.profile),
            selectinload(Lead.strategic_context),
        )
        .where(
            LeadCompanyProfile.revenue_m.is_not(None),
            func.btrim(LeadCompanyProfile.revenue_m) != "",
        )
        .order_by(Lead.company.asc())
    )

    async with async_session() as db:
        leads = (await db.execute(stmt)).scalars().all()

    targets: list[tuple[int, str]] = []
    skipped_unparseable = 0

    for lead in leads:
        profile = lead.profile
        if profile is None:
            continue

        revenue_m_numeric = _parse_revenue_m(profile.revenue_m)
        if revenue_m_numeric is None:
            skipped_unparseable += 1
            continue
        if revenue_m_numeric < min_revenue_m or revenue_m_numeric > max_revenue_m:
            continue
        if not include_existing and _has_background(lead):
            continue

        targets.append((lead.id, lead.company))

    return targets, len(leads), skipped_unparseable


async def _main(
    *,
    min_revenue_m: Decimal,
    max_revenue_m: Decimal,
    max_concurrency: int,
    dry_run: bool,
    include_existing: bool,
) -> None:
    try:
        targets, leads_with_revenue, skipped_unparseable = await _load_targets(
            min_revenue_m=min_revenue_m,
            max_revenue_m=max_revenue_m,
            include_existing=include_existing,
        )

        revenue_label = (
            f"{_decimal_to_string(min_revenue_m)}M-"
            f"{_decimal_to_string(max_revenue_m)}M"
        )
        print(
            f"Leads with non-empty revenue: {leads_with_revenue}. "
            f"Skipped {skipped_unparseable} unparseable revenue value(s)."
        )
        if include_existing:
            print(
                f"Found {len(targets)} leads in the {revenue_label} band to refresh company background."
            )
        else:
            print(
                "Found "
                f"{len(targets)} leads in the {revenue_label} band missing company background."
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

        progress = tqdm(
            total=len(tasks),
            desc=f"Backfilling backgrounds {revenue_label}",
            unit="lead",
        )
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
                    progress.write(f"  OK   [{lead_id}] {company}")
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
        description=(
            "Backfill company backgrounds for leads whose annual revenue falls "
            "within a given USD-millions range."
        )
    )
    parser.add_argument(
        "--min-revenue-m",
        type=_parse_decimal_arg,
        default=Decimal("50"),
        help="Minimum annual revenue in USD millions, inclusive (default: 50).",
    )
    parser.add_argument(
        "--max-revenue-m",
        type=_parse_decimal_arg,
        default=Decimal("150"),
        help="Maximum annual revenue in USD millions, inclusive (default: 150).",
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
        help="List matching leads without running enrichment.",
    )
    parser.add_argument(
        "--include-existing",
        action="store_true",
        help="Also refresh leads that already have company background.",
    )
    parser.add_argument(
        "--only-missing",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args()

    if args.min_revenue_m > args.max_revenue_m:
        raise SystemExit("--min-revenue-m cannot be greater than --max-revenue-m.")

    asyncio.run(
        _main(
            min_revenue_m=args.min_revenue_m,
            max_revenue_m=args.max_revenue_m,
            max_concurrency=args.max_concurrency,
            dry_run=args.dry_run,
            include_existing=args.include_existing,
        )
    )
