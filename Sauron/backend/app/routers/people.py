from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_non_basic
from app.fuzzy_search import (
    fuzzy_text_match,
    normalize_search_term,
    relevance_score,
    strict_multi_word_filter,
)
from app.models.person import Person
from app.models.user import User
from app.repositories.meeting_recording_repo import MeetingRecordingRepo
from app.repositories.person_repo import PersonRepo
from app.schemas.person import PersonDetail, PersonListResponse, PersonRead, PersonUpdate
from app.routers._helpers import display_name
from app.services.person_chat import stream_person_chat

_EPOCH_MIN = datetime.min.replace(tzinfo=timezone.utc)

router = APIRouter(
    prefix="/api/people", tags=["people"], dependencies=[Depends(require_non_basic)]
)


@router.get("", response_model=PersonListResponse)
async def list_people(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    repo = PersonRepo(db)
    filters = []
    order_by = None
    normalized_search = normalize_search_term(search)
    if normalized_search:
        cols = [Person.first_name, Person.last_name, Person.email]
        strict = strict_multi_word_filter(cols, normalized_search)
        if strict is not None:
            high_conf = or_(*(fuzzy_text_match(c, normalized_search, threshold=0.45) for c in cols))
            filters.append(or_(strict, high_conf))
        else:
            filters.append(or_(*(fuzzy_text_match(c, normalized_search) for c in cols)))

        full_name = func.concat(
            func.coalesce(Person.first_name, ""), " ", func.coalesce(Person.last_name, "")
        )
        order_by = [
            relevance_score(full_name, normalized_search).desc(),
            Person.last_name.asc(),
            Person.first_name.asc(),
        ]
    total = await repo.count(filters)
    offset = (page - 1) * page_size
    items = await repo.list_paginated(filters, offset, page_size, order_by=order_by)
    total_pages = (total + page_size - 1) // page_size if total else 0
    return PersonListResponse(items=items, total=total, page=page, page_size=page_size, total_pages=total_pages)


@router.get("/{id}")
async def get_person(id: int, db: AsyncSession = Depends(get_db)):
    repo = PersonRepo(db)
    person = await repo.get_by_id(id, load_detail=True)
    if not person:
        raise HTTPException(404, "Person not found")
    return PersonDetail(
        **{c.key: getattr(person, c.key) for c in Person.__table__.columns},
        positions=[
            {
                "id": p.id,
                "title": p.title,
                "role": p.role.value if p.role else None,
                "company_id": p.company_id,
                "company_name": p.company.name if p.company else None,
                "pe_group_id": p.pe_group_id,
                "pe_group_name": p.pe_group.name if p.pe_group else None,
                "industry_group_id": p.industry_group_id,
                "industry_group_name": p.industry_group.name if p.industry_group else None,
            }
            for p in person.positions
        ],
        donations=person.donations,
        meetings=[
            {
                "id": m.id,
                "title": m.title,
                "start_at": m.start_at,
                "duration_minutes": m.duration_minutes,
                "sales_reps": [
                    {"id": sr.id, "display_name": display_name(sr)}
                    for sr in m.sales_reps
                ],
            }
            for m in sorted(
                person.meetings,
                key=lambda m: m.start_at or _EPOCH_MIN,
                reverse=True,
            )
        ],
    )


@router.patch("/{id}", response_model=PersonRead)
async def update_person(id: int, data: PersonUpdate, db: AsyncSession = Depends(get_db)):
    repo = PersonRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "Person not found")
    await repo.update(item, data.model_dump(exclude_unset=True))
    await repo.commit()
    await repo.refresh(item)
    return item


@router.delete("/{id}", status_code=204)
async def delete_person(id: int, db: AsyncSession = Depends(get_db)):
    repo = PersonRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "Person not found")
    await repo.delete(item)
    await repo.commit()


class PersonChatMessage(BaseModel):
    role: str
    content: str


class PersonChatRequest(BaseModel):
    messages: list[PersonChatMessage]


@router.post("/{id}/chat")
async def person_chat(
    id: int,
    body: PersonChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    person_repo = PersonRepo(db)
    person = await person_repo.get_by_id(id)
    if not person:
        raise HTTPException(404, "Person not found")

    recording_repo = MeetingRecordingRepo(db)
    sources = await recording_repo.list_person_transcript_sources(id)

    if not sources:
        raise HTTPException(422, "No transcripts available for this person")

    parts: list[str] = []
    for src in sources:
        date_label = (
            src.call_date.strftime("%Y-%m-%d") if src.call_date else "Unknown date"
        )
        parts.append(
            f"--- MEETING: {src.meeting_title} ({date_label}) ---\n{src.transcript}"
        )
    transcripts_block = "\n\n".join(parts)

    person_name = f"{person.first_name} {person.last_name}"

    return StreamingResponse(
        stream_person_chat(
            person_name=person_name,
            transcripts_block=transcripts_block,
            messages=[m.model_dump() for m in body.messages],
            person_id=id,
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
