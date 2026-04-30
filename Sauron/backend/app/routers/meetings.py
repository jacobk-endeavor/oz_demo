from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import or_, select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.dependencies import get_current_user, get_db, require_non_basic
from app.models.associations import meeting_sales_rep
from app.models.meeting import Meeting
from app.models.sales_rep import SalesRep
from app.models.user import User
from app.schemas.meeting import (
    MeetingCompanyRead,
    MeetingDetailRead,
    MeetingListResponse,
    MeetingRead,
    MeetingSalesRepRead,
)
from app.repositories.meeting_repo import MeetingRepo
from app.repositories.meeting_recording_repo import MeetingRecordingRepo
from app.routers._helpers import display_name
from app.services.meeting_chat import stream_meeting_chat

router = APIRouter(
    prefix="/api/meetings",
    tags=["meetings"],
    dependencies=[Depends(require_non_basic)],
)


def _sort_sales_reps(sales_reps: list[SalesRep]) -> list[SalesRep]:
    return sorted(
        sales_reps,
        key=lambda sr: (
            display_name(sr).lower(),
            (sr.email or "").lower(),
        ),
    )


def _person_display_name(
    first_name: str | None, last_name: str | None, email: str
) -> str:
    full_name = " ".join(part for part in [first_name, last_name] if part).strip()
    return full_name or email


def _resolve_timezone_or_utc(timezone_name: str | None):
    if timezone_name is None:
        return timezone.utc

    normalized_timezone = timezone_name.strip()
    if not normalized_timezone:
        return timezone.utc

    try:
        return ZoneInfo(normalized_timezone)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid timezone: {timezone_name}",
        ) from exc


def _local_day_bounds_to_utc(
    *, date_from: date | None, date_to: date | None, timezone_name: str | None
) -> tuple[datetime | None, datetime | None]:
    local_timezone = _resolve_timezone_or_utc(timezone_name)

    start_at_utc = None
    if date_from is not None:
        start_at_utc = datetime.combine(
            date_from, time.min, tzinfo=local_timezone
        ).astimezone(timezone.utc)

    end_at_utc = None
    if date_to is not None:
        end_at_utc = datetime.combine(
            date_to + timedelta(days=1), time.min, tzinfo=local_timezone
        ).astimezone(timezone.utc)

    return start_at_utc, end_at_utc


@router.get("", response_model=MeetingListResponse)
async def list_meetings(
    page: int = Query(1, ge=1),
    page_size: int = Query(250, ge=1, le=1000),
    search: str | None = Query(None),
    sales_rep_id: int | None = Query(None, ge=1),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    timezone_name: str | None = Query(None, alias="timezone"),
    include_cancelled: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    filters = []

    if not include_cancelled:
        filters.append(Meeting.cancelled_at.is_(None))

    normalized_search = search.strip() if search else None
    if normalized_search:
        search_pattern = f"%{normalized_search}%"
        filters.append(
            or_(
                Meeting.title.ilike(search_pattern),
                Meeting.description.ilike(search_pattern),
                Meeting.location.ilike(search_pattern),
                Meeting.external_uid.ilike(search_pattern),
            )
        )

    if sales_rep_id is not None:
        rep_mtg_ids = sa_select(meeting_sales_rep.c.meeting_id).where(
            meeting_sales_rep.c.sales_rep_id == sales_rep_id
        )
        filters.append(Meeting.id.in_(rep_mtg_ids))

    date_from_utc, date_to_utc = _local_day_bounds_to_utc(
        date_from=date_from,
        date_to=date_to,
        timezone_name=timezone_name,
    )
    if date_from_utc is not None:
        filters.append(Meeting.start_at >= date_from_utc)
    if date_to_utc is not None:
        filters.append(Meeting.start_at < date_to_utc)

    repo = MeetingRepo(db)
    offset = (page - 1) * page_size
    meetings = await repo.list_paginated(filters, offset, page_size)

    if len(meetings) < page_size:
        total = offset + len(meetings)
    else:
        total = await repo.count(filters)

    items = [
        MeetingRead(
            id=meeting.id,
            external_uid=meeting.external_uid,
            title=meeting.title,
            start_at=meeting.start_at,
            duration_minutes=meeting.duration_minutes,
            summary=meeting.summary,
            description=meeting.description,
            meeting_url=meeting.meeting_url,
            location=meeting.location,
            cancelled_at=meeting.cancelled_at,
            sales_reps=[
                MeetingSalesRepRead(
                    id=sr.id,
                    email=sr.email,
                    display_name=display_name(sr),
                )
                for sr in _sort_sales_reps(meeting.sales_reps)
            ],
            meeting_recording_ids=[rec.id for rec in meeting.meeting_recordings],
            company_names=sorted(
                {company.name for company in meeting.companies if company.name}
            ),
            person_names=sorted(
                {
                    " ".join(
                        part for part in [person.first_name, person.last_name] if part
                    ).strip()
                    or person.email
                    for person in meeting.people
                }
            ),
            company_count=len(meeting.companies),
            person_count=len(meeting.people),
        )
        for meeting in meetings
    ]
    total_pages = (total + page_size - 1) // page_size if total else 0
    return MeetingListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{id}", response_model=MeetingDetailRead)
async def get_meeting(id: int, db: AsyncSession = Depends(get_db)):
    repo = MeetingRepo(db)
    meeting = await repo.get_by_id(id, load_detail=True)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    sorted_sales_reps = _sort_sales_reps(meeting.sales_reps)
    sorted_companies = sorted(
        meeting.companies,
        key=lambda company: (
            (company.name or "").lower(),
            company.id,
        ),
    )
    sorted_people = sorted(
        meeting.people,
        key=lambda person: (
            _person_display_name(
                person.first_name, person.last_name, person.email
            ).lower(),
            person.email.lower(),
        ),
    )
    sorted_recordings = sorted(
        meeting.meeting_recordings,
        key=lambda recording: (
            recording.start_at is None,
            recording.start_at,
            recording.id,
        ),
    )
    return MeetingDetailRead(
        id=meeting.id,
        external_uid=meeting.external_uid,
        title=meeting.title,
        start_at=meeting.start_at,
        duration_minutes=meeting.duration_minutes,
        summary=meeting.summary,
        description=meeting.description,
        meeting_url=meeting.meeting_url,
        location=meeting.location,
        cancelled_at=meeting.cancelled_at,
        sales_reps=[
            MeetingSalesRepRead(
                id=sr.id,
                email=sr.email,
                display_name=display_name(sr),
            )
            for sr in sorted_sales_reps
        ],
        meeting_recording_ids=[recording.id for recording in sorted_recordings],
        company_names=sorted(
            {company.name for company in meeting.companies if company.name}
        ),
        person_names=sorted(
            {
                _person_display_name(person.first_name, person.last_name, person.email)
                for person in meeting.people
            }
        ),
        company_count=len(meeting.companies),
        person_count=len(meeting.people),
        companies=[
            MeetingCompanyRead(
                id=c.id,
                name=c.name,
                domains=[ed.domain for ed in c.entity_domains],
            )
            for c in sorted_companies
        ],
        people=sorted_people,
        meeting_recordings=sorted_recordings,
    )


class ChatMessage(BaseModel):
    role: str
    content: str


class MeetingChatRequest(BaseModel):
    messages: list[ChatMessage]
    recording_id: int | None = None


@router.post("/{id}/chat")
async def meeting_chat(
    id: int,
    body: MeetingChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    meeting_repo = MeetingRepo(db)
    meeting = await meeting_repo.get_by_id(id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    recording_repo = MeetingRecordingRepo(db)

    if body.recording_id is not None:
        recording = await recording_repo.get_by_id(body.recording_id)
        if not recording or recording.meeting_id != meeting.id:
            raise HTTPException(404, "Recording not found for this meeting")
        transcript = (recording.transcript or "").strip()
    else:
        sources = await recording_repo.list_meeting_transcript_sources(meeting.id)
        transcript = "\n\n".join(s.transcript for s in sources).strip()

    if not transcript:
        raise HTTPException(422, "No transcript available for this meeting")

    return StreamingResponse(
        stream_meeting_chat(
            meeting_title=meeting.title,
            transcript=transcript,
            messages=[m.model_dump() for m in body.messages],
            recording_id=body.recording_id,
            meeting_id=id if body.recording_id is None else None,
            db=db,
            user_role=(
                current_user.role.value
                if hasattr(current_user.role, "value")
                else str(current_user.role)
            ),
            user_email=current_user.email,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
