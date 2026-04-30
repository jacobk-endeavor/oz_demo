from datetime import date, datetime, time, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import settings
from app.dependencies import get_current_user, require_admin, get_db
from app.models.associations import meeting_recording_sales_rep
from app.models.company import Company
from app.models.entity_domain import EntityDomain
from app.models.meeting_recording import MeetingRecording
from app.models.person import Person
from app.models.sales_rep import SalesRep
from app.repositories.meeting_recording_repo import MeetingRecordingRepo
from app.repositories.sales_rep_repo import SalesRepRepo
from app.routers._helpers import display_name
from app.schemas.meeting_recording import (
    MeetingRecordingDetail,
    MeetingRecordingListResponse,
    MeetingRecordingMediaUrl,
    MeetingRecordingRead,
    MeetingRecordingSalesRepCandidate,
)

router = APIRouter(
    prefix="/api/meeting-recordings",
    tags=["meeting-recordings"],
    dependencies=[Depends(require_admin)],
)


def _linked_meeting_fields(recording: MeetingRecording) -> dict:
    """Return the linked-meeting context fields for a recording response."""
    meeting = recording.meeting
    if meeting is None:
        return {
            "is_linked_to_meeting": False,
            "linked_meeting_title": None,
            "linked_meeting_company_names": [],
            "linked_meeting_person_names": [],
            "linked_meeting_sales_rep_names": [],
        }
    return {
        "is_linked_to_meeting": True,
        "linked_meeting_title": meeting.title,
        "linked_meeting_company_names": sorted(
            {c.name for c in meeting.companies if c.name}
        ),
        "linked_meeting_person_names": sorted(
            {display_name(p) for p in meeting.people}
        ),
        "linked_meeting_sales_rep_names": sorted(
            {display_name(sr) for sr in meeting.sales_reps}
        ),
    }


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


@router.get("", response_model=MeetingRecordingListResponse)
async def list_meeting_recordings(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str | None = Query(None),
    company: str | None = Query(None),
    person: str | None = Query(None),
    sales_rep: str | None = Query(None),
    sales_rep_id: int | None = Query(None, ge=1),
    sales_rep_ids: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    timezone_name: str | None = Query(None, alias="timezone"),
    has_companies: bool | None = Query(None),
    has_people: bool | None = Query(None),
    has_sales_reps: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    normalized_search = search.strip() if search else None
    if normalized_search:
        search_pattern = f"%{normalized_search}%"
        filters.append(
            or_(
                MeetingRecording.title.ilike(search_pattern),
                MeetingRecording.summary.ilike(search_pattern),
                MeetingRecording.engagement_id.ilike(search_pattern),
            )
        )

    normalized_company = company.strip() if company else None
    if normalized_company:
        company_pattern = f"%{normalized_company}%"
        domain_match = exists(
            select(EntityDomain.id).where(
                EntityDomain.company_id == Company.id,
                EntityDomain.domain.ilike(company_pattern),
            )
        )
        filters.append(
            MeetingRecording.companies.any(
                or_(Company.name.ilike(company_pattern), domain_match)
            )
        )

    normalized_person = person.strip() if person else None
    if normalized_person:
        person_pattern = f"%{normalized_person}%"
        filters.append(
            MeetingRecording.people.any(
                or_(
                    Person.first_name.ilike(person_pattern),
                    Person.last_name.ilike(person_pattern),
                    Person.email.ilike(person_pattern),
                )
            )
        )

    normalized_sales_rep = sales_rep.strip() if sales_rep else None
    if normalized_sales_rep:
        sales_rep_pattern = f"%{normalized_sales_rep}%"
        filters.append(
            MeetingRecording.sales_reps.any(
                or_(
                    SalesRep.first_name.ilike(sales_rep_pattern),
                    SalesRep.last_name.ilike(sales_rep_pattern),
                    SalesRep.email.ilike(sales_rep_pattern),
                )
            )
        )
    parsed_sales_rep_ids: set[int] = set()
    if sales_rep_id is not None:
        parsed_sales_rep_ids.add(sales_rep_id)
    if sales_rep_ids:
        for raw_id in sales_rep_ids.split(","):
            normalized_id = raw_id.strip()
            if not normalized_id:
                continue
            if normalized_id.isdigit():
                numeric_id = int(normalized_id)
                if numeric_id > 0:
                    parsed_sales_rep_ids.add(numeric_id)
    if parsed_sales_rep_ids:
        rec_ids_sub = select(meeting_recording_sales_rep.c.meeting_recording_id).where(
            meeting_recording_sales_rep.c.sales_rep_id.in_(parsed_sales_rep_ids)
        )
        filters.append(MeetingRecording.id.in_(rec_ids_sub))
    date_from_utc, date_to_utc = _local_day_bounds_to_utc(
        date_from=date_from,
        date_to=date_to,
        timezone_name=timezone_name,
    )
    if date_from_utc is not None:
        filters.append(MeetingRecording.start_at >= date_from_utc)
    if date_to_utc is not None:
        filters.append(MeetingRecording.start_at < date_to_utc)
    if has_companies is not None:
        filters.append(
            MeetingRecording.companies.any()
            if has_companies
            else ~MeetingRecording.companies.any()
        )
    if has_people is not None:
        filters.append(
            MeetingRecording.people.any()
            if has_people
            else ~MeetingRecording.people.any()
        )
    if has_sales_reps is not None:
        filters.append(
            MeetingRecording.sales_reps.any()
            if has_sales_reps
            else ~MeetingRecording.sales_reps.any()
        )

    repo = MeetingRecordingRepo(db)
    total = await repo.count(filters)
    offset = (page - 1) * page_size
    meeting_recordings = await repo.list_paginated(filters, offset, page_size)

    recording_ids = [r.id for r in meeting_recordings]
    person_counts = await repo.get_person_counts_by_recording(recording_ids)

    items = [
        MeetingRecordingRead(
            id=meeting_recording.id,
            engagement_id=meeting_recording.engagement_id,
            title=meeting_recording.title,
            summary=meeting_recording.summary,
            start_at=meeting_recording.start_at,
            meeting_id=meeting_recording.meeting_id,
            **_linked_meeting_fields(meeting_recording),
            company_names=sorted(
                {
                    company.name
                    for company in meeting_recording.companies
                    if company.name
                }
            ),
            matched_sales_rep_names=sorted(
                {
                    display_name(sr)
                    for sr in meeting_recording.sales_reps
                }
            ),
            company_count=len(meeting_recording.companies),
            person_count=person_counts.get(meeting_recording.id, 0),
            sales_rep_count=len(meeting_recording.sales_reps),
        )
        for meeting_recording in meeting_recordings
    ]
    total_pages = (total + page_size - 1) // page_size if total else 0
    return MeetingRecordingListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/sales-rep-candidates", response_model=list[MeetingRecordingSalesRepCandidate])
async def list_sales_rep_candidates(
    query: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=25),
    db: AsyncSession = Depends(get_db),
):
    normalized_query = query.strip()
    if not normalized_query:
        return []

    sales_rep_repo = SalesRepRepo(db)
    sales_reps = await sales_rep_repo.search(normalized_query, limit)
    return [
        MeetingRecordingSalesRepCandidate(
            id=sr.id,
            display_name=display_name(sr),
            email=sr.email,
        )
        for sr in sales_reps
    ]


@router.get("/{id}", response_model=MeetingRecordingDetail)
async def get_meeting_recording(id: int, db: AsyncSession = Depends(get_db)):
    repo = MeetingRecordingRepo(db)
    meeting_recording = await repo.get_by_id(id, load_detail=True)
    if not meeting_recording:
        raise HTTPException(404, "Meeting recording not found")
    return MeetingRecordingDetail(
        id=meeting_recording.id,
        engagement_id=meeting_recording.engagement_id,
        title=meeting_recording.title,
        summary=meeting_recording.summary,
        transcript=meeting_recording.transcript,
        start_at=meeting_recording.start_at,
        meeting_id=meeting_recording.meeting_id,
        **_linked_meeting_fields(meeting_recording),
        companies=meeting_recording.companies,
        people=meeting_recording.people,
        sales_reps=meeting_recording.sales_reps,
    )


@router.get("/{id}/media-url", response_model=MeetingRecordingMediaUrl)
async def get_meeting_recording_media_url(id: int, db: AsyncSession = Depends(get_db)):
    """Fetch a fresh temporary media download URL from AskElephant for a meeting recording."""
    repo = MeetingRecordingRepo(db)
    engagement_id = await repo.get_engagement_id(id)
    if not engagement_id:
        raise HTTPException(404, "Meeting recording not found")

    if not settings.ask_elephant_api_key:
        return MeetingRecordingMediaUrl(media_url=None)

    try:
        async with httpx.AsyncClient(
            base_url=settings.ask_elephant_base_url.rstrip("/"),
            timeout=15.0,
        ) as client:
            response = await client.post(
                "v1/meetings/export",
                json={"engagementIds": [engagement_id]},
                headers={"X-Api-Key": settings.ask_elephant_api_key},
            )
            if response.status_code != 200:
                return MeetingRecordingMediaUrl(media_url=None)

            data = response.json()
            engagements = data.get("engagements", [])
            if not engagements:
                return MeetingRecordingMediaUrl(media_url=None)

            media_url = engagements[0].get("tempMediaDownloadUrl")
            return MeetingRecordingMediaUrl(media_url=media_url)
    except httpx.RequestError:
        return MeetingRecordingMediaUrl(media_url=None)
