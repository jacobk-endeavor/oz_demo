from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, model_validator

from app.schemas._pagination import PaginatedResponse

from app.models.enums import ERP, LeadCompanyType, LeadIndustry, LeadTier


class LeadUser(BaseModel):
    id: int
    email: str
    first_name: str | None = None
    last_name: str | None = None
    color: str | None = None

    model_config = {"from_attributes": True}


class ContactExperienceRead(BaseModel):
    id: int
    company: str
    title: str | None = None
    start_date: str | None = None
    end_date: str | None = None

    model_config = {"from_attributes": True}


class LeadContactPhoneRead(BaseModel):
    id: int
    number: str
    type: str
    is_primary: bool

    model_config = {"from_attributes": True}


class LeadContactRead(BaseModel):
    id: int
    first_name: str
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    phone_numbers: list[LeadContactPhoneRead] = []
    title: str | None = None
    linkedin_url: str | None = None
    facebook_url: str | None = None
    instagram_url: str | None = None
    photo_url: str | None = None
    summary: dict[str, Any] | None = None
    likely_kpis: dict[str, Any] | None = None
    experiences: list[ContactExperienceRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TriggerEventRead(BaseModel):
    category: str
    description: str
    source: str | None = None


class LeadStrategicContextRead(BaseModel):
    recent_initiatives: str | None = None
    recent_initiatives_sources: list[str] | None = None
    public_priorities: str | None = None
    public_priorities_sources: list[str] | None = None
    operational_changes: str | None = None
    operational_changes_sources: list[str] | None = None
    workflow_modernization_signals: str | None = None
    workflow_modernization_signals_sources: list[str] | None = None
    trigger_events: list[TriggerEventRead] | None = None
    company_background: str | None = None

    model_config = {"from_attributes": True}


_PROFILE_FIELDS = [
    "erp",
    "num_erp_users",
    "num_locations",
    "buying_groups",
    "associations",
    "primary_industry",
    "company_type",
    "revenue_m",
    "type",
    "company_summary",
    "hq_address",
    "hq_phone",
    "employee_count",
    "hq_timezone",
]

_CONTEXT_FIELDS = [
    "recent_initiatives",
    "recent_initiatives_sources",
    "public_priorities",
    "public_priorities_sources",
    "operational_changes",
    "operational_changes_sources",
    "workflow_modernization_signals",
    "workflow_modernization_signals_sources",
    "trigger_events",
    "company_background",
]


class LeadRead(BaseModel):
    id: int
    company: str
    domain: str | None = None
    erp: ERP | None = None
    num_erp_users: int | None = None
    num_locations: int | None = None
    buying_groups: list[str] | None = None
    associations: str | None = None
    primary_industry: LeadIndustry | None = None
    company_type: LeadCompanyType | None = None
    revenue_m: str | None = None
    type: LeadTier | None = None
    company_summary: dict[str, Any] | None = None
    hq_address: str | None = None
    hq_phone: str | None = None
    employee_count: int | None = None
    hq_timezone: str | None = None
    recent_initiatives: str | None = None
    recent_initiatives_sources: list[str] | None = None
    public_priorities: str | None = None
    public_priorities_sources: list[str] | None = None
    operational_changes: str | None = None
    operational_changes_sources: list[str] | None = None
    workflow_modernization_signals: str | None = None
    workflow_modernization_signals_sources: list[str] | None = None
    trigger_events: list[TriggerEventRead] | None = None
    company_background: str | None = None
    user_id: int | None = None
    user: LeadUser | None = None
    contacts: list[LeadContactRead] = []
    has_unread_email: bool = False

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _flatten(cls, data: Any) -> Any:
        """Pull profile and strategic_context fields up so the API shape stays flat."""
        if not hasattr(data, "profile"):
            return data

        out = {
            "id": data.id,
            "company": data.company,
            "domain": data.domain,
            "user_id": data.user_id,
            "user": data.user,
            "contacts": data.contacts,
            "has_unread_email": getattr(data, "has_unread_email", False),
        }
        if data.profile is not None:
            for f in _PROFILE_FIELDS:
                out[f] = getattr(data.profile, f, None)
        if data.strategic_context is not None:
            for f in _CONTEXT_FIELDS:
                out[f] = getattr(data.strategic_context, f, None)
        return out


LeadListResponse = PaginatedResponse[LeadRead]


class LeadAssign(BaseModel):
    user_id: int | None = None
