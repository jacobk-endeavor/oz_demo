"""Backfill HubSpot company emails into the database in bounded windows.

Usage:
    uv run python scripts/backfill_hubspot_company_emails.py
    uv run python scripts/backfill_hubspot_company_emails.py --start-date 2026-01-01 --end-date 2026-01-31
    uv run python scripts/backfill_hubspot_company_emails.py --start-date 2025-01-01 --end-date 2025-03-31 --window-days 7
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import httpx

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings
from app.database import async_session, engine as db_engine
from app.services.company_email_sync import (
    CompanyEmailSyncStats,
    HubSpotCompanyEmailSyncService,
)


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"Invalid ISO date: {value!r}. Expected YYYY-MM-DD."
        ) from exc


def _utc_start(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _log(message: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[hubspot-company-email-backfill {ts}] {message}", flush=True)


def _merge_stats(total: CompanyEmailSyncStats, current: CompanyEmailSyncStats) -> None:
    total.emails_created += current.emails_created
    total.emails_updated += current.emails_updated
    total.emails_unchanged += current.emails_unchanged
    total.company_links_upserted += current.company_links_upserted
    total.user_links_upserted += current.user_links_upserted
    total.failed += current.failed
    if current.last_modified_at and (
        total.last_modified_at is None or current.last_modified_at > total.last_modified_at
    ):
        total.last_modified_at = current.last_modified_at


async def main(start_date: date, end_date: date, window_days: int) -> None:
    if not settings.hubspot_api_key:
        raise SystemExit("HUBSPOT_API_KEY is required in backend/.env to run this script.")

    start_at = _utc_start(start_date)
    end_at_exclusive = _utc_start(end_date + timedelta(days=1))
    total_stats = CompanyEmailSyncStats()

    async with async_session() as db:
        async with httpx.AsyncClient(timeout=30.0) as client:
            service = HubSpotCompanyEmailSyncService(
                db,
                client,
                access_token=settings.hubspot_api_key,
            )
            window_start = start_at
            while window_start < end_at_exclusive:
                window_end = min(
                    window_start + timedelta(days=window_days),
                    end_at_exclusive,
                )
                _log(
                    "Syncing window "
                    f"{window_start.isoformat()} -> {window_end.isoformat()}"
                )
                stats = await service.sync_range(
                    start_at=window_start,
                    end_at=window_end,
                )
                _merge_stats(total_stats, stats)
                _log(
                    f"Window done: {stats.emails_created} created, "
                    f"{stats.emails_updated} updated, "
                    f"{stats.emails_unchanged} unchanged, "
                    f"{stats.company_links_upserted} company link(s), "
                    f"{stats.user_links_upserted} user link(s), "
                    f"{stats.failed} failed"
                )
                window_start = window_end

    _log(
        f"Backfill complete: {total_stats.emails_created} created, "
        f"{total_stats.emails_updated} updated, "
        f"{total_stats.emails_unchanged} unchanged, "
        f"{total_stats.company_links_upserted} company link(s), "
        f"{total_stats.user_links_upserted} user link(s), "
        f"{total_stats.failed} failed"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill HubSpot company emails into the database."
    )
    parser.add_argument(
        "--start-date",
        type=_parse_date,
        help=(
            "Inclusive start date in YYYY-MM-DD format. "
            "Defaults to the oldest HubSpot email date."
        ),
    )
    parser.add_argument(
        "--end-date",
        type=_parse_date,
        help="Inclusive end date in YYYY-MM-DD format. Defaults to today (UTC).",
    )
    parser.add_argument(
        "--window-days",
        type=int,
        default=7,
        help="Size of each sync window in days (default: 7).",
    )
    args = parser.parse_args()

    if args.window_days <= 0:
        raise SystemExit("--window-days must be greater than 0.")

    async def _run() -> None:
        try:
            if not settings.hubspot_api_key:
                raise SystemExit(
                    "HUBSPOT_API_KEY is required in backend/.env to run this script."
                )

            async with httpx.AsyncClient(timeout=30.0) as client:
                async with async_session() as db:
                    service = HubSpotCompanyEmailSyncService(
                        db,
                        client,
                        access_token=settings.hubspot_api_key,
                    )
                    resolved_start_date = args.start_date
                    if resolved_start_date is None:
                        oldest = await service.find_oldest_email_timestamp()
                        if oldest is None:
                            raise SystemExit("No HubSpot emails found to backfill.")
                        resolved_start_date = oldest.date()
                        _log(
                            "Auto-detected oldest HubSpot email at "
                            f"{oldest.isoformat()} (start-date={resolved_start_date.isoformat()})"
                        )

            resolved_end_date = args.end_date or _utc_today()
            if resolved_end_date < resolved_start_date:
                raise SystemExit("--end-date must be on or after --start-date.")

            await main(
                start_date=resolved_start_date,
                end_date=resolved_end_date,
                window_days=args.window_days,
            )
        finally:
            await db_engine.dispose()

    asyncio.run(_run())
