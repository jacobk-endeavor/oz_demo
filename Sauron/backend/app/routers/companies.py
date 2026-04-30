from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.dependencies import get_db, get_current_user, require_non_basic
from app.fuzzy_search import (
    fuzzy_text_match,
    fuzzy_text_score,
    normalize_search_term,
    relevance_score,
)
from app.models.company import Company
from app.models.company_email import CompanyEmail
from app.models.entity_domain import EntityDomain
from app.models.sales_rep import SalesRep
from app.models.user import User
from app.models.associations import company_email_company
from app.repositories.company_repo import CompanyRepo
from app.repositories.entity_domain_repo import EntityDomainRepo
from app.repositories.meeting_recording_repo import MeetingRecordingRepo
from app.schemas.company import (
    CompanyCorrespondenceItem,
    CompanyCorrespondenceOwner,
    CompanyCorrespondenceResponse,
    CompanyCorrespondenceUser,
    CompanyCreate,
    CompanyDetail,
    CompanyListResponse,
    CompanyRead,
    CompanyUpdate,
)
from app.routers._helpers import display_name
from app.services.company_chat import stream_company_chat
from app.services.company_enrich import enrich_company as stream_company_enrich

router = APIRouter(
    prefix="/api/companies",
    tags=["companies"],
    dependencies=[Depends(require_non_basic)],
)

_EPOCH_MIN = datetime.min.replace(tzinfo=timezone.utc)
_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def _domains_list(entity) -> list[str]:
    return [ed.domain for ed in entity.entity_domains]


def _user_summary(user) -> CompanyCorrespondenceUser:
    return CompanyCorrespondenceUser(
        id=user.id,
        email=user.email,
        display_name=display_name(user),
    )


def _email_owner(email: CompanyEmail) -> CompanyCorrespondenceOwner | None:
    owner_user = email.owner_user
    owner_sales_rep = email.owner_sales_rep
    display = None
    email_address = None
    if owner_user is not None:
        display = display_name(owner_user)
        email_address = owner_user.email
    elif owner_sales_rep is not None:
        display = display_name(owner_sales_rep)
        email_address = owner_sales_rep.email

    if (
        not email.hubspot_owner_id
        and owner_sales_rep is None
        and owner_user is None
    ):
        return None

    return CompanyCorrespondenceOwner(
        hubspot_owner_id=email.hubspot_owner_id,
        sales_rep_id=owner_sales_rep.id if owner_sales_rep else None,
        user_id=owner_user.id if owner_user else None,
        display_name=display,
        email=email_address,
    )


def _serialize_company_correspondence_item(
    email: CompanyEmail,
) -> CompanyCorrespondenceItem:
    return CompanyCorrespondenceItem(
        id=email.id,
        hubspot_email_id=email.hubspot_email_id,
        direction=email.direction,
        hubspot_direction=email.hubspot_direction,
        hubspot_status=email.hubspot_status,
        subject=email.subject,
        body_preview=email.body_preview,
        from_email=email.from_email,
        to_emails=email.to_emails or [],
        cc_emails=email.cc_emails or [],
        bcc_emails=email.bcc_emails or [],
        participant_emails=email.participant_emails or [],
        occurred_at=email.occurred_at,
        hubspot_url=email.hubspot_url,
        owner=_email_owner(email),
        users=[
            _user_summary(user)
            for user in sorted(
                email.users,
                key=lambda user: (
                    (user.first_name or "").lower(),
                    (user.last_name or "").lower(),
                    (user.email or "").lower(),
                ),
            )
        ],
    )


async def _get_company_or_404(
    company_id: int,
    db: AsyncSession,
    *,
    load_detail: bool = False,
) -> Company:
    repo = CompanyRepo(db)
    company = await repo.get_by_id(company_id, load_detail=load_detail)
    if not company:
        raise HTTPException(404, "Company not found")
    return company


@router.get("", response_model=CompanyListResponse)
async def list_companies(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    repo = CompanyRepo(db)
    filters = []
    order_by = None
    normalized_search = normalize_search_term(search)
    if normalized_search:
        lowered_name = func.lower(func.coalesce(Company.name, ""))
        tokens = normalized_search.split()

        domain_fuzzy_match = exists(
            select(EntityDomain.id).where(
                EntityDomain.company_id == Company.id,
                fuzzy_text_match(EntityDomain.domain, normalized_search),
            )
        )

        if len(tokens) > 1:
            token_match_filters = []
            for token in tokens:
                pattern = f"%{token}%"
                domain_token_match = exists(
                    select(EntityDomain.id).where(
                        EntityDomain.company_id == Company.id,
                        func.lower(func.coalesce(EntityDomain.domain, "")).like(pattern),
                    )
                )
                token_match_filters.append(
                    or_(lowered_name.like(pattern), domain_token_match)
                )
            high_conf = or_(
                fuzzy_text_match(Company.name, normalized_search, threshold=0.45),
                exists(
                    select(EntityDomain.id).where(
                        EntityDomain.company_id == Company.id,
                        fuzzy_text_match(
                            EntityDomain.domain, normalized_search, threshold=0.45
                        ),
                    )
                ),
            )
            filters.append(or_(and_(*token_match_filters), high_conf))
        else:
            filters.append(
                or_(fuzzy_text_match(Company.name, normalized_search), domain_fuzzy_match)
            )

        domain_contains = exists(
            select(EntityDomain.id).where(
                EntityDomain.company_id == Company.id,
                func.lower(func.coalesce(EntityDomain.domain, "")).like(
                    f"%{normalized_search}%"
                ),
            )
        )
        domain_sim = (
            select(func.max(fuzzy_text_score(EntityDomain.domain, normalized_search)))
            .where(EntityDomain.company_id == Company.id)
            .scalar_subquery()
        )
        name_score = relevance_score(Company.name, normalized_search)
        total_score = (
            name_score
            + case((domain_contains, 1), else_=0) * 10
            + func.coalesce(domain_sim, 0.0) * 3
        )
        order_by = [total_score.desc(), Company.name.asc()]
    total = await repo.count(filters)
    offset = (page - 1) * page_size
    items = await repo.list_paginated(filters, offset, page_size, order_by=order_by)
    total_pages = (total + page_size - 1) // page_size if total else 0
    return CompanyListResponse(
        items=[
            CompanyRead(
                id=c.id,
                name=c.name,
                domains=_domains_list(c),
                summary=c.summary,
                key_facts=c.key_facts,
                vertical=c.vertical,
                revenue=c.revenue,
                annual_revenue=c.annual_revenue,
                employee_count=c.employee_count,
                location_count=c.location_count,
                linkedin=c.linkedin,
                erp=c.erp,
                competitor=c.competitor,
                is_named_account=c.is_named_account,
                parent_company_id=c.parent_company_id,
            )
            for c in items
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{id}")
async def get_company(id: int, db: AsyncSession = Depends(get_db)):
    repo = CompanyRepo(db)
    company = await _get_company_or_404(id, db, load_detail=True)

    person_ids = [p.person_id for p in company.positions if p.person_id]
    meeting_counts = await repo.get_meeting_counts_by_person(person_ids)

    return CompanyDetail(
        id=company.id,
        name=company.name,
        domains=_domains_list(company),
        summary=company.summary,
        key_facts=company.key_facts,
        vertical=company.vertical,
        revenue=company.revenue,
        annual_revenue=company.annual_revenue,
        employee_count=company.employee_count,
        location_count=company.location_count,
        linkedin=company.linkedin,
        erp=company.erp,
        competitor=company.competitor,
        is_named_account=company.is_named_account,
        parent_company_id=company.parent_company_id,
        parent_company=(
            {
                "id": company.parent_company.id,
                "name": company.parent_company.name,
                "domains": _domains_list(company.parent_company),
            }
            if company.parent_company
            else None
        ),
        subsidiaries=[
            {"id": s.id, "name": s.name, "domains": _domains_list(s)}
            for s in company.subsidiaries
        ],
        industry_groups=[
            {
                "id": ig.id,
                "name": ig.name,
                "domains": _domains_list(ig),
                "vertical": ig.vertical,
            }
            for ig in company.industry_groups
        ],
        positions=[
            {
                "id": p.id,
                "title": p.title,
                "role": p.role.value if p.role else None,
                "person_id": p.person_id,
                "person_first_name": p.person.first_name,
                "person_last_name": p.person.last_name,
                "meeting_count": meeting_counts.get(p.person_id, 0),
            }
            for p in company.positions
        ],
        meetings=[
            {
                "id": m.id,
                "title": m.title,
                "start_at": m.start_at,
                "duration_minutes": m.duration_minutes,
                "location": m.location,
                "sales_reps": [
                    {"id": sr.id, "display_name": display_name(sr)}
                    for sr in m.sales_reps
                ],
            }
            for m in sorted(
                company.meetings,
                key=lambda m: m.start_at or _EPOCH_MIN,
                reverse=True,
            )
        ],
    )


@router.get("/{id}/correspondence", response_model=CompanyCorrespondenceResponse)
async def get_company_correspondence(
    id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    await _get_company_or_404(id, db)

    total = (
        await db.execute(
            select(func.count(CompanyEmail.id))
            .join(
                company_email_company,
                company_email_company.c.company_email_id == CompanyEmail.id,
            )
            .where(company_email_company.c.company_id == id)
        )
    ).scalar() or 0

    offset = (page - 1) * page_size
    rows = (
        await db.execute(
            select(CompanyEmail)
            .join(
                company_email_company,
                company_email_company.c.company_email_id == CompanyEmail.id,
            )
            .where(company_email_company.c.company_id == id)
            .options(
                joinedload(CompanyEmail.owner_user),
                joinedload(CompanyEmail.owner_sales_rep),
                selectinload(CompanyEmail.users),
            )
            .order_by(CompanyEmail.occurred_at.desc(), CompanyEmail.id.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().unique().all()

    total_pages = (total + page_size - 1) // page_size if total else 0
    return CompanyCorrespondenceResponse(
        items=[_serialize_company_correspondence_item(email) for email in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=CompanyRead, status_code=201)
async def create_company(data: CompanyCreate, db: AsyncSession = Depends(get_db)):
    repo = CompanyRepo(db)
    ed_repo = EntityDomainRepo(db)
    payload = data.model_dump(exclude={"domains"})
    company = await repo.create(**payload)
    for domain in data.domains:
        await ed_repo.create(domain=domain, company_id=company.id)
    await repo.commit()
    await repo.refresh(company)
    return CompanyRead(
        id=company.id,
        name=company.name,
        domains=[ed.domain for ed in company.entity_domains],
        summary=company.summary,
        key_facts=company.key_facts,
        vertical=company.vertical,
        revenue=company.revenue,
        annual_revenue=company.annual_revenue,
        employee_count=company.employee_count,
        location_count=company.location_count,
        linkedin=company.linkedin,
        erp=company.erp,
        competitor=company.competitor,
        is_named_account=company.is_named_account,
        parent_company_id=company.parent_company_id,
    )


@router.patch("/{id}", response_model=CompanyRead)
async def update_company(
    id: int, data: CompanyUpdate, db: AsyncSession = Depends(get_db)
):
    repo = CompanyRepo(db)
    ed_repo = EntityDomainRepo(db)
    company = await _get_company_or_404(id, db)
    update_data = data.model_dump(exclude_unset=True)
    domains = update_data.pop("domains", None)
    if update_data:
        await repo.update(company, update_data)
    if domains is not None:
        await ed_repo.delete_for_company(company.id)
        for domain in domains:
            await ed_repo.create(domain=domain, company_id=company.id)
    await repo.commit()
    await repo.refresh(company)
    return CompanyRead(
        id=company.id,
        name=company.name,
        domains=[ed.domain for ed in company.entity_domains],
        summary=company.summary,
        key_facts=company.key_facts,
        vertical=company.vertical,
        revenue=company.revenue,
        annual_revenue=company.annual_revenue,
        employee_count=company.employee_count,
        location_count=company.location_count,
        linkedin=company.linkedin,
        erp=company.erp,
        competitor=company.competitor,
        is_named_account=company.is_named_account,
        parent_company_id=company.parent_company_id,
    )


@router.delete("/{id}", status_code=204)
async def delete_company(id: int, db: AsyncSession = Depends(get_db)):
    repo = CompanyRepo(db)
    company = await _get_company_or_404(id, db)
    await repo.delete(company)
    await repo.commit()


@router.post("/{id}/enrich-profile")
async def enrich_company(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    company = await _get_company_or_404(id, db, load_detail=True)
    return StreamingResponse(
        stream_company_enrich(company=company, db=db),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


class CompanyChatMessage(BaseModel):
    role: str
    content: str


class CompanyChatRequest(BaseModel):
    messages: list[CompanyChatMessage]


@router.post("/{id}/chat")
async def company_chat(
    id: int,
    body: CompanyChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    company = await _get_company_or_404(id, db)

    recording_repo = MeetingRecordingRepo(db)
    sources = await recording_repo.list_company_transcript_sources(id)

    if not sources:
        raise HTTPException(422, "No transcripts available for this company")

    parts: list[str] = []
    for src in sources:
        date_label = (
            src.call_date.strftime("%Y-%m-%d") if src.call_date else "Unknown date"
        )
        parts.append(
            f"--- MEETING: {src.meeting_title} ({date_label}) ---\n{src.transcript}"
        )
    transcripts_block = "\n\n".join(parts)

    return StreamingResponse(
        stream_company_chat(
            company_name=company.name,
            transcripts_block=transcripts_block,
            messages=[m.model_dump() for m in body.messages],
            company_id=id,
            db=db,
            user_role=(
                current_user.role.value
                if hasattr(current_user.role, "value")
                else str(current_user.role)
            ),
            user_email=current_user.email,
        ),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
