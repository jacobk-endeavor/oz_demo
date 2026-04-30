from datetime import datetime

from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer, selectinload

from app.models.associations import meeting_company, meeting_person, meeting_sales_rep
from app.models.company import Company
from app.models.meeting import Meeting
from app.models.meeting_recording import MeetingRecording
from app.repositories._base_repo import BaseRepo


class MeetingRepo(BaseRepo[Meeting]):
    _model = Meeting

    async def list_paginated(
        self,
        filters: list,
        offset: int,
        limit: int,
    ) -> list[Meeting]:
        stmt = (
            select(Meeting)
            .options(
                defer(Meeting.revision_history),
                selectinload(Meeting.sales_reps),
                selectinload(Meeting.people),
                selectinload(Meeting.companies),
                selectinload(Meeting.meeting_recordings).defer(MeetingRecording.transcript),
            )
            .order_by(Meeting.start_at.asc().nulls_last(), Meeting.id.asc())
            .offset(offset)
            .limit(limit)
        )
        if filters:
            stmt = stmt.where(*filters)
        result = await self._db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(
        self, id: int, *, load_detail: bool = False
    ) -> Meeting | None:
        stmt = select(Meeting).where(Meeting.id == id)
        if load_detail:
            stmt = stmt.options(
                selectinload(Meeting.sales_reps),
                selectinload(Meeting.people),
                selectinload(Meeting.companies).selectinload(Company.entity_domains),
                selectinload(Meeting.meeting_recordings).defer(MeetingRecording.transcript),
            )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_instance_uid(self, uid: str) -> Meeting | None:
        result = await self._db.execute(
            select(Meeting).where(Meeting.instance_uid == uid)
        )
        return result.scalar_one_or_none()

    async def get_by_instance_uids(self, uids: list[str]) -> dict[str, Meeting]:
        if not uids:
            return {}
        result = await self._db.execute(
            select(Meeting).where(Meeting.instance_uid.in_(uids))
        )
        return {m.instance_uid: m for m in result.scalars().all()}

    async def get_meetings_in_time_window(
        self, start: datetime, end: datetime
    ) -> list[Meeting]:
        result = await self._db.execute(
            select(Meeting).where(
                Meeting.start_at.is_not(None),
                Meeting.start_at >= start,
                Meeting.start_at <= end,
            )
        )
        return list(result.scalars().all())

    async def replace_links(
        self,
        meeting_id: int,
        *,
        person_ids: set[int],
        company_ids: set[int],
        sales_rep_ids: set[int],
    ) -> None:
        await self._db.execute(
            delete(meeting_person).where(meeting_person.c.meeting_id == meeting_id)
        )
        if person_ids:
            await self._db.execute(
                insert(meeting_person),
                [{"meeting_id": meeting_id, "person_id": pid} for pid in sorted(person_ids)],
            )

        await self._db.execute(
            delete(meeting_company).where(meeting_company.c.meeting_id == meeting_id)
        )
        if company_ids:
            await self._db.execute(
                insert(meeting_company),
                [{"meeting_id": meeting_id, "company_id": cid} for cid in sorted(company_ids)],
            )

        await self._db.execute(
            delete(meeting_sales_rep).where(meeting_sales_rep.c.meeting_id == meeting_id)
        )
        if sales_rep_ids:
            await self._db.execute(
                insert(meeting_sales_rep),
                [{"meeting_id": meeting_id, "sales_rep_id": sid} for sid in sorted(sales_rep_ids)],
            )

    async def get_sales_rep_ids_for_meetings(
        self, meeting_ids: list[int]
    ) -> dict[int, set[int]]:
        if not meeting_ids:
            return {}
        result = await self._db.execute(
            select(meeting_sales_rep.c.meeting_id, meeting_sales_rep.c.sales_rep_id).where(
                meeting_sales_rep.c.meeting_id.in_(meeting_ids)
            )
        )
        sales_rep_ids_by_meeting: dict[int, set[int]] = {}
        for mid, sid in result.all():
            if sid is not None:
                sales_rep_ids_by_meeting.setdefault(mid, set()).add(sid)
        return sales_rep_ids_by_meeting

    async def get_company_ids_for_meeting(self, meeting_id: int) -> list[int]:
        result = await self._db.execute(
            select(meeting_company.c.company_id).where(
                meeting_company.c.meeting_id == meeting_id
            )
        )
        return [company_id for company_id in result.scalars().all() if company_id is not None]

    async def get_existing_sales_rep_ids(self, meeting_id: int) -> set[int]:
        result = await self._db.execute(
            select(meeting_sales_rep.c.sales_rep_id).where(
                meeting_sales_rep.c.meeting_id == meeting_id
            )
        )
        return {sid for sid in result.scalars().all() if sid is not None}

    async def get_instance_id(self, instance_uid: str) -> int | None:
        result = await self._db.execute(
            select(Meeting.id).where(Meeting.instance_uid == instance_uid)
        )
        return result.scalar_one_or_none()

    async def get_active_instance_uids_for_external_uids(
        self, external_uids: set[str]
    ) -> dict[str, Meeting]:
        """Return active (non-cancelled) meetings whose external_uid is in the set."""
        if not external_uids:
            return {}
        result = await self._db.execute(
            select(Meeting).where(
                Meeting.external_uid.in_(external_uids),
                Meeting.cancelled_at.is_(None),
            )
        )
        return {m.instance_uid: m for m in result.scalars().all()}
