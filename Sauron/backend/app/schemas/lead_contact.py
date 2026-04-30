from __future__ import annotations

from pydantic import BaseModel


class ContactSummaryUpdate(BaseModel):
    role_description: str | None = None
    relevance: str | None = None
    personal_background: str | None = None


class ContactExperienceUpdate(BaseModel):
    company: str
    title: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class LeadContactPhoneUpdate(BaseModel):
    number: str
    type: str | None = None
    is_primary: bool = False


class LeadContactUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    phone_numbers: list[LeadContactPhoneUpdate] | None = None
    title: str | None = None
    linkedin_url: str | None = None
    facebook_url: str | None = None
    instagram_url: str | None = None
    photo_url: str | None = None
    summary: ContactSummaryUpdate | None = None
    experiences: list[ContactExperienceUpdate] | None = None
