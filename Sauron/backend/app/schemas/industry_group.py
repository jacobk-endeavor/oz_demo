from __future__ import annotations

from pydantic import BaseModel

from app.schemas._pagination import PaginatedResponse

from app.models.enums import Vertical


class IndustryGroupBase(BaseModel):
    name: str
    domains: list[str] = []
    vertical: Vertical | None = None


class IndustryGroupCreate(IndustryGroupBase):
    pass


class IndustryGroupUpdate(BaseModel):
    name: str | None = None
    domains: list[str] | None = None
    vertical: Vertical | None = None


class IndustryGroupRead(IndustryGroupBase):
    id: int

    model_config = {"from_attributes": True}


IndustryGroupListResponse = PaginatedResponse[IndustryGroupRead]


class CompanyRef(BaseModel):
    id: int
    name: str
    domains: list[str] = []

    model_config = {"from_attributes": True}


class EventRef(BaseModel):
    id: int
    name: str
    date: str | None = None

    model_config = {"from_attributes": True}


class IndustryGroupDetail(IndustryGroupRead):
    companies: list[CompanyRef] = []
    events: list[EventRef] = []
