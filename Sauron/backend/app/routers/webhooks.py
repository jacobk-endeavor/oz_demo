"""Webhook endpoints for third-party services (e.g. Apollo phone enrichment)."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.contact_phone_utils import (
    normalize_contact_phone_entries,
    primary_phone_number,
    serialize_phone_model,
)
from app.dependencies import get_db
from app.models.lead import ApolloPhoneCache, LeadContact, LeadContactPhone

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _log(msg: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[apollo-webhook {ts}] {msg}", flush=True)


@router.post("/apollo")
async def apollo_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Receive async phone/email enrichment results from Apollo.

    Handles both native (reveal_phone_number) and waterfall webhook payloads.
    Both formats deliver people[].phone_numbers[] keyed by Apollo person ID.
    """
    payload: dict[str, Any] = await request.json()

    status = payload.get("status", "unknown")
    request_id = payload.get("request_id")
    credits = payload.get("credits_consumed")
    target_fields = payload.get("target_fields")

    _log(
        f"Received: status={status} request_id={request_id} "
        f"credits_consumed={credits} target_fields={target_fields}"
    )

    waterfall_top = payload.get("waterfall") or {}
    if waterfall_top:
        _log(f"Waterfall status: {waterfall_top.get('status')} — {waterfall_top.get('message')}")

    people = payload.get("people") or []
    if not people:
        _log(f"WARNING: No people array in payload (request_id={request_id}). Keys: {list(payload.keys())}")
        return {"status": "ok", "updated": 0}

    _log(f"Processing {len(people)} people")

    updated = 0
    cached = 0
    for i, person in enumerate(people):
        apollo_id = person.get("id")
        if not apollo_id:
            _log(f"  Person [{i}]: no id, skipping")
            continue

        phone_numbers = person.get("phone_numbers") or []
        emails = person.get("emails") or []
        person_waterfall = person.get("waterfall") or {}
        person_status = person.get("status", "n/a")

        _log(
            f"  Person [{i}] apollo_id={apollo_id} status={person_status} "
            f"phone_numbers={len(phone_numbers)} emails={len(emails)} "
            f"has_waterfall={bool(person_waterfall)}"
        )

        if person_waterfall:
            for vendor_group in person_waterfall.get("phone_numbers") or []:
                for v in vendor_group.get("vendors") or []:
                    _log(
                        f"    Waterfall phone vendor: {v.get('name')} "
                        f"status={v.get('status')} numbers={v.get('phone_numbers')}"
                    )
            for vendor_group in person_waterfall.get("emails") or []:
                for v in vendor_group.get("vendors") or []:
                    _log(
                        f"    Waterfall email vendor: {v.get('name')} "
                        f"status={v.get('status')} emails={v.get('emails')}"
                    )

        for j, pn in enumerate(phone_numbers):
            _log(
                f"    Phone [{j}]: raw={pn.get('raw_number')} "
                f"sanitized={pn.get('sanitized_number')} status={pn.get('status_cd')} "
                f"type={pn.get('type_cd')} confidence={pn.get('confidence_cd')}"
            )

        incoming_phone_entries = normalize_contact_phone_entries(phone_numbers)
        if not incoming_phone_entries:
            _log(f"    No phone numbers for apollo_id={apollo_id}, skipping")
            continue

        _log(f"    Primary phone selected: {primary_phone_number(incoming_phone_entries)}")

        result = await db.execute(
            select(LeadContact)
            .options(selectinload(LeadContact.phone_numbers))
            .where(LeadContact.apollo_person_id == apollo_id)
        )
        contacts = result.scalars().all()

        if not contacts:
            _log(f"    No LeadContact yet for apollo_person_id={apollo_id} — caching for later")
            await db.execute(
                delete(ApolloPhoneCache).where(
                    ApolloPhoneCache.apollo_person_id == apollo_id
                )
            )
            db.add(
                ApolloPhoneCache(
                    apollo_person_id=apollo_id,
                    phone_numbers=incoming_phone_entries,
                )
            )
            cached += 1
            continue

        _log(f"    Found {len(contacts)} LeadContact(s) matching apollo_id={apollo_id}")

        for contact in contacts:
            merged_phone_entries = normalize_contact_phone_entries(
                [serialize_phone_model(phone) for phone in contact.phone_numbers]
                + incoming_phone_entries
            )
            contact.phone = primary_phone_number(merged_phone_entries)
            await db.execute(
                delete(LeadContactPhone).where(LeadContactPhone.contact_id == contact.id)
            )
            for entry in merged_phone_entries:
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
            updated += 1
            _log(
                f"    Updated LeadContact id={contact.id} "
                f"(lead_id={contact.lead_id}, {contact.first_name} {contact.last_name}) "
                f"with {len(merged_phone_entries)} phone(s)"
            )

    if updated or cached:
        await db.commit()
        _log(f"Committed: {updated} contacts updated, {cached} phones cached for later")
    else:
        _log("No contacts needed updating and nothing to cache")

    _log(
        f"Complete: {len(people)} people processed, "
        f"{updated} contacts updated, {cached} cached (request_id={request_id})"
    )
    return {"status": "ok", "updated": updated, "cached": cached}
