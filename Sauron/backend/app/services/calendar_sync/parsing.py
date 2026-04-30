from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, time, timedelta, timezone

import httpx
from icalendar import Calendar
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.calendar_sync.models import (
    AggregatedCalendarEvent,
    CalendarEvent,
    CalendarSource,
    normalize_email,
    normalize_str,
)

logger = logging.getLogger(__name__)

_MAX_REQUEST_ATTEMPTS = 4
_CALENDAR_HTTP_CACHE: dict[str, dict[str, object]] = {}


# ---------------------------------------------------------------------------
# Calendar source configuration
# ---------------------------------------------------------------------------


async def calendar_sources_from_db(db: AsyncSession) -> list[CalendarSource]:
    """Load calendar sources from SalesRepCalendar rows."""
    from app.repositories.sales_rep_calendar_repo import SalesRepCalendarRepo

    repo = SalesRepCalendarRepo(db)
    calendars = await repo.list_all_with_sales_rep()
    sources: list[CalendarSource] = []
    for cal in calendars:
        if not cal.calendar_url:
            continue
        owner_email = cal.sales_rep.email if cal.sales_rep and cal.sales_rep.email else ""
        sources.append(
            CalendarSource(
                key=f"sr_{cal.sales_rep_id}_{cal.id}",
                url=cal.calendar_url,
                sales_rep_id=cal.sales_rep_id,
                owner_email=owner_email.lower() if owner_email else "",
            )
        )
    return sources


# ---------------------------------------------------------------------------
# Datetime helpers
# ---------------------------------------------------------------------------


def coerce_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, date):
        dt = datetime.combine(value, time.min)
    else:
        return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# ---------------------------------------------------------------------------
# VEVENT field extraction
# ---------------------------------------------------------------------------


def _normalize_recurrence_id(value: object | None) -> str | None:
    if value is None:
        return None
    raw_value = getattr(value, "dt", value)
    normalized_dt = coerce_datetime(raw_value)
    if normalized_dt is not None:
        return normalized_dt.isoformat()
    return normalize_str(str(raw_value))


def _build_instance_uid(
    *,
    uid: str,
    recurrence_id: str | None,
    start_at: datetime | None,
) -> str:
    start_token = start_at.isoformat() if start_at else None
    occurrence_token = recurrence_id or start_token
    if occurrence_token:
        token = f"occ:{occurrence_token}"
    else:
        token = "series"
    return f"{uid}::{token}"


def _duration_minutes(component: object, start_at: datetime | None) -> int | None:
    end_prop = component.get("dtend")
    if end_prop is not None:
        end_at = coerce_datetime(getattr(end_prop, "dt", end_prop))
        if start_at and end_at:
            return max(int((end_at - start_at).total_seconds() // 60), 0)

    duration_prop = component.get("duration")
    if duration_prop is None:
        return None

    duration_value = getattr(duration_prop, "dt", duration_prop)
    if isinstance(duration_value, timedelta):
        return max(int(duration_value.total_seconds() // 60), 0)
    return None


def _attendee_emails(component: object) -> list[str]:
    attendees = component.get("attendee")
    if not attendees:
        return []

    raw_attendees = attendees if isinstance(attendees, list) else [attendees]

    emails: set[str] = set()
    for attendee in raw_attendees:
        email = normalize_email(str(attendee))
        if email:
            emails.add(email)
    return sorted(emails)


def _organizer_email(component: object) -> str | None:
    organizer = component.get("organizer")
    if not organizer:
        return None
    if isinstance(organizer, list):
        organizer = organizer[0]
    return normalize_email(str(organizer))


# ---------------------------------------------------------------------------
# iCal parsing
# ---------------------------------------------------------------------------


def _parse_event(component: object) -> CalendarEvent | None:
    uid_value = component.get("uid")
    uid = normalize_str(str(uid_value)) if uid_value is not None else None
    if not uid:
        return None

    title_value = component.get("summary")
    title = normalize_str(str(title_value)) if title_value is not None else None
    if not title:
        title = "Untitled meeting"

    start_prop = component.get("dtstart")
    start_at = (
        coerce_datetime(getattr(start_prop, "dt", start_prop)) if start_prop else None
    )
    duration = _duration_minutes(component, start_at)

    description_value = component.get("description")
    description = (
        normalize_str(str(description_value))
        if description_value is not None
        else None
    )
    location_value = component.get("location")
    location = (
        normalize_str(str(location_value)) if location_value is not None else None
    )
    url_value = component.get("url")
    meeting_url = normalize_str(str(url_value)) if url_value is not None else None

    sequence_value = component.get("sequence")
    sequence_raw = (
        normalize_str(str(sequence_value)) if sequence_value is not None else None
    )
    sequence = int(sequence_raw) if sequence_raw and sequence_raw.isdigit() else None
    recurrence_id = _normalize_recurrence_id(component.get("recurrence-id"))
    instance_uid = _build_instance_uid(
        uid=uid,
        recurrence_id=recurrence_id,
        start_at=start_at,
    )

    status_value = component.get("status")
    is_cancelled = (
        status_value is not None
        and normalize_str(str(status_value)).upper() == "CANCELLED"
    )

    return CalendarEvent(
        uid=uid,
        instance_uid=instance_uid,
        recurrence_id=recurrence_id,
        title=title,
        start_at=start_at,
        duration_minutes=duration,
        description=description,
        meeting_url=meeting_url,
        location=location,
        sequence=sequence,
        organizer_email=_organizer_email(component),
        attendee_emails=_attendee_emails(component),
        is_cancelled=is_cancelled,
    )


def parse_calendar_events(ics_text: str) -> list[CalendarEvent]:
    calendar = Calendar.from_ical(ics_text)
    events: list[CalendarEvent] = []
    for component in calendar.walk("VEVENT"):
        event = _parse_event(component)
        if event:
            events.append(event)
    return events


# ---------------------------------------------------------------------------
# HTTP fetch with caching
# ---------------------------------------------------------------------------


async def fetch_calendar_events(
    client: httpx.AsyncClient,
    *,
    source: CalendarSource,
) -> tuple[list[CalendarEvent], str]:
    cached = _CALENDAR_HTTP_CACHE.get(source.url)
    headers: dict[str, str] = {}
    if cached:
        etag = cached.get("etag")
        if isinstance(etag, str) and etag:
            headers["If-None-Match"] = etag
        last_modified = cached.get("last_modified")
        if isinstance(last_modified, str) and last_modified:
            headers["If-Modified-Since"] = last_modified

    delay_seconds = 1.0
    for attempt in range(1, _MAX_REQUEST_ATTEMPTS + 1):
        try:
            response = await client.get(source.url, headers=headers or None)
            if response.status_code == 304 and cached:
                cached_events = cached.get("events")
                if isinstance(cached_events, list):
                    return cached_events, "not-modified"
            response.raise_for_status()
            events = parse_calendar_events(response.text)
            _CALENDAR_HTTP_CACHE[source.url] = {
                "etag": response.headers.get("ETag"),
                "last_modified": response.headers.get("Last-Modified"),
                "events": events,
            }
            return events, "fresh" if not cached else "updated"
        except httpx.RequestError:
            if attempt == _MAX_REQUEST_ATTEMPTS:
                raise
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code < 500 or attempt == _MAX_REQUEST_ATTEMPTS:
                raise

        await asyncio.sleep(delay_seconds)
        delay_seconds = min(delay_seconds * 2, 15.0)

    raise RuntimeError(f"Unreachable: exhausted {_MAX_REQUEST_ATTEMPTS} fetch attempts")


# ---------------------------------------------------------------------------
# Aggregation helpers
# ---------------------------------------------------------------------------


def _sequence_rank(sequence: int | None) -> int:
    return sequence if sequence is not None else -1


def should_replace_aggregated_event(
    *,
    current: AggregatedCalendarEvent,
    candidate_event: CalendarEvent,
    candidate_source: CalendarSource,
    candidate_source_priority: int,
) -> bool:
    current_sequence = _sequence_rank(current.event.sequence)
    candidate_sequence = _sequence_rank(candidate_event.sequence)
    if candidate_sequence != current_sequence:
        return candidate_sequence > current_sequence

    # DTSTAMP is intentionally skipped as a tiebreaker. Google Calendar
    # regenerates it on every fresh HTTP response, which causes the winner
    # to flip-flop between cached and freshly-fetched sources each tick.
    # Sequence number already captures real edits; after that, fall through
    # to the deterministic source_priority / source_key tiebreaker.

    if current.source_priority != candidate_source_priority:
        return candidate_source_priority < current.source_priority

    return candidate_source.key < current.source.key
