"""Shared transcript formatting utilities for AI summary services."""

from __future__ import annotations

from datetime import datetime, timezone

from app.repositories.meeting_recording_repo import TranscriptSource


def format_call_date(value: datetime | None) -> str:
    if value is None:
        return "Unknown"
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def render_transcript_blocks(
    sources: list[TranscriptSource],
    *,
    include_ids_in_delimiter: bool = False,
) -> str:
    blocks: list[str] = []
    for index, source in enumerate(sources, start=1):
        start_marker = (
            f"--- TRANSCRIPT START ({source.meeting_id}, {source.recording_id}) ---"
            if include_ids_in_delimiter
            else "--- TRANSCRIPT START ---"
        )
        blocks.extend(
            [
                f"Call #{index}",
                f"Call Date: {format_call_date(source.call_date)}",
                f"Meeting ID: {source.meeting_id}",
                f"Recording ID: {source.recording_id}",
                f"Meeting Title: {source.meeting_title}",
                start_marker,
                source.transcript,
                "--- TRANSCRIPT END ---",
                "",
            ]
        )
    return "\n".join(blocks).strip()
