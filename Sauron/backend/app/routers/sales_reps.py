from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.company_pipeline import company_resolved_stage_expr
from app.dependencies import get_db, get_current_user, require_admin, require_non_basic
from app.fuzzy_search import (
    fuzzy_text_match,
    normalize_search_term,
    relevance_score,
    strict_multi_word_filter,
)
from app.models.associations import meeting_company, meeting_sales_rep
from app.models.company import Company
from app.models.entity_domain import EntityDomain
from app.models.deal import Deal
from app.models.enums import UserRole
from app.models.meeting import Meeting
from app.models.sales_rep import SalesRep
from app.models.user import User
from app.repositories.sales_rep_repo import SalesRepRepo
from app.repositories.sales_rep_calendar_repo import SalesRepCalendarRepo
from app.routers._helpers import get_ae_sales_rep
from app.schemas.sales_rep import (
    SalesRepCalendarCreate,
    SalesRepCalendarRead,
    SalesRepCalendarUpdate,
    SalesRepCardListResponse,
    SalesRepCardRead,
    SalesRepCompanyListResponse,
    SalesRepCompanyRead,
    SalesRepDetail,
    SalesRepListResponse,
    SalesRepRead,
    SalesRepUpdate,
)

router = APIRouter(
    prefix="/api/sales-reps", tags=["sales-reps"], dependencies=[Depends(require_non_basic)]
)

INTERNAL_DOMAINS = {"endeavorai.com", "pickworthgtm.com"}
MAX_COMPANIES_PER_MEETING = 5


# ---------------------------------------------------------------------------
# Sales Rep CRUD
# ---------------------------------------------------------------------------


@router.get("", response_model=SalesRepListResponse)
async def list_sales_reps(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    has_deals: bool = Query(False),
    user_email_match_only: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = SalesRepRepo(db)
    filters = []
    order_by = None
    ae_sales_rep = await get_ae_sales_rep(current_user, db)
    if current_user.role == UserRole.AE:
        if not ae_sales_rep:
            return SalesRepListResponse(items=[], total=0, page=page, page_size=page_size, total_pages=0)
        filters.append(SalesRep.id == ae_sales_rep.id)
    normalized_search = normalize_search_term(search)
    if normalized_search:
        cols = [SalesRep.first_name, SalesRep.last_name, SalesRep.email]
        strict = strict_multi_word_filter(cols, normalized_search)
        if strict is not None:
            high_conf = or_(*(fuzzy_text_match(c, normalized_search, threshold=0.45) for c in cols))
            filters.append(or_(strict, high_conf))
        else:
            filters.append(or_(*(fuzzy_text_match(c, normalized_search) for c in cols)))

        full_name = func.concat(
            func.coalesce(SalesRep.first_name, ""), " ", func.coalesce(SalesRep.last_name, "")
        )
        order_by = [
            relevance_score(full_name, normalized_search).desc(),
            SalesRep.last_name.asc(),
            SalesRep.first_name.asc(),
        ]
    if has_deals:
        filters.append(SalesRep.deals.any())
    if user_email_match_only:
        filters.append(
            func.lower(func.coalesce(SalesRep.email, "")) != "",
        )
        filters.append(
            exists(
                select(User.id).where(
                    func.lower(User.email) == func.lower(SalesRep.email),
                )
            ),
        )
    total = await repo.count(filters)
    offset = (page - 1) * page_size
    items = await repo.list_paginated(filters, offset, page_size, order_by=order_by)
    total_pages = (total + page_size - 1) // page_size if total else 0
    return SalesRepListResponse(items=items, total=total, page=page, page_size=page_size, total_pages=total_pages)


def _weekdays_in_range(start: date, end: date) -> int:
    count = 0
    d = start
    while d < end:
        if d.weekday() < 5:
            count += 1
        d += timedelta(days=1)
    return count or 1


@router.get("/cards", response_model=SalesRepCardListResponse)
async def list_sales_rep_cards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ae_sales_rep = await get_ae_sales_rep(current_user, db)
    if current_user.role == UserRole.AE and not ae_sales_rep:
        return SalesRepCardListResponse(items=[], total=0)

    today = date.today()
    thirty_days_ago = today - timedelta(days=30)
    week_ago = today - timedelta(days=7)
    two_weeks_ago = today - timedelta(days=14)
    weekdays = _weekdays_in_range(thirty_days_ago, today)
    available_minutes = weekdays * 8 * 60

    pipeline_sub = (
        select(
            Deal.sales_rep_id,
            func.coalesce(func.sum(Deal.amount), 0).label("total_pipeline"),
        )
        .group_by(Deal.sales_rep_id)
        .subquery()
    )

    internal_company_ids = (
        select(EntityDomain.company_id)
        .where(EntityDomain.domain.in_(INTERNAL_DOMAINS), EntityDomain.company_id.isnot(None))
    )

    noisy_meeting_ids = (
        select(meeting_company.c.meeting_id)
        .group_by(meeting_company.c.meeting_id)
        .having(func.count(meeting_company.c.company_id) > MAX_COMPANIES_PER_MEETING)
    )

    customer_meeting_ids = (
        select(meeting_company.c.meeting_id)
        .where(
            meeting_company.c.company_id.notin_(internal_company_ids),
            meeting_company.c.meeting_id.notin_(noisy_meeting_ids),
        )
    )

    cap = 120
    capped_duration = func.least(
        func.coalesce(Meeting.duration_minutes, 0), cap
    )

    meeting_sub = (
        select(
            meeting_sales_rep.c.sales_rep_id,
            func.coalesce(func.sum(capped_duration), 0).label("mtg_minutes"),
        )
        .join(Meeting, Meeting.id == meeting_sales_rep.c.meeting_id)
        .where(Meeting.start_at >= thirty_days_ago)
        .group_by(meeting_sales_rep.c.sales_rep_id)
        .subquery()
    )

    customer_meeting_sub = (
        select(
            meeting_sales_rep.c.sales_rep_id,
            func.count(func.distinct(Meeting.id)).label("customer_mtg_count"),
        )
        .join(Meeting, Meeting.id == meeting_sales_rep.c.meeting_id)
        .where(
            Meeting.start_at >= thirty_days_ago,
            Meeting.id.in_(customer_meeting_ids),
        )
        .group_by(meeting_sales_rep.c.sales_rep_id)
        .subquery()
    )

    customers_week_sub = (
        select(
            meeting_sales_rep.c.sales_rep_id,
            func.count(func.distinct(meeting_company.c.company_id)).label("customers_past_week"),
        )
        .join(Meeting, Meeting.id == meeting_sales_rep.c.meeting_id)
        .join(meeting_company, meeting_company.c.meeting_id == Meeting.id)
        .where(
            Meeting.start_at >= week_ago,
            meeting_company.c.company_id.notin_(internal_company_ids),
            Meeting.id.notin_(noisy_meeting_ids),
        )
        .group_by(meeting_sales_rep.c.sales_rep_id)
        .subquery()
    )

    customers_two_weeks_sub = (
        select(
            meeting_sales_rep.c.sales_rep_id,
            func.count(func.distinct(meeting_company.c.company_id)).label("customers_past_two_weeks"),
        )
        .join(Meeting, Meeting.id == meeting_sales_rep.c.meeting_id)
        .join(meeting_company, meeting_company.c.meeting_id == Meeting.id)
        .where(
            Meeting.start_at >= two_weeks_ago,
            meeting_company.c.company_id.notin_(internal_company_ids),
            Meeting.id.notin_(noisy_meeting_ids),
        )
        .group_by(meeting_sales_rep.c.sales_rep_id)
        .subquery()
    )

    stmt = (
        select(
            SalesRep,
            func.coalesce(pipeline_sub.c.total_pipeline, 0).label("total_pipeline"),
            func.coalesce(meeting_sub.c.mtg_minutes, 0).label("mtg_minutes"),
            func.coalesce(customer_meeting_sub.c.customer_mtg_count, 0).label("customer_mtg_count"),
            func.coalesce(customers_week_sub.c.customers_past_week, 0).label("customers_past_week"),
            func.coalesce(customers_two_weeks_sub.c.customers_past_two_weeks, 0).label("customers_past_two_weeks"),
        )
        .outerjoin(pipeline_sub, SalesRep.id == pipeline_sub.c.sales_rep_id)
        .outerjoin(meeting_sub, SalesRep.id == meeting_sub.c.sales_rep_id)
        .outerjoin(customer_meeting_sub, SalesRep.id == customer_meeting_sub.c.sales_rep_id)
        .outerjoin(customers_week_sub, SalesRep.id == customers_week_sub.c.sales_rep_id)
        .outerjoin(customers_two_weeks_sub, SalesRep.id == customers_two_weeks_sub.c.sales_rep_id)
        .order_by(SalesRep.last_name, SalesRep.first_name)
    )
    if current_user.role == UserRole.AE and ae_sales_rep:
        stmt = stmt.where(SalesRep.id == ae_sales_rep.id)
    result = await db.execute(stmt)
    rows = result.all()

    items = [
        SalesRepCardRead(
            id=rep.id,
            first_name=rep.first_name,
            last_name=rep.last_name,
            email=rep.email,
            hubspot_owner_id=rep.hubspot_owner_id,
            meetings_per_day=round(customer_mtg_count / weekdays, 1),
            meeting_time_pct=round(float(mtg_minutes) / available_minutes * 100, 1)
            if available_minutes
            else 0.0,
            total_pipeline=float(total_pipeline),
            customers_past_week=int(customers_past_week),
            customers_past_two_weeks=int(customers_past_two_weeks),
        )
        for rep, total_pipeline, mtg_minutes, customer_mtg_count, customers_past_week, customers_past_two_weeks in rows
    ]
    return SalesRepCardListResponse(items=items, total=len(items))


@router.get("/{id}", response_model=SalesRepDetail)
async def get_sales_rep(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ae_sales_rep = await get_ae_sales_rep(current_user, db)
    if current_user.role == UserRole.AE and (not ae_sales_rep or ae_sales_rep.id != id):
        raise HTTPException(403, "AEs can only view their own sales rep profile")

    repo = SalesRepRepo(db)
    sales_rep = await repo.get_by_id(id, load_calendars=True)
    if not sales_rep:
        raise HTTPException(404, "Sales rep not found")
    return SalesRepDetail(
        id=sales_rep.id,
        first_name=sales_rep.first_name,
        last_name=sales_rep.last_name,
        email=sales_rep.email,
        hubspot_owner_id=sales_rep.hubspot_owner_id,
        calendars=[
            SalesRepCalendarRead(
                id=cal.id,
                sales_rep_id=cal.sales_rep_id,
                label=cal.label,
                calendar_url=cal.calendar_url,
                created_at=cal.created_at,
                updated_at=cal.updated_at,
            )
            for cal in sales_rep.calendars
        ],
    )


@router.get("/{id}/companies", response_model=SalesRepCompanyListResponse)
async def list_sales_rep_companies(
    id: int,
    weeks: int = Query(1, ge=1, le=52),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ae_sales_rep = await get_ae_sales_rep(current_user, db)
    if current_user.role == UserRole.AE and (not ae_sales_rep or ae_sales_rep.id != id):
        raise HTTPException(403, "AEs can only view their own sales rep companies")

    repo = SalesRepRepo(db)
    sales_rep = await repo.get_by_id(id)
    if not sales_rep:
        raise HTTPException(404, "Sales rep not found")

    cutoff = date.today() - timedelta(weeks=weeks)

    excluded_company_ids = (
        select(EntityDomain.company_id)
        .where(EntityDomain.domain.in_(INTERNAL_DOMAINS), EntityDomain.company_id.isnot(None))
    )

    resolved_stage_expr = company_resolved_stage_expr()

    noisy_meeting_ids = (
        select(meeting_company.c.meeting_id)
        .group_by(meeting_company.c.meeting_id)
        .having(func.count(meeting_company.c.company_id) > MAX_COMPANIES_PER_MEETING)
    )

    first_meeting_sub = (
        select(func.min(Meeting.start_at))
        .join(meeting_company, meeting_company.c.meeting_id == Meeting.id)
        .where(meeting_company.c.company_id == Company.id)
        .correlate(Company)
        .scalar_subquery()
        .label("first_meeting_at")
    )

    stmt = (
        select(
            Company.id,
            Company.name,
            Company.key_facts,
            resolved_stage_expr.label("deal_stage"),
            func.count(Meeting.id).label("meeting_count"),
            first_meeting_sub,
        )
        .join(meeting_sales_rep, meeting_sales_rep.c.meeting_id == Meeting.id)
        .join(meeting_company, meeting_company.c.meeting_id == Meeting.id)
        .join(Company, Company.id == meeting_company.c.company_id)
        .where(
            meeting_sales_rep.c.sales_rep_id == id,
            Meeting.start_at >= cutoff,
            Meeting.start_at <= datetime.now(timezone.utc),
            Company.id.notin_(excluded_company_ids),
            Meeting.id.notin_(noisy_meeting_ids),
        )
        .group_by(Company.id, Company.name, Company.key_facts)
        .order_by(func.count(Meeting.id).desc(), Company.name.asc())
    )
    result = await db.execute(stmt)
    items = [
        SalesRepCompanyRead(
            id=row.id,
            name=row.name,
            meeting_count=row.meeting_count,
            deal_stage=row.deal_stage,
            key_contact_name=(row.key_facts or {}).get("key_contact_name"),
            first_meeting_at=row.first_meeting_at,
        )
        for row in result.all()
    ]
    return SalesRepCompanyListResponse(items=items)


@router.patch("/{id}", response_model=SalesRepRead)
async def update_sales_rep(
    id: int,
    data: SalesRepUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == UserRole.AE:
        raise HTTPException(403, "AEs cannot modify sales rep profiles")

    repo = SalesRepRepo(db)
    sales_rep = await repo.get_by_id(id)
    if not sales_rep:
        raise HTTPException(404, "Sales rep not found")
    await repo.update(sales_rep, data.model_dump(exclude_unset=True))
    await repo.commit()
    await repo.refresh(sales_rep)
    return sales_rep


@router.delete("/{id}", status_code=204)
async def delete_sales_rep(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == UserRole.AE:
        raise HTTPException(403, "AEs cannot delete sales rep profiles")

    repo = SalesRepRepo(db)
    sales_rep = await repo.get_by_id(id)
    if not sales_rep:
        raise HTTPException(404, "Sales rep not found")
    await repo.delete(sales_rep)
    await repo.commit()


# ---------------------------------------------------------------------------
# Calendar sub-resource
# ---------------------------------------------------------------------------


@router.post(
    "/{id}/calendars",
    response_model=SalesRepCalendarRead,
    status_code=201,
    dependencies=[Depends(require_admin)],
)
async def create_calendar(id: int, data: SalesRepCalendarCreate, db: AsyncSession = Depends(get_db)):
    rep_repo = SalesRepRepo(db)
    sales_rep = await rep_repo.get_by_id(id)
    if not sales_rep:
        raise HTTPException(404, "Sales rep not found")

    cal_repo = SalesRepCalendarRepo(db)
    cal = await cal_repo.create(
        sales_rep_id=id,
        label=data.label,
        calendar_url=data.calendar_url,
    )
    await cal_repo.commit()
    await cal_repo.refresh(cal)
    return cal


@router.patch(
    "/{id}/calendars/{cal_id}",
    response_model=SalesRepCalendarRead,
    dependencies=[Depends(require_admin)],
)
async def update_calendar(
    id: int, cal_id: int, data: SalesRepCalendarUpdate, db: AsyncSession = Depends(get_db)
):
    cal_repo = SalesRepCalendarRepo(db)
    cal = await cal_repo.get_by_id(cal_id)
    if not cal or cal.sales_rep_id != id:
        raise HTTPException(404, "Calendar not found")

    update_data: dict = {}
    if data.label is not None:
        update_data["label"] = data.label
    if data.calendar_url is not None:
        update_data["calendar_url"] = data.calendar_url

    if update_data:
        await cal_repo.update(cal, update_data)
        await cal_repo.commit()
        await cal_repo.refresh(cal)

    return cal


@router.delete("/{id}/calendars/{cal_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_calendar(id: int, cal_id: int, db: AsyncSession = Depends(get_db)):
    cal_repo = SalesRepCalendarRepo(db)
    cal = await cal_repo.get_by_id(cal_id)
    if not cal or cal.sales_rep_id != id:
        raise HTTPException(404, "Calendar not found")
    await cal_repo.delete(cal)
    await cal_repo.commit()
