from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Text, cast, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.company_pipeline import (
    PIPELINE_STAGES,
    company_resolved_stage_expr,
    company_stage_rank_expr,
)
from app.dependencies import get_current_user, get_db, require_non_basic
from app.models.associations import company_email_company, meeting_company, meeting_sales_rep
from app.models.company import Company
from app.models.company_email import CompanyEmail
from app.models.deal import Deal
from app.models.entity_domain import EntityDomain
from app.models.enums import UserRole
from app.models.meeting import Meeting
from app.models.user import User
from app.routers._helpers import get_ae_sales_rep, parse_int_csv, parse_str_csv
from app.schemas.deal import DealListResponse, DealRead

router = APIRouter(
    prefix="/api/deals",
    tags=["deals"],
    dependencies=[Depends(require_non_basic)],
)

_PRODUCT_OPTIONS = (
    "Order Entry",
    "Quoting",
    "Price Optimization",
    "Accounts Payable",
    "Accounts Receivable",
    "Sales Analytics",
    "Other",
)
_INTERNAL_DOMAINS = {"endeavorai.com", "pickworthgtm.com"}


def _validate_csv_values(values: list[str], allowed: tuple[str, ...], label: str) -> list[str]:
    invalid = [value for value in values if value not in allowed]
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Invalid {label} filter(s): {', '.join(invalid)}. "
                f"Expected: {', '.join(allowed)}"
            ),
        )
    return values


@router.get("", response_model=DealListResponse)
async def list_deals(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    deal_stages: str | None = Query(None),
    products: str | None = Query(None),
    sales_rep_ids: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    stage_expr = company_resolved_stage_expr()
    domains_text = (
        select(func.string_agg(EntityDomain.domain, " "))
        .where(EntityDomain.company_id == Company.id)
        .correlate(Company)
        .scalar_subquery()
    )
    key_contact_expr = Company.key_facts["key_contact_name"].astext
    key_contact_desc_expr = Company.key_facts["key_contact_description"].astext
    next_step_expr = Company.key_facts["next_step"].astext
    erp_expr = Company.key_facts["erp_system"].astext
    products_expr = cast(Company.key_facts["products_of_interest"], Text)
    concerns_expr = cast(Company.key_facts["main_concerns"], Text)
    selling_points_expr = cast(Company.key_facts["main_selling_points"], Text)
    stage_rank = company_stage_rank_expr(stage_expr)
    latest_email_at_expr = (
        select(func.max(CompanyEmail.occurred_at))
        .select_from(
            company_email_company.join(
                CompanyEmail,
                company_email_company.c.company_email_id == CompanyEmail.id,
            )
        )
        .where(company_email_company.c.company_id == Company.id)
        .correlate(Company)
        .scalar_subquery()
    )

    filters.append(Company.key_facts.is_not(None))
    filters.append(
        ~exists(
            select(EntityDomain.id).where(
                EntityDomain.company_id == Company.id,
                EntityDomain.domain.in_(_INTERNAL_DOMAINS),
            )
        )
    )

    ae_sales_rep = await get_ae_sales_rep(current_user, db)
    if current_user.role == UserRole.AE:
        if not ae_sales_rep:
            return DealListResponse(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                total_pages=0,
            )
        filters.append(
            exists(
                select(meeting_company.c.company_id)
                .select_from(
                    meeting_company.join(
                        meeting_sales_rep,
                        meeting_sales_rep.c.meeting_id == meeting_company.c.meeting_id,
                    )
                )
                .where(
                    meeting_company.c.company_id == Company.id,
                    meeting_sales_rep.c.sales_rep_id == ae_sales_rep.id,
                )
            )
        )

    if search:
        term = f"%{search.strip().lower()}%"
        filters.append(
            or_(
                func.lower(Company.name).like(term),
                func.lower(func.coalesce(cast(domains_text, Text), "")).like(term),
                func.lower(func.coalesce(cast(key_contact_expr, Text), "")).like(term),
                func.lower(func.coalesce(cast(key_contact_desc_expr, Text), "")).like(term),
                func.lower(func.coalesce(cast(next_step_expr, Text), "")).like(term),
                func.lower(func.coalesce(cast(erp_expr, Text), "")).like(term),
                func.lower(func.coalesce(products_expr, "")).like(term),
                func.lower(func.coalesce(concerns_expr, "")).like(term),
                func.lower(func.coalesce(selling_points_expr, "")).like(term),
            )
        )

    stage_filters = _validate_csv_values(
        parse_str_csv(deal_stages), PIPELINE_STAGES, "stage"
    )
    if stage_filters:
        filters.append(stage_expr.in_(stage_filters))

    product_filters = _validate_csv_values(
        parse_str_csv(products), _PRODUCT_OPTIONS, "product"
    )
    if product_filters:
        filters.append(
            or_(
                *[
                    Company.key_facts.contains({"products_of_interest": [product]})
                    for product in product_filters
                ]
            )
        )

    sales_rep_filters = parse_int_csv(sales_rep_ids)
    if sales_rep_filters:
        filters.append(
            or_(
                exists(
                    select(Deal.id).where(
                        Deal.company_id == Company.id,
                        Deal.sales_rep_id.in_(sales_rep_filters),
                    )
                ),
                exists(
                    select(meeting_company.c.company_id)
                    .select_from(
                        meeting_company.join(
                            meeting_sales_rep,
                            meeting_sales_rep.c.meeting_id == meeting_company.c.meeting_id,
                        )
                    )
                    .where(
                        meeting_company.c.company_id == Company.id,
                        meeting_sales_rep.c.sales_rep_id.in_(sales_rep_filters),
                    )
                )
            )
        )

    total_stmt = select(func.count(Company.id)).select_from(Company)
    if filters:
        total_stmt = total_stmt.where(*filters)
    total = (await db.execute(total_stmt)).scalar_one()
    offset = (page - 1) * page_size
    stmt = (
        select(
            Company,
            stage_expr.label("resolved_stage"),
            latest_email_at_expr.label("latest_email_at"),
        )
        .options(
            selectinload(Company.entity_domains),
            selectinload(Company.deals).selectinload(Deal.sales_rep),
            selectinload(Company.meetings).selectinload(Meeting.sales_reps),
        )
        .offset(offset)
        .limit(page_size)
    )
    if filters:
        stmt = stmt.where(*filters)
    stmt = stmt.order_by(stage_rank.asc(), Company.name.asc())
    rows = (await db.execute(stmt)).all()
    items = []
    now = datetime.now(timezone.utc)
    for company, resolved_stage, latest_email_at in rows:
        key_facts = company.key_facts or {}
        sales_reps_by_id = {}
        for deal in company.deals:
            if not deal.sales_rep:
                continue
            sales_reps_by_id[deal.sales_rep.id] = {
                "id": deal.sales_rep.id,
                "first_name": deal.sales_rep.first_name,
                "last_name": deal.sales_rep.last_name,
                "email": deal.sales_rep.email,
            }
        for meeting in company.meetings:
            for sales_rep in meeting.sales_reps:
                sales_reps_by_id[sales_rep.id] = {
                    "id": sales_rep.id,
                    "first_name": sales_rep.first_name,
                    "last_name": sales_rep.last_name,
                    "email": sales_rep.email,
                }
        sales_reps = sorted(
            sales_reps_by_id.values(),
            key=lambda rep: (
                ((rep["first_name"] or "") + " " + (rep["last_name"] or "")).strip()
                or (rep["email"] or "")
            ).lower(),
        )
        past_meetings = [
            meeting
            for meeting in company.meetings
            if meeting.start_at and meeting.cancelled_at is None and meeting.start_at <= now
        ]
        future_meetings = [
            meeting
            for meeting in company.meetings
            if meeting.start_at and meeting.cancelled_at is None and meeting.start_at > now
        ]
        latest_meeting = max(past_meetings, key=lambda meeting: meeting.start_at) if past_meetings else None
        next_meeting = min(future_meetings, key=lambda meeting: meeting.start_at) if future_meetings else None
        if latest_email_at and (
            latest_meeting is None or latest_email_at >= latest_meeting.start_at
        ):
            last_contact_at = latest_email_at
            last_contact_type = "email"
        elif latest_meeting is not None:
            last_contact_at = latest_meeting.start_at
            last_contact_type = "meeting"
        else:
            last_contact_at = None
            last_contact_type = None
        items.append(
            DealRead(
                id=company.id,
                name=company.name,
                domains=[entity_domain.domain for entity_domain in company.entity_domains],
                deal_stage=resolved_stage,
                sales_reps=sales_reps,
                last_contact_at=last_contact_at,
                last_contact_type=last_contact_type,
                next_meeting_start_at=next_meeting.start_at if next_meeting else None,
                next_meeting_title=next_meeting.title if next_meeting else None,
                next_meeting_duration_minutes=next_meeting.duration_minutes if next_meeting else None,
                key_contact_name=key_facts.get("key_contact_name") or None,
                key_contact_description=key_facts.get("key_contact_description") or None,
                products_of_interest=key_facts.get("products_of_interest") or [],
                other_products_detail=key_facts.get("other_products_detail") or None,
                erp_system=key_facts.get("erp_system") or None,
                actively_migrating_erp=bool(key_facts.get("actively_migrating_erp")),
                next_step=key_facts.get("next_step") or None,
                main_concerns=key_facts.get("main_concerns") or [],
                main_selling_points=key_facts.get("main_selling_points") or [],
            )
        )
    total_pages = (total + page_size - 1) // page_size if total else 0
    return DealListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
