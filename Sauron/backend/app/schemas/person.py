from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas._pagination import PaginatedResponse


class PersonBase(BaseModel):
    first_name: str
    last_name: str
    email: str
    title: str | None = None
    linkedin: str | None = None


class PersonCreate(PersonBase):
    pass


class PersonUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    title: str | None = None
    linkedin: str | None = None


class PersonRead(PersonBase):
    id: int

    model_config = {"from_attributes": True}


PersonListResponse = PaginatedResponse[PersonRead]


class PositionNested(BaseModel):
    id: int
    title: str
    role: str | None = None
    company_id: int | None = None
    company_name: str | None = None
    pe_group_id: int | None = None
    pe_group_name: str | None = None
    industry_group_id: int | None = None
    industry_group_name: str | None = None

    model_config = {"from_attributes": True}


class DonationNested(BaseModel):
    id: int
    committee: str
    amount: float
    timestamp: datetime

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
    sales_reps: list[MeetingSalesRepNested] = []

    model_config = {"from_attributes": True}


class PersonDetail(PersonRead):
    positions: list[PositionNested] = []
    donations: list[DonationNested] = []
    meetings: list[MeetingNested] = []
