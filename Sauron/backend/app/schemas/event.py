from __future__ import annotations

from pydantic import BaseModel

from app.schemas._pagination import PaginatedResponse


class EventBase(BaseModel):
    name: str
    date: str | None = None
    address: str | None = None
    industry_group_id: int | None = None


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    name: str | None = None
    date: str | None = None
    address: str | None = None
    industry_group_id: int | None = None


class EventRead(EventBase):
    id: int

    model_config = {"from_attributes": True}


EventListResponse = PaginatedResponse[EventRead]


class IndustryGroupRef(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class CompanyVisitNested(BaseModel):
    id: int
    company_id: int
    company_name: str
    is_sponsor: bool

    model_config = {"from_attributes": True}


class PersonVisitNested(BaseModel):
    id: int
    person_id: int
    person_first_name: str
    person_last_name: str
    is_keynote_speaker: bool

    model_config = {"from_attributes": True}


class EventDetail(EventRead):
    industry_group: IndustryGroupRef | None = None
    company_visits: list[CompanyVisitNested] = []
    person_visits: list[PersonVisitNested] = []
