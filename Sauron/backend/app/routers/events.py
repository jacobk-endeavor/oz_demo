from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_non_basic
from app.fuzzy_search import (
    fuzzy_text_match,
    normalize_search_term,
    relevance_score,
    strict_multi_word_filter,
)
from app.models.event import Event
from app.repositories.event_repo import EventRepo
from app.schemas.event import EventDetail, EventListResponse, EventRead, EventUpdate

router = APIRouter(
    prefix="/api/events", tags=["events"], dependencies=[Depends(require_non_basic)]
)


@router.get("", response_model=EventListResponse)
async def list_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    repo = EventRepo(db)
    filters = []
    order_by = None
    normalized_search = normalize_search_term(search)
    if normalized_search:
        strict = strict_multi_word_filter([Event.name], normalized_search)
        if strict is not None:
            high_conf = fuzzy_text_match(Event.name, normalized_search, threshold=0.45)
            filters.append(or_(strict, high_conf))
        else:
            filters.append(fuzzy_text_match(Event.name, normalized_search))
        order_by = [relevance_score(Event.name, normalized_search).desc(), Event.name.asc()]
    total = await repo.count(filters)
    offset = (page - 1) * page_size
    items = await repo.list_paginated(filters, offset, page_size, order_by=order_by)
    total_pages = (total + page_size - 1) // page_size if total else 0
    return EventListResponse(items=items, total=total, page=page, page_size=page_size, total_pages=total_pages)


@router.get("/{id}")
async def get_event(id: int, db: AsyncSession = Depends(get_db)):
    repo = EventRepo(db)
    item = await repo.get_by_id(id, load_detail=True)
    if not item:
        raise HTTPException(404, "Event not found")
    return EventDetail(
        **{c.key: getattr(item, c.key) for c in Event.__table__.columns},
        industry_group=item.industry_group,
        company_visits=[
            {
                "id": v.id,
                "company_id": v.company_id,
                "company_name": v.company.name,
                "is_sponsor": v.is_sponsor,
            }
            for v in item.company_visits
        ],
        person_visits=[
            {
                "id": v.id,
                "person_id": v.person_id,
                "person_first_name": v.person.first_name,
                "person_last_name": v.person.last_name,
                "is_keynote_speaker": v.is_keynote_speaker,
            }
            for v in item.person_visits
        ],
    )


@router.patch("/{id}", response_model=EventRead)
async def update_event(id: int, data: EventUpdate, db: AsyncSession = Depends(get_db)):
    repo = EventRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "Event not found")
    await repo.update(item, data.model_dump(exclude_unset=True))
    await repo.commit()
    await repo.refresh(item)
    return item


@router.delete("/{id}", status_code=204)
async def delete_event(id: int, db: AsyncSession = Depends(get_db)):
    repo = EventRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "Event not found")
    await repo.delete(item)
    await repo.commit()
