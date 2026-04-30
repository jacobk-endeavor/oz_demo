from __future__ import annotations

from pydantic import BaseModel

from app.schemas._pagination import PaginatedResponse


class PEGroupBase(BaseModel):
    name: str
    domains: list[str] = []
    aum: str | None = None


class PEGroupCreate(PEGroupBase):
    pass


class PEGroupUpdate(BaseModel):
    name: str | None = None
    domains: list[str] | None = None
    aum: str | None = None


class PEGroupRead(PEGroupBase):
    id: int

    model_config = {"from_attributes": True}


PEGroupListResponse = PaginatedResponse[PEGroupRead]


class CompanyRef(BaseModel):
    id: int
    name: str
    domains: list[str] = []

    model_config = {"from_attributes": True}


class PEGroupDetail(PEGroupRead):
    companies: list[CompanyRef] = []
