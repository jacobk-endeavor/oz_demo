from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer, joinedload, selectinload

from app.models.associations import (
    meeting_company,
    meeting_person,
    meeting_recording_person,
)
from app.models.meeting import Meeting
from app.models.meeting_recording import MeetingRecording
from app.repositories._base_repo import BaseRepo


class TranscriptSource(BaseModel):
    model_config = {"frozen": True}

    meeting_id: int
    meeting_title: str
    recording_id: int
    call_date: datetime | None
    transcript: str


class MeetingRecordingRepo(BaseRepo[MeetingRecording]):
    _model = MeetingRecording

    async def list_paginated(
        self,
        filters: list,
        offset: int,
        limit: int,
    ) -> list[MeetingRecording]:
        stmt = (
            select(MeetingRecording)
            .options(
                defer(MeetingRecording.transcript),
                selectinload(MeetingRecording.companies),
                selectinload(MeetingRecording.sales_reps),
                joinedload(MeetingRecording.meeting).selectinload(Meeting.sales_reps),
                joinedload(MeetingRecording.meeting).selectinload(Meeting.people),
                joinedload(MeetingRecording.meeting).selectinload(Meeting.companies),
            )
            .order_by(MeetingRecording.start_at.desc(), MeetingRecording.id.desc())
            .offset(offset)
            .limit(limit)
        )
        if filters:
            stmt = stmt.where(*filters)
        result = await self._db.execute(stmt)
        return list(result.unique().scalars().all())

    async def count(self, filters: list) -> int:
        stmt = select(func.count(MeetingRecording.id)).select_from(MeetingRecording)
        if filters:
            stmt = stmt.where(*filters)
        result = await self._db.execute(stmt)
        return result.scalar_one()

    async def get_person_counts_by_recording(
        self, recording_ids: list[int]
    ) -> dict[int, int]:
        if not recording_ids:
            return {}
        stmt = (
            select(
                meeting_recording_person.c.meeting_recording_id,
                func.count(meeting_recording_person.c.person_id),
            )
            .where(
                meeting_recording_person.c.meeting_recording_id.in_(recording_ids)
            )
            .group_by(meeting_recording_person.c.meeting_recording_id)
        )
        rows = await self._db.execute(stmt)
        return dict(rows.all())

    async def get_by_id(
        self, id: int, *, load_detail: bool = False
    ) -> MeetingRecording | None:
        stmt = select(MeetingRecording).where(MeetingRecording.id == id)
        if load_detail:
            stmt = stmt.options(
                selectinload(MeetingRecording.companies),
                selectinload(MeetingRecording.people),
                selectinload(MeetingRecording.sales_reps),
                joinedload(MeetingRecording.meeting).selectinload(Meeting.sales_reps),
                joinedload(MeetingRecording.meeting).selectinload(Meeting.people),
                joinedload(MeetingRecording.meeting).selectinload(Meeting.companies),
            )
        result = await self._db.execute(stmt)
        return result.unique().scalar_one_or_none()

    async def get_engagement_id(self, id: int) -> str | None:
        result = await self._db.execute(
            select(MeetingRecording.engagement_id).where(MeetingRecording.id == id)
        )
        return result.scalar_one_or_none()

    async def get_by_engagement_id(self, engagement_id: str) -> MeetingRecording | None:
        result = await self._db.execute(
            select(MeetingRecording).where(
                MeetingRecording.engagement_id == engagement_id
            )
        )
        return result.scalar_one_or_none()

    async def exists_by_engagement_id(self, engagement_id: str) -> bool:
        result = await self._db.execute(
            select(MeetingRecording.id).where(
                MeetingRecording.engagement_id == engagement_id
            )
        )
        return result.scalar_one_or_none() is not None

    async def update_meeting_id(
        self, recording_ids: list[int], meeting_id: int
    ) -> int:
        result = await self._db.execute(
            update(MeetingRecording)
            .where(
                MeetingRecording.id.in_(recording_ids),
                MeetingRecording.meeting_id.is_(None),
            )
            .values(meeting_id=meeting_id)
        )
        return result.rowcount or 0

    async def get_unlinked_in_time_window(
        self, start: datetime, end: datetime
    ) -> list[MeetingRecording]:
        result = await self._db.execute(
            select(MeetingRecording).where(
                MeetingRecording.meeting_id.is_(None),
                MeetingRecording.start_at.is_not(None),
                MeetingRecording.start_at >= start,
                MeetingRecording.start_at <= end,
            )
        )
        return list(result.scalars().all())

    async def get_missing_transcript_engagement_ids_since(
        self, since: datetime
    ) -> list[str]:
        result = await self._db.execute(
            select(MeetingRecording.engagement_id).where(
                MeetingRecording.start_at.is_not(None),
                MeetingRecording.start_at >= since,
                or_(
                    MeetingRecording.transcript.is_(None),
                    func.length(func.trim(MeetingRecording.transcript)) == 0,
                ),
            )
        )
        engagement_ids = list(result.scalars().all())
        return [engagement_id for engagement_id in engagement_ids if engagement_id]

    async def _list_transcript_sources(
        self, extra_joins: list, extra_filters: list,
    ) -> list[TranscriptSource]:
        stmt = (
            select(
                MeetingRecording.id,
                MeetingRecording.meeting_id,
                Meeting.title,
                MeetingRecording.start_at,
                Meeting.start_at,
                MeetingRecording.transcript,
            )
            .join(Meeting, MeetingRecording.meeting_id == Meeting.id)
        )
        for join_clause in extra_joins:
            stmt = stmt.join(join_clause)
        stmt = stmt.where(
            *extra_filters,
            MeetingRecording.transcript.is_not(None),
            func.length(func.trim(MeetingRecording.transcript)) > 0,
        ).order_by(
            func.coalesce(MeetingRecording.start_at, Meeting.start_at).desc(),
            MeetingRecording.id.desc(),
        )

        result = await self._db.execute(stmt)
        sources: list[TranscriptSource] = []
        for (
            recording_id,
            meeting_id,
            meeting_title,
            recording_start_at,
            meeting_start_at,
            transcript,
        ) in result.all():
            if meeting_id is None or transcript is None:
                continue
            normalized = transcript.strip()
            if not normalized:
                continue
            sources.append(
                TranscriptSource(
                    meeting_id=meeting_id,
                    meeting_title=meeting_title or "Untitled meeting",
                    recording_id=recording_id,
                    call_date=recording_start_at or meeting_start_at,
                    transcript=normalized,
                )
            )
        return sources

    async def list_company_transcript_sources(
        self, company_id: int,
    ) -> list[TranscriptSource]:
        return await self._list_transcript_sources(
            extra_joins=[meeting_company],
            extra_filters=[meeting_company.c.company_id == company_id],
        )

    async def list_meeting_transcript_sources(
        self, meeting_id: int,
    ) -> list[TranscriptSource]:
        return await self._list_transcript_sources(
            extra_joins=[],
            extra_filters=[MeetingRecording.meeting_id == meeting_id],
        )

    async def list_person_transcript_sources(
        self, person_id: int,
    ) -> list[TranscriptSource]:
        return await self._list_transcript_sources(
            extra_joins=[meeting_person],
            extra_filters=[meeting_person.c.person_id == person_id],
        )
