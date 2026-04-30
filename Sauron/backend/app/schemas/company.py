from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, field_validator

from app.schemas._pagination import PaginatedResponse

from app.models.enums import ERP, Competitor, EmailDirection, Vertical


class CompanyBase(BaseModel):
    name: str
    domains: list[str]
    summary: str | None = None
    key_facts: dict | None = None
    vertical: Vertical | None = None
    revenue: str | None = None
    annual_revenue: int | None = None
    employee_count: int | None = None
    location_count: int | None = None
    linkedin: str | None = None
    erp: ERP | None = None
    competitor: Competitor | None = None
    is_named_account: bool = False
    parent_company_id: int | None = None


class CompanyCreate(CompanyBase):
    @field_validator("domains")
    @classmethod
    def domains_not_empty(cls, v: list[str]) -> list[str]:
        if len(v) < 1:
            raise ValueError("At least one domain is required")
        return v


class CompanyUpdate(BaseModel):
    name: str | None = None
    domains: list[str] | None = None
    summary: str | None = None
    key_facts: dict | None = None
    vertical: Vertical | None = None
    revenue: str | None = None
    annual_revenue: int | None = None
    employee_count: int | None = None
    location_count: int | None = None
    linkedin: str | None = None
    erp: ERP | None = None
    competitor: Competitor | None = None
    is_named_account: bool | None = None
    parent_company_id: int | None = None


class CompanyRead(CompanyBase):
    id: int

    model_config = {"from_attributes": True}


class CompanyRef(BaseModel):
    id: int
    name: str
    domains: list[str] = []

    model_config = {"from_attributes": True}


class IndustryGroupRef(BaseModel):
    id: int
    name: str
    domains: list[str] = []
    vertical: Vertical | None = None

    model_config = {"from_attributes": True}


class PositionNested(BaseModel):
    id: int
    title: str
    role: str | None = None
    person_id: int
    person_first_name: str
    person_last_name: str
    meeting_count: int = 0

    model_config = {"from_attributes": True}


class MeetingSalesRepNested(BaseModel):
    id: int
    display_name: str

    model_config = {"from_attributes": True}


class MeetingNested(BaseModel):
    id: int
    title: str
    start_at: datetime | None = None
    duration_minutes: int | None = None
    location: str | None = None
    sales_reps: list[MeetingSalesRepNested] = []

    model_config = {"from_attributes": True}


CompanyListResponse = PaginatedResponse[CompanyRead]


class CompanyCorrespondenceUser(BaseModel):
    id: int
    email: str
    display_name: str


class CompanyCorrespondenceOwner(BaseModel):
    hubspot_owner_id: str | None = None
    sales_rep_id: int | None = None
    user_id: int | None = None
    display_name: str | None = None
    email: str | None = None


class CompanyCorrespondenceItem(BaseModel):
    id: int
    hubspot_email_id: str
    direction: EmailDirection
    hubspot_direction: str | None = None
    hubspot_status: str | None = None
    subject: str
    body_preview: str | None = None
    from_email: str | None = None
    to_emails: list[str] = []
    cc_emails: list[str] = []
    bcc_emails: list[str] = []
    participant_emails: list[str] = []
    occurred_at: datetime
    hubspot_url: str | None = None
    owner: CompanyCorrespondenceOwner | None = None
    users: list[CompanyCorrespondenceUser] = []


CompanyCorrespondenceResponse = PaginatedResponse[CompanyCorrespondenceItem]


class CompanyDetail(CompanyRead):
    parent_company: CompanyRef | None = None
    subsidiaries: list[CompanyRef] = []
    industry_groups: list[IndustryGroupRef] = []
    positions: list[PositionNested] = []
    meetings: list[MeetingNested] = []
