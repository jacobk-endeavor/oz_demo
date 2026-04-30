from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.dependencies import get_current_user, get_db, require_non_basic
from app.models.email_read_status import EmailReadStatus
from app.models.enums import ActionCategory, EmailDirection, UserRole
from app.models.lead import Lead, LeadAction, LeadContact
from app.models.lead_email import LeadEmail
from app.models.user import User
from app.routers._helpers import restricts_to_assigned_leads
from app.schemas.lead_email import LeadEmailRead, LeadEmailSendRequest
from app.services.email_sync import EmailSyncService
from app.services.gmail_client import GmailClientService, GmailNotConnectedError

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/leads/{lead_id}/emails",
    tags=["lead-emails"],
    dependencies=[Depends(require_non_basic)],
)

_PRIVILEGED_ROLES = (UserRole.ADMIN, UserRole.EXEC, UserRole.BDR, UserRole.AE)


async def _get_lead_or_403(lead_id: int, user: User, db: AsyncSession) -> Lead:
    lead = (await db.execute(select(Lead).where(Lead.id == lead_id))).scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead not found")
    if restricts_to_assigned_leads(user) and lead.user_id != user.id:
        raise HTTPException(403, "Access denied")
    return lead


def _resolve_recipient(body: LeadEmailSendRequest, contact: LeadContact | None) -> str:
    """Return the resolved to-address and validate inputs."""
    if contact:
        if not contact.email:
            raise HTTPException(400, "This contact has no email address")
        return contact.email
    if body.to:
        addr = body.to.strip()
        if "@" not in addr:
            raise HTTPException(400, "Invalid email address")
        return addr
    raise HTTPException(400, "Provide either contact_id or to")


async def _mark_read_for_user(db: AsyncSession, lead_email_id: int, user_id: int) -> None:
    """Insert a read-status row for the user (no-op if already exists)."""
    stmt = pg_insert(EmailReadStatus).values(
        lead_email_id=lead_email_id,
        user_id=user_id,
    ).on_conflict_do_nothing(constraint="uq_email_read_status_email_user")
    await db.execute(stmt)


@router.post("/send", response_model=LeadEmailRead, status_code=201)
async def send_email(
    lead_id: int,
    body: LeadEmailSendRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in _PRIVILEGED_ROLES:
        raise HTTPException(403, "Insufficient permissions")

    lead = await _get_lead_or_403(lead_id, current_user, db)

    contact: LeadContact | None = None
    if body.contact_id is not None:
        contact = (
            await db.execute(
                select(LeadContact)
                .where(LeadContact.id == body.contact_id, LeadContact.lead_id == lead.id)
            )
        ).scalar_one_or_none()
        if not contact:
            raise HTTPException(404, "Contact not found for this lead")

    to_email = _resolve_recipient(body, contact)

    if body.thread_id:
        existing = (
            await db.execute(
                select(LeadEmail).where(
                    LeadEmail.gmail_thread_id == body.thread_id,
                    LeadEmail.lead_id == lead.id,
                    LeadEmail.sent_by_user_id == current_user.id,
                ).limit(1)
            )
        ).scalar_one_or_none()
        if not existing:
            raise HTTPException(
                400,
                "Thread is not available in your Gmail account for this lead.",
            )

    gmail = GmailClientService(db)
    try:
        result = await gmail.send_message(
            user_id=current_user.id,
            to=to_email,
            subject=body.subject,
            body=body.body,
            thread_id=body.thread_id,
            in_reply_to_message_id=body.in_reply_to_message_id,
        )
    except GmailNotConnectedError:
        raise HTTPException(
            409,
            "Your Gmail session has expired or been revoked. Please reconnect your Gmail account.",
        )
    except Exception:
        logger.exception("Failed to send email to %s for lead %d", to_email, lead_id)
        raise HTTPException(502, "Failed to send email via Gmail")

    try:
        _, account_email, _ = await gmail.get_status(current_user.id)
    except Exception:
        account_email = None

    recipient_label = (
        " ".join(p for p in [contact.first_name, contact.last_name] if p)
        if contact else to_email
    )
    action = LeadAction(
        lead_id=lead.id,
        user_id=current_user.id,
        contact_id=contact.id if contact else None,
        category=ActionCategory.EMAIL,
        title=f"Email sent to {recipient_label}: {body.subject}",
        notes=body.body,
    )
    db.add(action)
    await db.flush()

    lead_email = LeadEmail(
        lead_id=lead.id,
        contact_id=contact.id if contact else None,
        lead_action_id=action.id,
        sent_by_user_id=current_user.id,
        gmail_message_id=result.message_id,
        gmail_thread_id=result.thread_id,
        direction=EmailDirection.SENT,
        from_email=account_email or "unknown",
        to_email=to_email,
        subject=body.subject,
        body_plain=body.body,
    )
    db.add(lead_email)
    await db.flush()

    # Mark as read for the sender
    await _mark_read_for_user(db, lead_email.id, current_user.id)

    await db.commit()
    await db.refresh(lead_email)

    result_data = LeadEmailRead.model_validate(lead_email)
    result_data.is_read = True
    return result_data


@router.get("", response_model=list[LeadEmailRead])
async def list_emails(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_lead_or_403(lead_id, current_user, db)
    rows = (
        await db.execute(
            select(LeadEmail).where(LeadEmail.lead_id == lead_id).order_by(LeadEmail.occurred_at.desc())
        )
    ).scalars().all()

    # Fetch which emails the current user has read
    email_ids = [e.id for e in rows]
    read_ids: set[int] = set()
    if email_ids:
        read_result = await db.execute(
            select(EmailReadStatus.lead_email_id).where(
                EmailReadStatus.lead_email_id.in_(email_ids),
                EmailReadStatus.user_id == current_user.id,
            )
        )
        read_ids = set(read_result.scalars().all())

    items = []
    for e in rows:
        item = LeadEmailRead.model_validate(e)
        item.is_read = e.id in read_ids
        items.append(item)
    return items


@router.patch("/{email_id}/read", response_model=LeadEmailRead)
async def mark_email_read(
    lead_id: int,
    email_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_lead_or_403(lead_id, current_user, db)
    email = (
        await db.execute(select(LeadEmail).where(LeadEmail.id == email_id, LeadEmail.lead_id == lead_id))
    ).scalar_one_or_none()
    if not email:
        raise HTTPException(404, "Email not found")

    await _mark_read_for_user(db, email.id, current_user.id)
    await db.commit()
    await db.refresh(email)

    result = LeadEmailRead.model_validate(email)
    result.is_read = True
    return result


@router.post("/mark-all-read", status_code=200)
async def mark_all_emails_read(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all received emails for this lead as read for the current user."""
    await _get_lead_or_403(lead_id, current_user, db)
    # Find received emails the user hasn't read yet
    read_subq = (
        select(EmailReadStatus.lead_email_id)
        .where(EmailReadStatus.user_id == current_user.id)
    )
    unread_rows = (
        await db.execute(
            select(LeadEmail.id).where(
                LeadEmail.lead_id == lead_id,
                LeadEmail.direction == EmailDirection.RECEIVED,
                ~LeadEmail.id.in_(read_subq),
            )
        )
    ).scalars().all()
    for email_id in unread_rows:
        await _mark_read_for_user(db, email_id, current_user.id)
    if unread_rows:
        await db.commit()
    return {"marked": len(unread_rows)}


@router.post("/sync", status_code=200)
async def sync_lead_emails(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """On-demand sync: check Gmail for replies in threads we initiated."""
    lead = await _get_lead_or_403(lead_id, current_user, db)
    count = await EmailSyncService(db).sync_for_lead(
        lead.id,
        sender_user_id=current_user.id,
    )
    return {"synced": count}
