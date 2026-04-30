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
from app.repositories.pe_group_repo import PEGroupRepo
from app.models.pe_group import PEGroup
from app.schemas.pe_group import PEGroupCreate, PEGroupDetail, PEGroupListResponse, PEGroupRead, PEGroupUpdate

router = APIRouter(
    prefix="/api/pe-groups", tags=["pe_groups"], dependencies=[Depends(require_non_basic)]
)


def _domains_list(entity) -> list[str]:
    return [ed.domain for ed in entity.entity_domains]


@router.get("", response_model=PEGroupListResponse)
async def list_pe_groups(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    repo = PEGroupRepo(db)
    filters = []
    order_by = None
    normalized_search = normalize_search_term(search)
    if normalized_search:
        strict = strict_multi_word_filter([PEGroup.name], normalized_search)
        if strict is not None:
            high_conf = fuzzy_text_match(PEGroup.name, normalized_search, threshold=0.45)
            filters.append(or_(strict, high_conf))
        else:
            filters.append(fuzzy_text_match(PEGroup.name, normalized_search))
        order_by = [relevance_score(PEGroup.name, normalized_search).desc(), PEGroup.name.asc()]
    total = await repo.count(filters)
    offset = (page - 1) * page_size
    items = await repo.list_paginated(filters, offset, page_size, order_by=order_by)
    total_pages = (total + page_size - 1) // page_size if total else 0
    return PEGroupListResponse(
        items=[
            PEGroupRead(id=p.id, name=p.name, domains=_domains_list(p), aum=p.aum)
            for p in items
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{id}")
async def get_pe_group(id: int, db: AsyncSession = Depends(get_db)):
    repo = PEGroupRepo(db)
    item = await repo.get_by_id(id, load_detail=True)
    if not item:
        raise HTTPException(404, "PE Group not found")
    return PEGroupDetail(
        id=item.id,
        name=item.name,
        domains=_domains_list(item),
        aum=item.aum,
        companies=[
            {"id": c.id, "name": c.name, "domains": _domains_list(c)}
            for c in item.companies
        ],
    )


@router.post("", response_model=PEGroupRead, status_code=201)
async def create_pe_group(data: PEGroupCreate, db: AsyncSession = Depends(get_db)):
    repo = PEGroupRepo(db)
    ed_repo = EntityDomainRepo(db)
    payload = data.model_dump(exclude={"domains"})
    item = await repo.create(**payload)
    for domain in data.domains:
        await ed_repo.create(domain=domain, pe_group_id=item.id)
    await repo.commit()
    await repo.refresh(item)
    return PEGroupRead(id=item.id, name=item.name, domains=[ed.domain for ed in item.entity_domains], aum=item.aum)


@router.patch("/{id}", response_model=PEGroupRead)
async def update_pe_group(id: int, data: PEGroupUpdate, db: AsyncSession = Depends(get_db)):
    repo = PEGroupRepo(db)
    ed_repo = EntityDomainRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "PE Group not found")
    update_data = data.model_dump(exclude_unset=True)
    domains = update_data.pop("domains", None)
    if update_data:
        await repo.update(item, update_data)
    if domains is not None:
        await ed_repo.delete_for_pe_group(item.id)
        for domain in domains:
            await ed_repo.create(domain=domain, pe_group_id=item.id)
    await repo.commit()
    await repo.refresh(item)
    return PEGroupRead(id=item.id, name=item.name, domains=[ed.domain for ed in item.entity_domains], aum=item.aum)


@router.delete("/{id}", status_code=204)
async def delete_pe_group(id: int, db: AsyncSession = Depends(get_db)):
    repo = PEGroupRepo(db)
    item = await repo.get_by_id(id)
    if not item:
        raise HTTPException(404, "PE Group not found")
    await repo.delete(item)
    await repo.commit()
