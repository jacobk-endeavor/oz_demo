from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx
from pydantic import BaseModel

from app.config import settings
from app.database import async_session
from app.repositories.ask_elephant_sync_repo import AskElephantSyncRepo
from app.repositories.meeting_recording_repo import MeetingRecordingRepo
from app.repositories.meeting_repo import MeetingRepo
from app.services.company_summary import refresh_company_summary_for_company
from app.services.meeting_summary import refresh_meeting_summary_for_meeting
from app.services.meeting_recording_matcher import find_best_meeting_id
from app.services.transcript_indexer import index_transcript

logger = logging.getLogger(__name__)

_SYNC_SOURCE = "meetings_export"
_MAX_ATTEMPTS = 4
_MAX_FAILURE_RETRY_IDS = 200
_EXTRA_PAGES_PAST_BOUNDARY = 3
_TRANSCRIPT_LOOKBACK_HOURS = 24
_TRANSCRIPT_REFETCH_BATCH_SIZE = 20


def _terminal(message: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[ask-elephant-sync {ts}] {message}", flush=True)


class SyncStats(BaseModel):
    pulled: int = 0
    meeting_recordings_upserted: int = 0
    failed: int = 0


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _chunked(values: list[str], size: int) -> list[list[str]]:
    return [values[i : i + size] for i in range(0, len(values), size)]


class AskElephantSyncer:
    def __init__(self, db, client: httpx.AsyncClient) -> None:
        self._db = db
        self._client = client
        self.stats = SyncStats()
        self._had_errors = False
        self._sync_repo = AskElephantSyncRepo(db)
        self._meeting_repo = MeetingRepo(db)
        self._recording_repo = MeetingRecordingRepo(db)

    # -- public entry point ----------------------------------------------------

    async def run(self) -> SyncStats:
        run_start = datetime.now(timezone.utc)
        state = await self._sync_repo.get_or_create_state(_SYNC_SOURCE)
        try:
            state.last_run_at = run_start

            await self._retry_failed_engagements()
            await self._fetch_new_engagements()
            await self._refetch_missing_recent_transcripts()

            if self._had_errors:
                state.last_error = "One or more engagements failed during sync"
            else:
                state.last_successful_start_at = run_start
                state.last_error = None
            await self._sync_repo.commit()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await self._sync_repo.rollback()
            state.last_error = f"Run failed: {exc}"
            state.last_run_at = run_start
            await self._sync_repo.commit()
            _terminal(f"Sync run failed: {exc}")
            raise

        return self.stats

    # -- HTTP layer ------------------------------------------------------------

    async def _request_json(
        self,
        method: str,
        url: str,
        *,
        params: dict | None = None,
        payload: dict | None = None,
        allow_404: bool = False,
    ) -> dict:
        delay_seconds = 1.0
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                response = await self._client.request(
                    method,
                    url,
                    params=params,
                    json=payload,
                    headers={"X-Api-Key": settings.ask_elephant_api_key},
                )
            except httpx.RequestError:
                if attempt == _MAX_ATTEMPTS:
                    raise
                await asyncio.sleep(delay_seconds)
                delay_seconds = min(delay_seconds * 2, 30.0)
                continue

            if allow_404 and response.status_code == 404:
                return {}

            if response.status_code == 429 or response.status_code >= 500:
                if attempt == _MAX_ATTEMPTS:
                    response.raise_for_status()

                retry_after = response.headers.get("Retry-After")
                if retry_after and retry_after.isdigit():
                    wait_seconds = float(retry_after)
                else:
                    wait_seconds = delay_seconds
                    try:
                        body = response.json()
                        wait_seconds = float(
                            body.get("retryAfterSeconds", delay_seconds)
                        )
                    except (TypeError, ValueError):
                        pass
                await asyncio.sleep(wait_seconds)
                delay_seconds = min(delay_seconds * 2, 30.0)
                continue

            response.raise_for_status()
            return response.json()

        return {}

    # -- core processing -------------------------------------------------------

    async def _process_engagement(self, engagement: dict) -> bool:
        engagement_id = engagement.get("engagementId")
        if not engagement_id:
            return True

        try:
            title_value = engagement.get("title")
            title = title_value.strip() if isinstance(title_value, str) else ""
            title = title if title else "Untitled meeting recording"
            summary = engagement.get("description")
            transcript_value = engagement.get("transcript")
            transcript = (
                transcript_value if isinstance(transcript_value, str) else ""
            )
            start_at = _parse_datetime(engagement.get("startAt"))

            meeting_recording = await self._recording_repo.get_by_engagement_id(
                engagement_id
            )
            previous_transcript = ""

            if meeting_recording is None:
                # New recording — persist even when no immediate meeting match exists.
                meeting_id = await find_best_meeting_id(
                    self._db, title, start_at
                )
                meeting_recording = await self._recording_repo.create(
                    engagement_id=engagement_id,
                    title=title,
                    summary=summary,
                    transcript=transcript,
                    start_at=start_at,
                    meeting_id=meeting_id,
                )
                if meeting_id is None:
                    logger.info(
                        "Persisted engagement %s without matching meeting; will attempt linkage later",
                        engagement_id,
                    )
            else:
                # Existing recording — just update fields.
                previous_transcript = meeting_recording.transcript or ""
                meeting_recording.title = title
                meeting_recording.summary = summary
                meeting_recording.transcript = transcript
                meeting_recording.start_at = start_at
                if meeting_recording.meeting_id is None:
                    meeting_recording.meeting_id = await find_best_meeting_id(
                        self._db, title, start_at
                    )
                await self._recording_repo.flush()

            transcript_became_available = (
                bool(transcript.strip()) and not bool(previous_transcript.strip())
            )

            await self._sync_repo.clear_failure(engagement_id)
            await self._sync_repo.commit()
            if transcript_became_available:
                try:
                    await index_transcript(meeting_recording.id, self._db)
                except Exception:
                    logger.exception(
                        "TurboPuffer indexing failed for recording %s",
                        meeting_recording.id,
                    )
                await self._refresh_linked_meeting_and_company_summaries(
                    meeting_recording
                )

            self.stats.meeting_recordings_upserted += 1
            return True
        except Exception as exc:
            await self._sync_repo.rollback()
            await self._sync_repo.record_failure(engagement_id, str(exc))
            await self._sync_repo.commit()
            self.stats.failed += 1
            logger.exception(
                "AskElephant sync failed for engagement %s", engagement_id
            )
            _terminal(f"Failed engagement {engagement_id}: {exc}")
            return False

    async def _refresh_linked_meeting_and_company_summaries(
        self, meeting_recording
    ) -> None:
        meeting_id = meeting_recording.meeting_id
        if meeting_id is None:
            return

        try:
            await refresh_meeting_summary_for_meeting(self._db, meeting_id)
        except Exception:
            logger.exception(
                "Failed refreshing meeting summary for meeting_id=%s (recording_id=%s)",
                meeting_id,
                meeting_recording.id,
            )
            _terminal(
                "Meeting summary refresh failed "
                f"(meeting_id={meeting_id}, recording_id={meeting_recording.id})"
            )

        try:
            await self._refresh_linked_company_summaries(meeting_recording)
        except Exception:
            logger.exception(
                "Unexpected failure while refreshing linked company summaries "
                "(meeting_id=%s, recording_id=%s)",
                meeting_id,
                meeting_recording.id,
            )
            _terminal(
                "Company summary refresh encountered an unexpected failure "
                f"(meeting_id={meeting_id}, recording_id={meeting_recording.id})"
            )

    async def _refresh_linked_company_summaries(self, meeting_recording) -> None:
        meeting_id = meeting_recording.meeting_id
        if meeting_id is None:
            return

        company_ids = await self._meeting_repo.get_company_ids_for_meeting(meeting_id)
        failed_company_ids: list[int] = []
        for company_id in sorted(set(company_ids)):
            try:
                await refresh_company_summary_for_company(self._db, company_id)
            except Exception:
                failed_company_ids.append(company_id)
                logger.exception(
                    "Failed refreshing company summary for company_id=%s "
                    "(meeting_id=%s, recording_id=%s)",
                    company_id,
                    meeting_id,
                    meeting_recording.id,
                )

        if failed_company_ids:
            _terminal(
                "Company summary refresh completed with failures "
                f"(meeting_id={meeting_id}, recording_id={meeting_recording.id}, "
                f"failed_company_ids={failed_company_ids})"
            )

    async def _retry_failed_engagements(self) -> None:
        failure_ids = await self._sync_repo.list_failure_ids(_MAX_FAILURE_RETRY_IDS)
        if failure_ids:
            _terminal(f"Retrying {len(failure_ids)} previously failed engagement(s)")
        for engagement_ids in _chunked(failure_ids, 20):
            payload = await self._request_json(
                "POST",
                "v1/meetings/export",
                payload={"engagementIds": engagement_ids},
            )
            for not_found_id in payload.get("notFoundEngagementIds", []):
                await self._sync_repo.clear_failure(not_found_id)
                await self._sync_repo.commit()

            for engagement in payload.get("engagements", []):
                self.stats.pulled += 1
                ok = await self._process_engagement(engagement)
                self._had_errors = self._had_errors or not ok

    async def _fetch_new_engagements(self) -> None:
        cursor: str | None = None
        fully_known_pages_past_boundary = 0
        ingestion_boundary_seen = False

        while True:
            params: dict[str, str] = {"sortDirection": "desc"}
            if cursor:
                params["cursor"] = cursor

            page = await self._request_json(
                "GET",
                "v1/meetings/export",
                params=params,
            )
            engagements = page.get("engagements", [])
            page_had_unseen_engagement = False
            boundary_seen_before_page = ingestion_boundary_seen

            for engagement in engagements:
                engagement_id = engagement.get("engagementId")
                if engagement_id and await self._recording_repo.exists_by_engagement_id(
                    engagement_id
                ):
                    if not ingestion_boundary_seen:
                        ingestion_boundary_seen = True
                        _terminal(
                            f"Reached already-ingested engagement {engagement_id}; "
                            "switching to boundary scan mode"
                        )
                    continue

                page_had_unseen_engagement = True
                self.stats.pulled += 1
                ok = await self._process_engagement(engagement)
                self._had_errors = self._had_errors or not ok

            cursor = page.get("nextCursor")
            if not cursor:
                break

            if boundary_seen_before_page:
                if page_had_unseen_engagement:
                    fully_known_pages_past_boundary = 0
                else:
                    fully_known_pages_past_boundary += 1

                if fully_known_pages_past_boundary >= _EXTRA_PAGES_PAST_BOUNDARY:
                    _terminal(
                        "Stopping boundary scan after "
                        f"{_EXTRA_PAGES_PAST_BOUNDARY} consecutive fully-known page(s)"
                    )
                    break

    async def _refetch_missing_recent_transcripts(self) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=_TRANSCRIPT_LOOKBACK_HOURS)
        engagement_ids = (
            await self._recording_repo.get_missing_transcript_engagement_ids_since(cutoff)
        )
        if not engagement_ids:
            _terminal("Transcript backfill: no recent recordings missing transcripts")
            return

        batches = _chunked(engagement_ids, _TRANSCRIPT_REFETCH_BATCH_SIZE)
        _terminal(
            "Transcript backfill: "
            f"{len(engagement_ids)} candidate recording(s) in the last "
            f"{_TRANSCRIPT_LOOKBACK_HOURS}h ({len(batches)} batch(es))"
        )

        upserted = 0
        transcripts_filled = 0
        for index, engagement_ids_batch in enumerate(batches, start=1):
            _terminal(
                "Transcript backfill: "
                f"fetching batch {index}/{len(batches)} "
                f"({len(engagement_ids_batch)} engagement id(s))"
            )
            payload = await self._request_json(
                "POST",
                "v1/meetings/export",
                payload={"engagementIds": engagement_ids_batch},
            )
            not_found_ids = payload.get("notFoundEngagementIds", [])
            if not_found_ids:
                _terminal(
                    "Transcript backfill: "
                    f"{len(not_found_ids)} engagement id(s) not found/exportable"
                )

            for engagement in payload.get("engagements", []):
                self.stats.pulled += 1
                transcript_value = engagement.get("transcript")
                has_transcript = (
                    isinstance(transcript_value, str)
                    and bool(transcript_value.strip())
                )

                ok = await self._process_engagement(engagement)
                self._had_errors = self._had_errors or not ok
                if ok:
                    upserted += 1
                    if has_transcript:
                        transcripts_filled += 1

        _terminal(
            "Transcript backfill complete "
            f"upserted={upserted} with_transcript={transcripts_filled}"
        )


# -- module-level public API ---------------------------------------------------


async def sync_ask_elephant_meeting_recordings_once() -> SyncStats:
    if not settings.ask_elephant_sync_enabled:
        logger.debug("AskElephant sync disabled by configuration")
        return SyncStats()
    if not settings.ask_elephant_api_key:
        logger.debug("AskElephant sync skipped because ask_elephant_api_key is empty")
        _terminal("Skipped run because ASK_ELEPHANT_API_KEY is empty")
        return SyncStats()

    _terminal("Starting sync run")

    async with async_session() as db:
        async with httpx.AsyncClient(
            base_url=settings.ask_elephant_base_url.rstrip("/"),
            timeout=30.0,
        ) as client:
            syncer = AskElephantSyncer(db, client)
            stats = await syncer.run()

    logger.info(
        "AskElephant sync complete pulled=%s upserted=%s failed=%s",
        stats.pulled,
        stats.meeting_recordings_upserted,
        stats.failed,
    )
    _terminal(
        "Sync complete "
        f"pulled={stats.pulled} upserted={stats.meeting_recordings_upserted} "
        f"failed={stats.failed}"
    )
    return stats


async def run_periodic_ask_elephant_sync(*, run_immediately: bool = True) -> None:
    interval_seconds = max(settings.ask_elephant_sync_interval_seconds, 10)
    first_iteration = True
    while True:
        if first_iteration and not run_immediately:
            await asyncio.sleep(interval_seconds)
        first_iteration = False

        started = datetime.now(timezone.utc)
        try:
            stats = await sync_ask_elephant_meeting_recordings_once()
            _terminal(
                f"Tick done; sleeping for {max(interval_seconds - (datetime.now(timezone.utc) - started).total_seconds(), 0):.1f}s "
                f"(upserted={stats.meeting_recordings_upserted}, failed={stats.failed})"
            )
        except asyncio.CancelledError:
            _terminal("Periodic sync loop cancelled")
            raise
        except Exception:
            logger.exception("AskElephant periodic sync loop failed")
            _terminal("Periodic sync loop failed; will retry next tick")

        elapsed_seconds = (datetime.now(timezone.utc) - started).total_seconds()
        sleep_seconds = max(interval_seconds - elapsed_seconds, 0)
        await asyncio.sleep(sleep_seconds)
