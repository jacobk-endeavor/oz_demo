from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from pydantic import BaseModel


class CalendarSource(BaseModel):
    key: str
    url: str
    sales_rep_id: int
    owner_email: str


class CalendarEvent(BaseModel):
    uid: str
    instance_uid: str
    recurrence_id: str | None
    title: str
    start_at: datetime | None
    duration_minutes: int | None
    description: str | None
    meeting_url: str | None
    location: str | None
    sequence: int | None
    organizer_email: str | None
    attendee_emails: list[str]
    is_cancelled: bool = False


class SyncStats(BaseModel):
    calendars_polled: int = 0
    events_seen: int = 0
    meetings_created: int = 0
    meetings_updated: int = 0
    meetings_cancelled: int = 0
    meetings_restored: int = 0
    revisions_appended: int = 0
    people_created: int = 0
    companies_created: int = 0
    meeting_person_links: int = 0
    meeting_company_links: int = 0
    meeting_sales_rep_links: int = 0
    failed: int = 0


class AggregatedCalendarEvent(BaseModel):
    source: CalendarSource
    source_priority: int
    event: CalendarEvent
    sales_rep_ids: set[int]


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

PERSONAL_EMAIL_DOMAINS = {
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "ymail.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "msn.com",
    "icloud.com",
    "me.com",
    "aol.com",
    "protonmail.com",
    "proton.me",
}


def terminal(message: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[calendar-sync {ts}] {message}", flush=True)


def normalize_str(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def normalize_email(value: str | None) -> str | None:
    normalized = normalize_str(value)
    if not normalized:
        return None
    normalized = normalized.lower()
    if normalized.startswith("mailto:"):
        normalized = normalized[7:]
    return normalized or None


def normalize_domain(value: str | None) -> str | None:
    from app.domain_utils import normalize_domain as _normalize
    return _normalize(value)


def extract_domain_from_email(value: str | None) -> str | None:
    normalized = normalize_email(value)
    if not normalized or "@" not in normalized:
        return None
    _, _, candidate = normalized.rpartition("@")
    return normalize_domain(candidate)


def is_personal_email_domain(domain: str | None) -> bool:
    normalized = normalize_domain(domain)
    if not normalized:
        return False
    return normalized in PERSONAL_EMAIL_DOMAINS


def jsonable(value: object) -> object:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    return value


def dt_equal(a: datetime | None, b: datetime | None) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return int(a.timestamp()) == int(b.timestamp())


def attendee_digest(attendee_emails: list[str]) -> str:
    normalized_attendees = sorted(
        {
            normalized
            for normalized in (normalize_email(email) for email in attendee_emails)
            if normalized
        }
    )
    return hashlib.sha256("\n".join(normalized_attendees).encode("utf-8")).hexdigest()
