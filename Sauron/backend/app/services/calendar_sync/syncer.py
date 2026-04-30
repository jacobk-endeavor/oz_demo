from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.meeting import Meeting
from app.repositories.meeting_repo import MeetingRepo
from app.repositories.sales_rep_repo import SalesRepRepo
from app.services.calendar_sync.enrichment import AttendeeEnricher
from app.services.calendar_sync.models import (
    AggregatedCalendarEvent,
    CalendarEvent,
    CalendarSource,
    SyncStats,
    attendee_digest,
    dt_equal,
    jsonable,
    terminal,
)
from app.services.calendar_sync.parsing import (
    calendar_sources_from_db,
    fetch_calendar_events,
    should_replace_aggregated_event,
)
from app.services.calendar_sync.user_filters import is_excluded_user_email
from app.services.meeting_recording_matcher import link_unlinked_recordings_for_meeting

logger = logging.getLogger(__name__)


class CalendarSyncer:
    """Orchestrates a single calendar sync run."""

    def __init__(self, db: AsyncSession, client: httpx.AsyncClient) -> None:
        self._db = db
        self._client = client
        self.stats = SyncStats()
        self._sales_rep_lookup: dict[str, int] = {}
        self._enricher: AttendeeEnricher | None = None
        self._meeting_repo = MeetingRepo(db)
        self.change_log: list[dict] = []

    # -- public entry point -------------------------------------------------

    async def run(self, sources: list[CalendarSource], lookback_cutoff: datetime) -> SyncStats:
        sales_rep_repo = SalesRepRepo(self._db)
        pairs = await sales_rep_repo.list_id_email_pairs()
        self._sales_rep_lookup = {
            email.lower(): sales_rep_id for sales_rep_id, email in pairs if email
        }
        self._enricher = AttendeeEnricher(self._db, self._client, self.stats)

        aggregated_map, raw_count, skipped_old = self._poll_and_aggregate(
            lookback_cutoff, await self._fetch_all_sources(sources)
        )

        terminal(
            "Aggregated calendar events "
            f"(raw={raw_count}, unique_instances={len(aggregated_map)}, "
            f"old_skipped={skipped_old})"
        )

        existing_map, existing_sales_rep_map = await self._batch_load_existing(
            sorted(aggregated_map.keys())
        )

        ordered = sorted(
            aggregated_map.values(),
            key=lambda item: (
                item.event.start_at is None,
                item.event.start_at.isoformat() if item.event.start_at else "",
                item.event.instance_uid,
            ),
        )

        all_attendee_emails: set[str] = set()
        for agg in ordered:
            all_attendee_emails.update(agg.event.attendee_emails)
        await self._enricher.preload_known_emails(all_attendee_emails)

        await self._process_events(
            ordered, existing_map, existing_sales_rep_map, raw_count, skipped_old
        )

        seen_external_uids = {agg.event.uid for agg in ordered}
        seen_instance_uids = set(aggregated_map.keys())
        await self._reconcile_deleted_meetings(seen_external_uids, seen_instance_uids)

        return self.stats

    # -- phase 1: fetch all sources (parallel) --------------------------------

    async def _fetch_all_sources(
        self, sources: list[CalendarSource]
    ) -> list[tuple[CalendarSource, int, list[CalendarEvent]]]:

        async def _fetch_one(
            source_index: int, source: CalendarSource
        ) -> tuple[CalendarSource, int, list[CalendarEvent]] | None:
            terminal(
                f"[{source_index}/{len(sources)}] Polling {source.key} "
                f"(owner={source.owner_email})"
            )
            try:
                events, fetch_state = await fetch_calendar_events(
                    self._client, source=source
                )
                self.stats.calendars_polled += 1
                terminal(
                    f"[{source_index}/{len(sources)}] Fetched {len(events)} event(s) "
                    f"from {source.key} (fetch={fetch_state})"
                )
                return (source, source_index, events)
            except Exception as exc:
                self.stats.failed += 1
                logger.exception("Failed to poll calendar %s", source.key)
                terminal(
                    f"[{source_index}/{len(sources)}] Calendar poll failed "
                    f"for {source.key}: {exc}"
                )
                return None

        fetched = await asyncio.gather(
            *(_fetch_one(i, s) for i, s in enumerate(sources, start=1))
        )
        return [r for r in fetched if r is not None]

    # -- phase 2: aggregate across calendars --------------------------------

    def _poll_and_aggregate(
        self,
        lookback_cutoff: datetime,
        fetched: list[tuple[CalendarSource, int, list[CalendarEvent]]],
    ) -> tuple[dict[str, AggregatedCalendarEvent], int, int]:
        aggregated: dict[str, AggregatedCalendarEvent] = {}
        attendee_unions: dict[str, set[str]] = {}
        raw_count = 0
        skipped_old = 0

        for source, source_index, events in fetched:
            raw_count += len(events)

            for event in events:
                if event.start_at and event.start_at < lookback_cutoff:
                    skipped_old += 1
                    continue

                event_sales_rep_ids = self._resolve_event_sales_rep_ids(
                    event, source
                )

                existing = aggregated.get(event.instance_uid)
                if existing is None:
                    aggregated[event.instance_uid] = AggregatedCalendarEvent(
                        source=source,
                        source_priority=source_index,
                        event=event,
                        sales_rep_ids=set(event_sales_rep_ids),
                    )
                    attendee_unions[event.instance_uid] = set(event.attendee_emails)
                    continue

                existing.sales_rep_ids.update(event_sales_rep_ids)
                attendee_unions[event.instance_uid].update(event.attendee_emails)
                if should_replace_aggregated_event(
                    current=existing,
                    candidate_event=event,
                    candidate_source=source,
                    candidate_source_priority=source_index,
                ):
                    existing.source = source
                    existing.source_priority = source_index
                    existing.event = event

        # Stamp the union of attendee emails from all sources onto the winning
        # event so the downstream digest is stable regardless of which source won.
        for uid, agg in aggregated.items():
            merged = sorted(attendee_unions.get(uid, set()))
            if merged != agg.event.attendee_emails:
                agg.event = agg.event.model_copy(
                    update={"attendee_emails": merged}
                )

        return aggregated, raw_count, skipped_old

    def _resolve_event_sales_rep_ids(
        self,
        event: CalendarEvent,
        source: CalendarSource,
    ) -> set[int]:
        # The source's sales_rep_id is always included — it owns this calendar.
        sales_rep_ids: set[int] = {source.sales_rep_id}

        if event.organizer_email and not is_excluded_user_email(event.organizer_email):
            organizer_id = self._sales_rep_lookup.get(event.organizer_email)
            if organizer_id is not None:
                sales_rep_ids.add(organizer_id)

        for attendee_email in event.attendee_emails:
            if is_excluded_user_email(attendee_email):
                continue
            attendee_id = self._sales_rep_lookup.get(attendee_email)
            if attendee_id is not None:
                sales_rep_ids.add(attendee_id)

        return sales_rep_ids

    # -- phase 3: batch pre-load existing meetings --------------------------

    async def _batch_load_existing(
        self, instance_uids: list[str]
    ) -> tuple[dict[str, Meeting], dict[int, set[int]]]:
        existing_by_uid = await self._meeting_repo.get_by_instance_uids(instance_uids)

        meeting_ids = [m.id for m in existing_by_uid.values()]
        sales_rep_ids_by_meeting = await self._meeting_repo.get_sales_rep_ids_for_meetings(
            meeting_ids
        )

        return existing_by_uid, sales_rep_ids_by_meeting

    # -- phase 4: process changed events ------------------------------------

    async def _process_events(
        self,
        ordered: list[AggregatedCalendarEvent],
        existing_map: dict[str, Meeting],
        existing_sales_rep_map: dict[int, set[int]],
        raw_count: int,
        skipped_old: int,
    ) -> None:
        created_before = self.stats.meetings_created
        updated_before = self.stats.meetings_updated
        failed_before = self.stats.failed
        skipped_unchanged = 0

        for event_index, agg in enumerate(ordered, start=1):
            event = agg.event
            sales_rep_ids = agg.sales_rep_ids
            source = agg.source

            existing = existing_map.get(event.instance_uid)
            existing_sales_rep_ids = (
                existing_sales_rep_map.get(existing.id, set()) if existing else set()
            )
            digest = attendee_digest(event.attendee_emails)

            if existing and _event_unchanged(
                existing,
                event,
                sales_rep_ids,
                existing_sales_rep_ids,
                digest,
            ):
                skipped_unchanged += 1
                continue

            self.stats.events_seen += 1
            retry_attempt = 0
            max_retry_attempts = 2
            while True:
                try:
                    was_skipped = await self._process_single_event(
                        source=source,
                        event=event,
                        sales_rep_ids=sales_rep_ids,
                        digest=digest,
                    )
                    if was_skipped:
                        skipped_unchanged += 1
                    await self._meeting_repo.commit()
                    break
                except Exception as exc:
                    await self._meeting_repo.rollback()
                    if self._enricher is not None:
                        self._enricher.clear_orm_caches()

                    if retry_attempt < max_retry_attempts and _is_transient_db_conflict(
                        exc
                    ):
                        retry_attempt += 1
                        wait_seconds = 0.2 * (2 ** (retry_attempt - 1))
                        terminal(
                            "Transient DB conflict "
                            f"for event {event.uid} from {source.key}; "
                            f"retry {retry_attempt}/{max_retry_attempts} "
                            f"in {wait_seconds:.1f}s"
                        )
                        await asyncio.sleep(wait_seconds)
                        continue

                    self.stats.failed += 1
                    logger.exception(
                        "Failed to process calendar event uid=%s source=%s",
                        event.uid,
                        source.key,
                    )
                    terminal(f"Failed event {event.uid} from {source.key}: {exc}")
                    break

            if event_index % 50 == 0 or event_index == len(ordered):
                terminal(
                    f"calendar-sync progress {event_index}/{len(ordered)} | "
                    f"created={self.stats.meetings_created - created_before} "
                    f"updated={self.stats.meetings_updated - updated_before} "
                    f"unchanged={skipped_unchanged} old_skipped={skipped_old} "
                    f"failed={self.stats.failed - failed_before}"
                )

        terminal(
            "Aggregated processing complete "
            f"raw={raw_count} unique_instances={len(ordered)} "
            f"processable={self.stats.events_seen} unchanged={skipped_unchanged} "
            f"old_skipped={skipped_old} "
            f"created={self.stats.meetings_created - created_before} "
            f"updated={self.stats.meetings_updated - updated_before} "
            f"failed={self.stats.failed - failed_before}"
        )

    async def _process_single_event(
        self,
        *,
        source: CalendarSource,
        event: CalendarEvent,
        sales_rep_ids: set[int],
        digest: str,
    ) -> bool:
        """Process one event. Returns True if no changes were needed."""
        try:
            meeting, changed = await self._upsert_meeting(
                source=source,
                event=event,
                sales_rep_ids=sales_rep_ids,
                digest=digest,
            )
        except IntegrityError as exc:
            if "ix_meetings_instance_uid" not in str(exc):
                raise
            await self._meeting_repo.rollback()
            if self._enricher is not None:
                self._enricher.clear_orm_caches()
            if await self._meeting_repo.get_instance_id(event.instance_uid) is not None:
                return True
            raise

        if not changed:
            return True

        await link_unlinked_recordings_for_meeting(self._db, meeting)

        assert self._enricher is not None
        person_ids, company_ids = await self._enricher.enrich_attendees(
            event.attendee_emails
        )

        await self._meeting_repo.replace_links(
            meeting_id=meeting.id,
            person_ids=person_ids,
            company_ids=company_ids,
            sales_rep_ids=sales_rep_ids,
        )
        self.stats.meeting_person_links += len(person_ids)
        self.stats.meeting_company_links += len(company_ids)
        self.stats.meeting_sales_rep_links += len(sales_rep_ids)
        return False

    # -- meeting upsert -----------------------------------------------------

    @staticmethod
    def _detect_field_changes(
        meeting: Meeting,
        event: CalendarEvent,
        digest: str,
    ) -> tuple[dict[str, object], list[str], dict[str, object], dict[str, object]]:
        """Compare tracked fields between meeting and event.

        Returns ``(tracked_fields, changed_fields, before, after)`` where
        *tracked_fields* is the full snapshot dict, *changed_fields* lists names
        that differ, and *before*/*after* hold old/new values for changed fields.
        The meeting object is mutated in-place for any changed attributes.
        """
        tracked_fields: dict[str, object] = {
            "external_uid": event.uid,
            "title": event.title,
            "start_at": event.start_at,
            "duration_minutes": event.duration_minutes,
            "description": event.description,
            "meeting_url": event.meeting_url,
            "location": event.location,
            "last_revision_sequence": event.sequence,
            "last_attendee_digest": digest,
        }

        changed_fields: list[str] = []
        before: dict[str, object] = {}
        after: dict[str, object] = {}
        for field_name, new_value in tracked_fields.items():
            old_value = getattr(meeting, field_name)
            equal = (
                dt_equal(old_value, new_value)
                if field_name == "start_at"
                else old_value == new_value
            )
            if not equal:
                changed_fields.append(field_name)
                before[field_name] = old_value
                after[field_name] = new_value
                setattr(meeting, field_name, new_value)

        return tracked_fields, changed_fields, before, after

    def _handle_cancellation(
        self,
        meeting: Meeting,
        event: CalendarEvent,
        now: datetime,
        changed_fields: list[str],
        before: dict[str, object],
        after: dict[str, object],
    ) -> None:
        """Update cancellation status and stats when an existing meeting
        transitions to/from cancelled."""
        if event.is_cancelled and meeting.cancelled_at is None:
            changed_fields.append("cancelled_at")
            before["cancelled_at"] = None
            after["cancelled_at"] = now.isoformat()
            meeting.cancelled_at = now
            self.stats.meetings_cancelled += 1
        elif not event.is_cancelled and meeting.cancelled_at is not None:
            changed_fields.append("cancelled_at")
            before["cancelled_at"] = meeting.cancelled_at.isoformat()
            after["cancelled_at"] = None
            meeting.cancelled_at = None
            self.stats.meetings_restored += 1

    async def _upsert_meeting(
        self,
        *,
        source: CalendarSource,
        event: CalendarEvent,
        sales_rep_ids: set[int],
        digest: str,
    ) -> tuple[Meeting, bool]:
        now = datetime.now(timezone.utc)
        meeting = await self._meeting_repo.get_by_instance_uid(event.instance_uid)
        created = False

        if not meeting:
            meeting = await self._meeting_repo.create(
                external_uid=event.uid,
                instance_uid=event.instance_uid,
                recurrence_id=event.recurrence_id,
                title=event.title,
                start_at=event.start_at,
                duration_minutes=event.duration_minutes,
                description=event.description,
                meeting_url=event.meeting_url,
                location=event.location,
                last_revision_sequence=event.sequence,
                last_attendee_digest=digest,
                revision_history=[],
                cancelled_at=now if event.is_cancelled else None,
            )
            created = True
            self.stats.meetings_created += 1
            if event.is_cancelled:
                self.stats.meetings_cancelled += 1

        # recurrence_id is kept in sync but excluded from change tracking:
        # different sources may include or omit RECURRENCE-ID for the same
        # occurrence, which causes phantom flip-flop revisions.
        meeting.recurrence_id = event.recurrence_id

        tracked_fields, changed_fields, before, after = self._detect_field_changes(
            meeting, event, digest
        )
        tracked_snapshot = {**tracked_fields, "sales_rep_ids": sorted(sales_rep_ids)}

        existing_sales_rep_ids: set[int] = set()
        if not created:
            existing_sales_rep_ids = await self._meeting_repo.get_existing_sales_rep_ids(
                meeting.id
            )
        if existing_sales_rep_ids != sales_rep_ids:
            changed_fields.append("sales_rep_ids")
            before["sales_rep_ids"] = sorted(existing_sales_rep_ids)
            after["sales_rep_ids"] = sorted(sales_rep_ids)

        if not created:
            self._handle_cancellation(
                meeting, event, now, changed_fields, before, after
            )

        meeting.last_synced_at = now
        if created or changed_fields:
            if created:
                action = "created"
            elif "cancelled_at" in changed_fields:
                action = "cancelled" if event.is_cancelled else "restored"
            else:
                action = "updated"

            _append_revision(
                meeting=meeting,
                changed_fields=changed_fields or ["created"],
                before=before,
                after=after if after else tracked_snapshot,
                source=source,
                event=event,
            )
            self.stats.revisions_appended += 1

            self.change_log.append({
                "instance_uid": event.instance_uid,
                "title": event.title,
                "action": action,
                "changed_fields": changed_fields or ["created"],
                "before": jsonable(before),
                "after": jsonable(after if after else tracked_snapshot),
                "calendar_key": source.key,
                "owner_email": source.owner_email,
            })

        if not created and changed_fields:
            self.stats.meetings_updated += 1

        await self._meeting_repo.flush()
        return meeting, (created or bool(changed_fields))


    # -- phase 5: reconcile deleted meetings ----------------------------------

    async def _reconcile_deleted_meetings(
        self,
        seen_external_uids: set[str],
        seen_instance_uids: set[str],
    ) -> None:
        """Soft-delete active meetings whose external_uid was seen in at least
        one feed but whose specific instance_uid was not present in any feed.

        This catches events deleted from the calendar: the calendar still
        exists (so we see its other events), but this particular event is gone.
        We intentionally skip external_uids we never saw — if every feed
        failed to fetch, we don't want to mass-cancel everything.
        """
        if not seen_external_uids:
            return

        active_meetings = (
            await self._meeting_repo.get_active_instance_uids_for_external_uids(
                seen_external_uids
            )
        )

        now = datetime.now(timezone.utc)
        cancelled_count = 0
        for instance_uid, meeting in active_meetings.items():
            if instance_uid in seen_instance_uids:
                continue
            meeting.cancelled_at = now
            meeting.last_synced_at = now
            history = list(meeting.revision_history or [])
            history.append({
                "synced_at": now.isoformat(),
                "calendar_key": None,
                "owner_email": None,
                "uid": meeting.external_uid,
                "instance_uid": instance_uid,
                "recurrence_id": meeting.recurrence_id,
                "sequence": meeting.last_revision_sequence,
                "changed_fields": ["cancelled_at"],
                "before": {"cancelled_at": None},
                "after": {"cancelled_at": now.isoformat()},
            })
            meeting.revision_history = history

            self.change_log.append({
                "instance_uid": instance_uid,
                "title": meeting.title,
                "action": "cancelled",
                "changed_fields": ["cancelled_at"],
                "before": {"cancelled_at": None},
                "after": {"cancelled_at": now.isoformat()},
                "calendar_key": None,
                "owner_email": None,
            })
            cancelled_count += 1

        if cancelled_count:
            self.stats.meetings_cancelled += cancelled_count
            self.stats.revisions_appended += cancelled_count
            await self._meeting_repo.flush()
            await self._meeting_repo.commit()
            terminal(f"Reconciliation: soft-deleted {cancelled_count} meeting(s) absent from feeds")


# ---------------------------------------------------------------------------
# Module-level helpers used by CalendarSyncer
# ---------------------------------------------------------------------------


def _event_unchanged(
    existing: Meeting,
    event: CalendarEvent,
    sales_rep_ids: set[int],
    existing_sales_rep_ids: set[int],
    digest: str,
) -> bool:
    if (existing.cancelled_at is not None) != event.is_cancelled:
        return False
    return (
        existing.title == event.title
        and dt_equal(existing.start_at, event.start_at)
        and existing.duration_minutes == event.duration_minutes
        and existing_sales_rep_ids == sales_rep_ids
        and existing.last_revision_sequence == event.sequence
        and existing.last_attendee_digest == digest
    )


def _is_transient_db_conflict(exc: Exception) -> bool:
    message = str(exc).lower()
    if "deadlock detected" in message:
        return True
    if "could not serialize access" in message:
        return True
    if "lock timeout" in message:
        return True
    # Duplicate-key conflicts can happen transiently when concurrent sync loops
    # insert the same normalized entity in parallel.
    if "duplicate key value violates unique constraint" in message:
        return True
    return False


def _append_revision(
    *,
    meeting: Meeting,
    changed_fields: list[str],
    before: dict[str, object],
    after: dict[str, object],
    source: CalendarSource,
    event: CalendarEvent,
) -> None:
    synced_at = datetime.now(timezone.utc).isoformat()
    history = list(meeting.revision_history or [])
    history.append(
        {
            "synced_at": synced_at,
            "calendar_key": source.key,
            "owner_email": source.owner_email,
            "uid": event.uid,
            "instance_uid": event.instance_uid,
            "recurrence_id": event.recurrence_id,
            "sequence": event.sequence,
            "changed_fields": changed_fields,
            "before": jsonable(before),
            "after": jsonable(after),
        }
    )
    meeting.revision_history = history


# ---------------------------------------------------------------------------
# Public API (same signatures as the old module)
# ---------------------------------------------------------------------------


async def sync_calendars_once() -> SyncStats:
    if not settings.calendar_sync_enabled:
        logger.debug("Calendar sync disabled by configuration")
        return SyncStats()

    if not settings.apollo_api_key:
        raise RuntimeError(
            "APOLLO_API_KEY is not set \u2014 cannot run calendar sync without it"
        )

    lookback_days = max(settings.calendar_sync_lookback_days, 0)
    lookback_cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    async with async_session() as db:
        sources = await calendar_sources_from_db(db)
        if not sources:
            terminal("No calendar URLs configured; skipping run")
            return SyncStats()

        terminal(
            "Starting calendar sync run "
            f"(sources={len(sources)}, "
            f"interval={max(settings.calendar_sync_interval_seconds, 10)}s, "
            f"lookback_days={lookback_days})"
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            syncer = CalendarSyncer(db, client)
            stats = await syncer.run(sources, lookback_cutoff)

    terminal(
        "Calendar sync complete "
        f"calendars={stats.calendars_polled} events={stats.events_seen} "
        f"created={stats.meetings_created} updated={stats.meetings_updated} "
        f"cancelled={stats.meetings_cancelled} restored={stats.meetings_restored} "
        f"revisions={stats.revisions_appended} people_created={stats.people_created} "
        f"companies_created={stats.companies_created} "
        f"links(company={stats.meeting_company_links}, "
        f"person={stats.meeting_person_links}, "
        f"sales_rep={stats.meeting_sales_rep_links}) "
        f"failed={stats.failed}"
    )

    _append_sync_audit(syncer.change_log, stats)

    return stats


_BACKEND_ROOT = Path(__file__).resolve().parents[3]
SYNC_AUDIT_PATH = _BACKEND_ROOT / "data" / "calendar_sync_audit.jsonl"


def _append_sync_audit(change_log: list[dict], stats: SyncStats) -> None:
    """Append one JSON line per sync tick with all detected changes."""
    if not change_log:
        return
    tick_record = {
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "stats": stats.model_dump(),
        "changes": change_log,
    }
    try:
        SYNC_AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with SYNC_AUDIT_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(tick_record, default=str) + "\n")
    except Exception:
        logger.exception("Failed to write calendar sync audit log to %s", SYNC_AUDIT_PATH)


async def run_periodic_calendar_sync(*, run_immediately: bool = True) -> None:
    interval_seconds = max(settings.calendar_sync_interval_seconds, 10)
    first_iteration = True
    while True:
        if first_iteration and not run_immediately:
            await asyncio.sleep(interval_seconds)
        first_iteration = False

        started = datetime.now(timezone.utc)
        try:
            stats = await sync_calendars_once()
            terminal(
                f"Tick done; sleeping for "
                f"{max(interval_seconds - (datetime.now(timezone.utc) - started).total_seconds(), 0):.1f}s "
                f"(events={stats.events_seen}, failed={stats.failed})"
            )
        except asyncio.CancelledError:
            terminal("Periodic calendar sync loop cancelled")
            raise
        except Exception:
            logger.exception("Calendar periodic sync loop failed")
            terminal("Periodic calendar sync loop failed; will retry next tick")

        elapsed_seconds = (datetime.now(timezone.utc) - started).total_seconds()
        sleep_seconds = max(interval_seconds - elapsed_seconds, 0)
        await asyncio.sleep(sleep_seconds)
