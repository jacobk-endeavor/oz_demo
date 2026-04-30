from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import String, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, load_only, noload, selectinload

from app.dependencies import get_current_user, get_db, require_non_basic
from app.lead_profile_taxonomy import normalize_lead_company_type, normalize_lead_industry
from app.models.email_read_status import EmailReadStatus
from app.models.enums import EmailDirection, UserRole
from app.models.lead import Lead, LeadCompanyProfile, LeadContact
from app.models.lead_email import LeadEmail
from app.models.user import User
from app.routers._helpers import (
    parse_int_csv,
    parse_str_csv,
    restricts_to_assigned_leads,
)
from app.routers._timezones import normalize_timezone, expand_timezone_labels, sort_timezone_labels
from app.schemas.lead import LeadAssign, LeadListResponse, LeadRead
from app.services.lead_chat import stream_lead_chat
from app.services.lead_enrich import (
    enrich_lead_company_background,
    enrich_lead_contacts,
    enrich_lead_profile,
    enrich_lead_strategic_context,
)

router = APIRouter(
    prefix="/api/leads",
    tags=["leads"],
    dependencies=[Depends(require_non_basic)],
)


@router.get("/filter-options")
async def lead_filter_options(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return distinct values for ERP, industry, and tier, plus BDR assignees."""
    erp_rows = (
        await db.execute(
            select(LeadCompanyProfile.erp)
            .where(LeadCompanyProfile.erp.is_not(None))
            .distinct()
            .order_by(LeadCompanyProfile.erp)
        )
    ).scalars().all()

    industry_rows = (
        await db.execute(
            select(LeadCompanyProfile.primary_industry)
            .where(LeadCompanyProfile.primary_industry.is_not(None))
            .distinct()
            .order_by(LeadCompanyProfile.primary_industry)
        )
    ).scalars().all()

    company_type_rows = (
        await db.execute(
            select(LeadCompanyProfile.company_type)
            .where(LeadCompanyProfile.company_type.is_not(None))
            .distinct()
            .order_by(LeadCompanyProfile.company_type)
        )
    ).scalars().all()

    tier_rows = (
        await db.execute(
            select(LeadCompanyProfile.type)
            .where(LeadCompanyProfile.type.is_not(None))
            .distinct()
            .order_by(LeadCompanyProfile.type)
        )
    ).scalars().all()

    timezone_rows = (
        await db.execute(
            select(LeadCompanyProfile.hq_timezone)
            .where(
                LeadCompanyProfile.hq_timezone.is_not(None),
                LeadCompanyProfile.hq_timezone != "",
            )
            .distinct()
            .order_by(LeadCompanyProfile.hq_timezone)
        )
    ).scalars().all()

    assignee_query = (
        select(
            User.id,
            User.email,
            User.first_name,
            User.last_name,
            User.color,
            func.count(Lead.id).label("lead_count"),
        )
        .outerjoin(Lead, Lead.user_id == User.id)
        .where(User.role == UserRole.BDR)
        .group_by(User.id)
        .order_by(User.first_name.asc(), User.last_name.asc())
    )
    assignee_rows = (await db.execute(assignee_query)).all()

    return {
        "erps": [str(e.value) if hasattr(e, "value") else str(e) for e in erp_rows],
        "industries": [str(i.value) if hasattr(i, "value") else str(i) for i in industry_rows],
        "company_types": [str(t.value) if hasattr(t, "value") else str(t) for t in company_type_rows],
        "tiers": [str(t.value) if hasattr(t, "value") else str(t) for t in tier_rows],
        "timezones": sort_timezone_labels(set(normalize_timezone(str(tz)) for tz in timezone_rows)),
        "assignees": [
            {
                "id": r.id,
                "email": r.email,
                "first_name": r.first_name,
                "last_name": r.last_name,
                "color": r.color,
                "lead_count": r.lead_count,
            }
            for r in assignee_rows
        ],
    }


@router.get("", response_model=LeadListResponse)
async def list_leads(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    user_ids: str | None = Query(None),
    erps: str | None = Query(None),
    industries: str | None = Query(None),
    company_types: str | None = Query(None),
    tiers: str | None = Query(None),
    timezones: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Lead).options(
        noload(Lead.contacts),
        noload(Lead.strategic_context),
    ).outerjoin(LeadCompanyProfile)

    if restricts_to_assigned_leads(current_user):
        query = query.where(Lead.user_id == current_user.id)
    else:
        parsed_user_ids = parse_int_csv(user_ids)
        if parsed_user_ids:
            query = query.where(Lead.user_id.in_(parsed_user_ids))

    parsed_erps = parse_str_csv(erps)
    if parsed_erps:
        query = query.where(LeadCompanyProfile.erp.in_(parsed_erps))

    parsed_industries = [
        industry
        for industry in (normalize_lead_industry(raw) for raw in parse_str_csv(industries))
        if industry is not None
    ]
    if parsed_industries:
        query = query.where(LeadCompanyProfile.primary_industry.in_(parsed_industries))

    parsed_company_types = [
        company_type
        for company_type in (
            normalize_lead_company_type(raw) for raw in parse_str_csv(company_types)
        )
        if company_type is not None
    ]
    if parsed_company_types:
        query = query.where(LeadCompanyProfile.company_type.in_(parsed_company_types))

    parsed_tiers = parse_str_csv(tiers)
    if parsed_tiers:
        query = query.where(LeadCompanyProfile.type.in_(parsed_tiers))

    parsed_timezones = parse_str_csv(timezones)
    if parsed_timezones:
        exact, prefixes = expand_timezone_labels(parsed_timezones)
        conditions = []
        if exact:
            conditions.append(LeadCompanyProfile.hq_timezone.in_(exact))
        for pfx in prefixes:
            conditions.append(LeadCompanyProfile.hq_timezone.like(f"{pfx}%"))
        if conditions:
            query = query.where(or_(*conditions))

    if search:
        term = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(Lead.company).like(term),
                func.lower(func.coalesce(Lead.domain, "")).like(term),
                func.lower(func.coalesce(LeadCompanyProfile.primary_industry.cast(String), "")).like(term),
                func.lower(func.coalesce(LeadCompanyProfile.company_type.cast(String), "")).like(term),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    total_pages = (total + page_size - 1) // page_size if total else 0
    offset = (page - 1) * page_size

    rows = (
        await db.execute(
            query.order_by(Lead.company.asc()).offset(offset).limit(page_size)
        )
    ).scalars().all()

    lead_ids = [r.id for r in rows]
    unread_ids: set[int] = set()
    if lead_ids:
        read_exists = exists(
            select(EmailReadStatus.id).where(
                EmailReadStatus.lead_email_id == LeadEmail.id,
                EmailReadStatus.user_id == current_user.id,
            )
        )
        unread_result = await db.execute(
            select(LeadEmail.lead_id)
            .where(
                LeadEmail.lead_id.in_(lead_ids),
                LeadEmail.direction == EmailDirection.RECEIVED,
                ~read_exists,
            )
            .distinct()
        )
        unread_ids = set(unread_result.scalars().all())

    items = []
    for r in rows:
        r.has_unread_email = r.id in unread_ids
        items.append(LeadRead.model_validate(r))

    return LeadListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


async def _get_lead_or_404(
    lead_id: int, current_user: User, db: AsyncSession,
) -> Lead:
    stmt = (
        select(Lead)
        .where(Lead.id == lead_id)
        .options(
            joinedload(Lead.user).load_only(
                User.id,
                User.email,
                User.first_name,
                User.last_name,
                User.color,
            ),
            joinedload(Lead.profile),
            joinedload(Lead.strategic_context),
            selectinload(Lead.contacts).selectinload(LeadContact.experiences),
            selectinload(Lead.contacts).selectinload(LeadContact.phone_numbers),
        )
    )
    result = await db.execute(stmt)
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead not found")
    if restricts_to_assigned_leads(current_user) and lead.user_id != current_user.id:
        raise HTTPException(403, "Access denied")
    return lead


_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.get("/{lead_id}", response_model=LeadRead)
async def get_lead(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await _get_lead_or_404(lead_id, current_user, db)
    return LeadRead.model_validate(lead)


@router.patch("/{lead_id}", response_model=LeadRead)
async def assign_lead(
    lead_id: int,
    body: LeadAssign,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.ADMIN, UserRole.EXEC):
        raise HTTPException(403, "Only admins and execs can reassign leads")

    lead = await _get_lead_or_404(lead_id, current_user, db)

    if body.user_id is not None:
        user_result = await db.execute(select(User).where(User.id == body.user_id))
        if not user_result.scalar_one_or_none():
            raise HTTPException(404, "User not found")

    lead.user_id = body.user_id
    await db.commit()
    await db.refresh(lead)
    return LeadRead.model_validate(lead)


# ---------------------------------------------------------------------------
# Enrichment
# ---------------------------------------------------------------------------


@router.post("/{lead_id}/enrich-contacts")
async def enrich_contacts(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await _get_lead_or_404(lead_id, current_user, db)
    return StreamingResponse(
        enrich_lead_contacts(lead=lead, db=db),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/{lead_id}/enrich-strategic-context")
async def enrich_strategic_context(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await _get_lead_or_404(lead_id, current_user, db)
    return StreamingResponse(
        enrich_lead_strategic_context(lead=lead, db=db),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/{lead_id}/enrich-company-background")
async def enrich_company_background(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await _get_lead_or_404(lead_id, current_user, db)
    return StreamingResponse(
        enrich_lead_company_background(lead=lead, db=db),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/{lead_id}/enrich-profile")
async def enrich_profile(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await _get_lead_or_404(lead_id, current_user, db)
    return StreamingResponse(
        enrich_lead_profile(lead=lead, db=db),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


class LeadChatMessage(BaseModel):
    role: str
    content: str


class LeadChatRequest(BaseModel):
    messages: list[LeadChatMessage]


@router.post("/{lead_id}/chat")
async def lead_chat(
    lead_id: int,
    body: LeadChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await _get_lead_or_404(lead_id, current_user, db)

    lead_read = LeadRead.model_validate(lead)
    lead_data = lead_read.model_dump()
    lead_data["company_summary"] = lead.profile.company_summary if lead.profile else None

    return StreamingResponse(
        stream_lead_chat(
            lead_data=lead_data,
            messages=[m.model_dump() for m in body.messages],
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
