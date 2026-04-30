from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_non_basic
from app.repositories.entity_domain_repo import EntityDomainRepo
from app.fuzzy_search import (
    fuzzy_text_match,
    normalize_search_term,
    relevance_score,
    strict_multi_word_filter,
)
from app.models.industry_group import IndustryGroup
from app.repositories.industry_group_repo import IndustryGroupRepo
from app.schemas.industry_group import (
    IndustryGroupDetail,
    IndustryGroupListResponse,
    IndustryGroupRead,
    IndustryGroupUpdate,
)

router = APIRouter(
    prefix="/api/industry-groups",
    tags=["industry_groups"],
    dependencies=[Depends(require_non_basic)],
)


def _domains_list(entity) -> list[str]:
    return [ed.domain for ed in entity.entity_domains]


@router.get("", response_model=IndustryGroupListResponse)
async def list_industry_groups(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    repo = IndustryGroupRepo(db)
    filters = []
    order_by = None
    normalized_search = normalize_search_term(search)
    if normalized_search:
        strict = strict_multi_word_filter([IndustryGroup.name], normalized_search)
        if strict is not None:
            high_conf = fuzzy_text_match(IndustryGroup.name, normalized_search, threshold=0.45)
            filters.append(or_(strict, high_conf))
        else:
            filters.append(fuzzy_text_match(IndustryGroup.name, normalized_search))
        order_by = [relevance_score(IndustryGroup.name, normalized_search).desc(), IndustryGroup.name.asc()]
    total = await repo.count(filters)
    offset = (page - 1) * page_size
    items = await repo.list_paginated(filters, offset, page_size, order_by=order_by)
    total_pages = (total + page_size - 1) // page_size if total else 0
    return IndustryGroupListResponse(
        items=[
            IndustryGroupRead(id=ig.id, name=ig.name, domains=_domains_list(ig), vertical=ig.vertical)
            for ig in items
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{id}")
async def get_industry_group(id: int, db: AsyncSession = Depends(get_db)):
    repo = IndustryGroupRepo(db)
    item = await repo.get_by_id(id, load_detail=True)
    if not item:
        raise HTTPException(404, "Industry Group not found")
    return IndustryGroupDetail(
        id=item.id,
        name=item.name,
        domains=_domains_list(item),
        vertical=item.vertical,
        companies=[
            {"id": c.id, "name": c.name, "domains": _domains_list(c)}
            for c in item.companies
        ],
        events=item.events,
    )


@router.patch("/{id}", response_model=IndustryGroupRead)
async def update_industry_group(
    id: int, data: IndustryGroupUpdate, db: AsyncSession = Depends(get_db)
):
    repo = IndustryGroupRepo(db)
    ed_repo = EntityDomainRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "Industry Group not found")
    update_data = data.model_dump(exclude_unset=True)
    domains = update_data.pop("domains", None)
    if update_data:
        await repo.update(item, update_data)
    if domains is not None:
        await ed_repo.delete_for_industry_group(item.id)
        for domain in domains:
            await ed_repo.create(domain=domain, industry_group_id=item.id)
    await repo.commit()
    await repo.refresh(item)
    return IndustryGroupRead(id=item.id, name=item.name, domains=[ed.domain for ed in item.entity_domains], vertical=item.vertical)


@router.delete("/{id}", status_code=204)
async def delete_industry_group(id: int, db: AsyncSession = Depends(get_db)):
    repo = IndustryGroupRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "Industry Group not found")
    await repo.delete(item)
    await repo.commit()
