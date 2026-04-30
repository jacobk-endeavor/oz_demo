from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meeting import Meeting
from app.repositories.meeting_recording_repo import MeetingRecordingRepo
from app.repositories.meeting_repo import MeetingRepo

logger = logging.getLogger(__name__)

MATCH_WINDOW_MINUTES = 10
MAX_TITLE_DISTANCE = 3


def _normalize_title(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", value).strip().lower()
    return normalized or None


def _bounded_levenshtein_distance(
    left: str, right: str, max_distance: int
) -> int | None:
    if left == right:
        return 0
    if abs(len(left) - len(right)) > max_distance:
        return None

    previous = list(range(len(right) + 1))
    for left_index, left_char in enumerate(left, start=1):
        current = [left_index]
        row_min = current[0]
        for right_index, right_char in enumerate(right, start=1):
            insertion = previous[right_index] + 1
            deletion = current[right_index - 1] + 1
            substitution = previous[right_index - 1] + (
                0 if left_char == right_char else 1
            )
            distance = min(insertion, deletion, substitution)
            current.append(distance)
            row_min = min(row_min, distance)

        if row_min > max_distance:
            return None
        previous = current

    final_distance = previous[-1]
    if final_distance > max_distance:
        return None
    return final_distance


def _title_distance_within_limit(left: str | None, right: str | None) -> int | None:
    normalized_left = _normalize_title(left)
    normalized_right = _normalize_title(right)
    if not normalized_left or not normalized_right:
        return None
    return _bounded_levenshtein_distance(
        normalized_left, normalized_right, MAX_TITLE_DISTANCE
    )


def _within_time_window(
    left_start_at: datetime | None,
    right_start_at: datetime | None,
    *,
    minutes: int = MATCH_WINDOW_MINUTES,
) -> bool:
    if left_start_at is None or right_start_at is None:
        return False
    return abs((left_start_at - right_start_at).total_seconds()) <= minutes * 60


async def find_best_meeting_id(
    db: AsyncSession,
    title: str | None,
    start_at: datetime | None,
) -> int | None:
    """Find the best matching meeting by title similarity + time window.

    Returns the meeting id or None.
    """
    if start_at is None:
        return None
    normalized = _normalize_title(title)
    if not normalized:
        return None

    meeting_repo = MeetingRepo(db)
    window_start = start_at - timedelta(minutes=MATCH_WINDOW_MINUTES)
    window_end = start_at + timedelta(minutes=MATCH_WINDOW_MINUTES)
    meetings = await meeting_repo.get_meetings_in_time_window(window_start, window_end)

    best_score: tuple[float, int, int] | None = None
    best_meeting_id: int | None = None
    for meeting in meetings:
        if not _within_time_window(meeting.start_at, start_at):
            continue

        title_distance = _title_distance_within_limit(meeting.title, normalized)
        if title_distance is None:
            continue

        time_delta_seconds = abs(
            (meeting.start_at - start_at).total_seconds()
        )
        score = (time_delta_seconds, title_distance, meeting.id)
        if best_score is None or score < best_score:
            best_score = score
            best_meeting_id = meeting.id

    return best_meeting_id


async def link_unlinked_recordings_for_meeting(
    db: AsyncSession, meeting: Meeting
) -> int:
    if meeting.start_at is None:
        logger.debug(
            "Skipping meeting match for meeting_id=%s: missing start_at", meeting.id
        )
        return 0

    normalized_meeting_title = _normalize_title(meeting.title)
    if not normalized_meeting_title:
        logger.debug(
            "Skipping meeting match for meeting_id=%s: missing title", meeting.id
        )
        return 0

    recording_repo = MeetingRecordingRepo(db)
    window_start = meeting.start_at - timedelta(minutes=MATCH_WINDOW_MINUTES)
    window_end = meeting.start_at + timedelta(minutes=MATCH_WINDOW_MINUTES)
    candidates = await recording_repo.get_unlinked_in_time_window(
        window_start, window_end
    )

    matching_recording_ids: list[int] = []
    for recording in candidates:
        if not _within_time_window(recording.start_at, meeting.start_at):
            continue
        title_distance = _title_distance_within_limit(
            normalized_meeting_title, recording.title
        )
        if title_distance is None:
            continue
        matching_recording_ids.append(recording.id)

    if not matching_recording_ids:
        return 0

    linked_count = await recording_repo.update_meeting_id(
        matching_recording_ids, meeting.id
    )
    if linked_count:
        logger.info(
            "Linked %s recording(s) to meeting_id=%s",
            linked_count,
            meeting.id,
        )
    return linked_count
