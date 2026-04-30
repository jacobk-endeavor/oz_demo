from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, model_validator

from app.models.enums import ActionCategory


class LeadActionCreate(BaseModel):
    category: ActionCategory
    title: str
    notes: str | None = None
    occurred_at: datetime | None = None
    contact_id: int | None = None
    call_duration_seconds: int | None = None
    call_transcript: str | None = None
    dialed_phone_number: str | None = None
    dialed_phone_type: str | None = None


class LeadActionUpdate(BaseModel):
    category: ActionCategory | None = None
    title: str | None = None
    notes: str | None = None
    occurred_at: datetime | None = None
    contact_id: int | None = None
    call_duration_seconds: int | None = None
    call_transcript: str | None = None
    dialed_phone_number: str | None = None
    dialed_phone_type: str | None = None


class LeadActionContactRead(BaseModel):
    id: int
    first_name: str
    last_name: str | None = None
    title: str | None = None

    model_config = {"from_attributes": True}


class LeadActionRead(BaseModel):
    id: int
    lead_id: int
    user_id: int
    user_name: str
    contact_id: int | None = None
    contact: LeadActionContactRead | None = None
    category: ActionCategory
    title: str
    notes: str | None = None
    call_duration_seconds: int | None = None
    call_transcript: str | None = None
    dialed_phone_number: str | None = None
    dialed_phone_type: str | None = None
    occurred_at: datetime
    created_at: datetime
    updated_at: datetime
    is_gmail_email: bool = False

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _resolve(cls, data):
        if hasattr(data, "user") and data.user is not None:
            parts = [data.user.first_name, data.user.last_name]
            name = " ".join(p for p in parts if p) or data.user.email
            out = {
                **{c.key: getattr(data, c.key) for c in data.__table__.columns},
                "user_name": name,
                "is_gmail_email": bool(getattr(data, "is_gmail_email", False)),
            }
            if data.contact is not None:
                out["contact"] = data.contact
            return out
        return data
