from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, model_validator

from app.models.enums import EmailDirection


class LeadEmailSendRequest(BaseModel):
    contact_id: int | None = None
    to: str | None = None
    subject: str
    body: str
    thread_id: str | None = None
    in_reply_to_message_id: str | None = None


class LeadEmailContactRead(BaseModel):
    id: int
    first_name: str
    last_name: str | None = None
    title: str | None = None

    model_config = {"from_attributes": True}


class LeadEmailRead(BaseModel):
    id: int
    lead_id: int
    contact_id: int | None = None
    contact: LeadEmailContactRead | None = None
    lead_action_id: int | None = None
    sent_by_user_id: int | None = None
    sent_by_user_name: str | None = None
    gmail_message_id: str
    gmail_thread_id: str | None = None
    direction: EmailDirection
    from_email: str
    to_email: str
    subject: str
    body_plain: str | None = None
    is_read: bool = False
    occurred_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _resolve(cls, data):
        if not hasattr(data, "__table__"):
            return data

        user = getattr(data, "sent_by_user", None)
        if user is not None:
            parts = [user.first_name, user.last_name]
            user_name = " ".join(p for p in parts if p) or user.email
        else:
            user_name = None

        out = {c.key: getattr(data, c.key) for c in data.__table__.columns}
        out["sent_by_user_name"] = user_name
        out["contact"] = getattr(data, "contact", None)
        return out
