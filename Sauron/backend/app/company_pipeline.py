from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func, select

from app.models.associations import company_email_company, meeting_company
from app.models.company import Company
from app.models.company_email import CompanyEmail
from app.models.meeting import Meeting

PIPELINE_STAGES = (
    "Discovery Booked",
    "Post Discovery",
    "Demo Booked",
    "Post Demo",
    "ROI Scheduled",
    "Final Review",
    "Stagnated",
    "Dead",
    "Disqualified",
)

KEY_FACTS_PIPELINE_STAGES = tuple(stage for stage in PIPELINE_STAGES if stage != "Stagnated")
STAGE_RANK = {stage: idx for idx, stage in enumerate(PIPELINE_STAGES)}
STAGNATED_STAGE = "Stagnated"
DEAD_STAGE = "Dead"
DISQUALIFIED_STAGE = "Disqualified"
STAGNATED_AFTER_DAYS = 14
_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def company_base_stage_expr():
    return Company.key_facts["deal_stage"].astext


def company_last_activity_expr():
    last_meeting_at = (
        select(func.max(Meeting.start_at))
        .join(meeting_company, meeting_company.c.meeting_id == Meeting.id)
        .where(
            meeting_company.c.company_id == Company.id,
            Meeting.cancelled_at.is_(None),
        )
        .correlate(Company)
        .scalar_subquery()
    )
    last_email_at = (
        select(func.max(CompanyEmail.occurred_at))
        .join(
            company_email_company,
            company_email_company.c.company_email_id == CompanyEmail.id,
        )
        .where(company_email_company.c.company_id == Company.id)
        .correlate(Company)
        .scalar_subquery()
    )
    return func.greatest(
        func.coalesce(last_meeting_at, _EPOCH),
        func.coalesce(last_email_at, _EPOCH),
    )


def company_resolved_stage_expr(*, now: datetime | None = None):
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=STAGNATED_AFTER_DAYS)
    base_stage = company_base_stage_expr()
    last_activity_at = company_last_activity_expr()
    return case(
        (base_stage == DEAD_STAGE, DEAD_STAGE),
        (base_stage == DISQUALIFIED_STAGE, DISQUALIFIED_STAGE),
        (last_activity_at < cutoff, STAGNATED_STAGE),
        else_=base_stage,
    )


def company_stage_rank_expr(
    resolved_stage=None,
    *,
    now: datetime | None = None,
):
    if resolved_stage is None:
        resolved_stage = company_resolved_stage_expr(now=now)
    return case(
        *[(resolved_stage == stage, rank) for stage, rank in STAGE_RANK.items()],
        else_=len(STAGE_RANK),
    )
