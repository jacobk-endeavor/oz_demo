from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db, require_non_basic
from app.models.enums import UserRole
from app.models.lead import Lead, LeadAction
from app.models.lead_email import LeadEmail
from app.models.user import User
from app.routers._helpers import restricts_to_assigned_leads
from app.schemas.lead_action import LeadActionCreate, LeadActionRead, LeadActionUpdate

router = APIRouter(
    prefix="/api/leads/{lead_id}/actions",
    tags=["lead-actions"],
    dependencies=[Depends(require_non_basic)],
)


async def _get_lead_or_403(
    lead_id: int, current_user: User, db: AsyncSession,
) -> Lead:
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead not found")
    if restricts_to_assigned_leads(current_user) and lead.user_id != current_user.id:
        raise HTTPException(403, "Access denied")
    return lead


async def _gmail_action_ids(action_ids: list[int], db: AsyncSession) -> set[int]:
    if not action_ids:
        return set()
    rows = (
        await db.execute(
            select(LeadEmail.lead_action_id)
            .where(
                LeadEmail.lead_action_id.in_(action_ids),
            )
        )
    ).scalars().all()
    return {action_id for action_id in rows if action_id is not None}


async def _is_gmail_action(action_id: int, db: AsyncSession) -> bool:
    gmail_email_id = (
        await db.execute(
            select(LeadEmail.id)
            .where(
                LeadEmail.lead_action_id == action_id,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return gmail_email_id is not None


@router.get("", response_model=list[LeadActionRead])
async def list_actions(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_lead_or_403(lead_id, current_user, db)
    result = await db.execute(
        select(LeadAction)
        .where(LeadAction.lead_id == lead_id)
        .order_by(LeadAction.occurred_at.desc())
    )
    actions = result.scalars().all()
    locked_ids = await _gmail_action_ids([a.id for a in actions], db)
    for action in actions:
        action.is_gmail_email = action.id in locked_ids
    return [LeadActionRead.model_validate(a) for a in actions]


@router.post("", response_model=LeadActionRead, status_code=201)
async def create_action(
    lead_id: int,
    body: LeadActionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_lead_or_403(lead_id, current_user, db)
    action = LeadAction(
        lead_id=lead_id,
        user_id=current_user.id,
        category=body.category,
        title=body.title,
        notes=body.notes,
        contact_id=body.contact_id,
        call_duration_seconds=body.call_duration_seconds,
        call_transcript=body.call_transcript,
        dialed_phone_number=body.dialed_phone_number,
        dialed_phone_type=body.dialed_phone_type,
        **({"occurred_at": body.occurred_at} if body.occurred_at else {}),
    )
    db.add(action)
    await db.commit()
    await db.refresh(action)
    return LeadActionRead.model_validate(action)


@router.patch("/{action_id}", response_model=LeadActionRead)
async def update_action(
    lead_id: int,
    action_id: int,
    body: LeadActionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_lead_or_403(lead_id, current_user, db)
    result = await db.execute(
        select(LeadAction).where(LeadAction.id == action_id, LeadAction.lead_id == lead_id)
    )
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(404, "Action not found")
    if action.user_id != current_user.id:
        raise HTTPException(403, "Only the author can edit this action")
    if await _is_gmail_action(action.id, db):
        raise HTTPException(400, "Gmail email actions cannot be edited")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(action, field, value)
    await db.commit()
    await db.refresh(action)
    return LeadActionRead.model_validate(action)


@router.delete("/{action_id}", status_code=204)
async def delete_action(
    lead_id: int,
    action_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_lead_or_403(lead_id, current_user, db)
    result = await db.execute(
        select(LeadAction).where(LeadAction.id == action_id, LeadAction.lead_id == lead_id)
    )
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(404, "Action not found")
    if action.user_id != current_user.id and current_user.role not in (UserRole.ADMIN, UserRole.EXEC):
        raise HTTPException(403, "Only the author or an admin can delete this action")
    if await _is_gmail_action(action.id, db):
        raise HTTPException(400, "Gmail email actions cannot be deleted")

    await db.delete(action)
    await db.commit()
