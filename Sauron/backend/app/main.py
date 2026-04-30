import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    auth,
    chat,
    company_emails,
    companies,
    deals,
    dialer,
    donations,
    gmail,
    lead_actions,
    lead_contacts,
    lead_emails,
    leads,
    meetings,
    meeting_recordings,
    positions,
    sales_reps,
    webhooks,
)
from app.routers.dialer import sync_twiml_app_voice_url
from app.services.ask_elephant_sync import run_periodic_ask_elephant_sync
from app.services.calendar_sync import run_periodic_calendar_sync
from app.services.company_summary import run_periodic_company_summary_backfill
from app.services.hubspot_sync import run_periodic_hubspot_sync
from app.services.company_key_facts import run_periodic_company_key_facts_backfill
from app.services.meeting_summary import run_periodic_meeting_summary_backfill
from app.services.email_sync import run_periodic_email_sync

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    sync_twiml_app_voice_url()

    background_tasks: list[asyncio.Task] = []

    def _maybe_start(
        enabled: bool,
        task_factory,
        label: str,
        interval: int,
        *,
        api_key: str | None = "present",
        run_immediately: bool = True,
        min_interval: int = 10,
    ) -> None:
        if enabled and api_key:
            background_tasks.append(
                asyncio.create_task(task_factory(run_immediately=run_immediately))
            )
            logger.info(
                "%s loop started (interval=%ss)", label, max(interval, min_interval)
            )
        else:
            logger.info("%s loop disabled or missing API key", label)

    _maybe_start(
        settings.ask_elephant_sync_enabled,
        run_periodic_ask_elephant_sync,
        "AskElephant sync",
        settings.ask_elephant_sync_interval_seconds,
        api_key=settings.ask_elephant_api_key,
    )
    _maybe_start(
        settings.calendar_sync_enabled,
        run_periodic_calendar_sync,
        "Calendar sync",
        settings.calendar_sync_interval_seconds,
    )
    _maybe_start(
        settings.hubspot_sync_enabled,
        run_periodic_hubspot_sync,
        "HubSpot sync",
        settings.hubspot_sync_interval_seconds,
        api_key=settings.hubspot_api_key,
    )
    _maybe_start(
        settings.company_summary_backfill_enabled,
        run_periodic_company_summary_backfill,
        "Company summary backfill",
        settings.company_summary_backfill_interval_seconds,
        api_key=settings.openrouter_api_key,
        run_immediately=False,
        min_interval=30,
    )
    _maybe_start(
        settings.meeting_summary_backfill_enabled,
        run_periodic_meeting_summary_backfill,
        "Meeting summary backfill",
        settings.meeting_summary_backfill_interval_seconds,
        api_key=settings.openrouter_api_key,
        run_immediately=False,
        min_interval=30,
    )
    _maybe_start(
        settings.company_key_facts_backfill_enabled,
        run_periodic_company_key_facts_backfill,
        "Company key facts backfill",
        settings.company_key_facts_backfill_interval_seconds,
        api_key=settings.openrouter_api_key,
        run_immediately=False,
        min_interval=30,
    )
    _maybe_start(
        settings.email_sync_enabled,
        run_periodic_email_sync,
        "Email sync",
        settings.email_sync_interval_seconds,
        run_immediately=False,
        min_interval=60,
    )

    try:
        yield
    finally:
        for task in background_tasks:
            task.cancel()
        for task in background_tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass


app = FastAPI(title="Sauron API", redirect_slashes=False, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(company_emails.router)
app.include_router(companies.router)
app.include_router(deals.router)
app.include_router(dialer.router)
app.include_router(positions.router)
app.include_router(donations.router)
app.include_router(meetings.router)
app.include_router(gmail.router)
app.include_router(meeting_recordings.router)
app.include_router(leads.router)
app.include_router(lead_actions.router)
app.include_router(lead_contacts.router)
app.include_router(lead_emails.router)
app.include_router(sales_reps.router)
app.include_router(webhooks.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
