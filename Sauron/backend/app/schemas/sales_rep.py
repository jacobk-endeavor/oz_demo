from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas._pagination import PaginatedResponse


class SalesRepCreate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    hubspot_owner_id: str | None = None


class SalesRepUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None


class SalesRepRead(BaseModel):
    id: int
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    hubspot_owner_id: str | None = None

    model_config = {"from_attributes": True}


class SalesRepCardRead(SalesRepRead):
    meetings_per_day: float = 0.0
    meeting_time_pct: float = 0.0
    total_pipeline: float = 0.0
    customers_past_week: int = 0
    customers_past_two_weeks: int = 0


SalesRepListResponse = PaginatedResponse[SalesRepRead]


class SalesRepCardListResponse(BaseModel):
    items: list[SalesRepCardRead]
    total: int


class SalesRepCalendarCreate(BaseModel):
    label: str
    calendar_url: str


class SalesRepCalendarUpdate(BaseModel):
    label: str | None = None
    calendar_url: str | None = None


class SalesRepCalendarRead(BaseModel):
    id: int
    sales_rep_id: int
    label: str
    calendar_url: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SalesRepDetail(SalesRepRead):
    calendars: list[SalesRepCalendarRead] = []


class SalesRepCompanyRead(BaseModel):
    id: int
    name: str
    meeting_count: int
    deal_stage: str | None = None
    key_contact_name: str | None = None
    first_meeting_at: datetime | None = None

    model_config = {"from_attributes": True}


class SalesRepCompanyListResponse(BaseModel):
    items: list[SalesRepCompanyRead]
