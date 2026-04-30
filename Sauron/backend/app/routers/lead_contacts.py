from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.contact_phone_utils import normalize_contact_phone_entries, primary_phone_number
from app.dependencies import get_current_user, get_db, require_non_basic
from app.models.lead import ContactExperience, Lead, LeadContact, LeadContactPhone
from app.models.user import User
from app.routers._helpers import restricts_to_assigned_leads
from app.schemas.lead import LeadContactRead
from app.schemas.lead_contact import LeadContactUpdate

router = APIRouter(
    prefix="/api/leads/{lead_id}/contacts",
    tags=["lead-contacts"],
    dependencies=[Depends(require_non_basic)],
)

_UNSET = object()


def _normalized_phone_entries(
    phone_numbers_data,
    legacy_phone,
):
    if phone_numbers_data is not _UNSET:
        raw_entries = phone_numbers_data
    elif legacy_phone is not _UNSET:
        raw_entries = (
            [{"number": legacy_phone, "type": "unknown", "is_primary": True}]
            if legacy_phone
            else []
        )
    else:
        return _UNSET

    return normalize_contact_phone_entries(raw_entries)


async def _get_lead_or_403(lead_id: int, user: User, db: AsyncSession) -> Lead:
    lead = (await db.execute(select(Lead).where(Lead.id == lead_id))).scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead not found")
    if restricts_to_assigned_leads(user) and lead.user_id != user.id:
        raise HTTPException(403, "Access denied")
    return lead


@router.patch("/{contact_id}", response_model=LeadContactRead)
async def update_contact(
    lead_id: int,
    contact_id: int,
    body: LeadContactUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_lead_or_403(lead_id, current_user, db)

    contact = (
        await db.execute(
            select(LeadContact).where(
                LeadContact.id == contact_id,
                LeadContact.lead_id == lead_id,
            )
        )
    ).scalar_one_or_none()
    if not contact:
        raise HTTPException(404, "Contact not found for this lead")

    update_data = body.model_dump(exclude_unset=True)
    summary_data = update_data.pop("summary", _UNSET)
    experiences_data = update_data.pop("experiences", _UNSET)
    phone_numbers_data = update_data.pop("phone_numbers", _UNSET)
    legacy_phone = update_data.pop("phone", _UNSET)

    if "first_name" in update_data:
        first_name = (update_data["first_name"] or "").strip()
        if not first_name:
            raise HTTPException(400, "First name is required")
        update_data["first_name"] = first_name

    for field, value in update_data.items():
        setattr(contact, field, value)

    if summary_data is not _UNSET:
        contact.summary = summary_data

    phone_entries = _normalized_phone_entries(phone_numbers_data, legacy_phone)
    if phone_entries is not _UNSET:
        contact.phone = primary_phone_number(phone_entries)
        await db.execute(
            delete(LeadContactPhone).where(LeadContactPhone.contact_id == contact.id)
        )
        await db.flush()
        for entry in phone_entries:
            db.add(
                LeadContactPhone(
                    contact_id=contact.id,
                    number=entry["number"],
                    type=entry["type"],
                    status=entry.get("status"),
                    confidence=entry.get("confidence"),
                    is_primary=entry["is_primary"],
                )
            )

    if experiences_data is not _UNSET:
        normalized_experiences = []
        for exp in experiences_data:
            company = (exp.get("company") or "").strip()
            if not company:
                raise HTTPException(400, "Experience company is required")
            normalized_experiences.append(
                {
                    "company": company,
                    "title": (exp.get("title") or "").strip() or None,
                    "start_date": (exp.get("start_date") or "").strip() or None,
                    "end_date": (exp.get("end_date") or "").strip() or None,
                }
            )

        await db.execute(
            delete(ContactExperience).where(ContactExperience.contact_id == contact.id)
        )
        await db.flush()
        for exp in normalized_experiences:
            db.add(
                ContactExperience(
                    contact_id=contact.id,
                    company=exp["company"],
                    title=exp["title"],
                    start_date=exp["start_date"],
                    end_date=exp["end_date"],
                )
            )

    await db.commit()

    updated_contact = (
        await db.execute(
            select(LeadContact)
            .options(
                selectinload(LeadContact.experiences),
                selectinload(LeadContact.phone_numbers),
            )
            .where(LeadContact.id == contact.id, LeadContact.lead_id == lead_id)
        )
    ).scalar_one()
    return LeadContactRead.model_validate(updated_contact)
