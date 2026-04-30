from pydantic import BaseModel

from app.models.enums import Role


class PositionBase(BaseModel):
    title: str
    role: Role | None = None
    person_id: int
    company_id: int | None = None
    pe_group_id: int | None = None
    industry_group_id: int | None = None


class PositionCreate(PositionBase):
    pass


class PositionUpdate(BaseModel):
    title: str | None = None
    role: Role | None = None
    person_id: int | None = None
    company_id: int | None = None
    pe_group_id: int | None = None
    industry_group_id: int | None = None


class PositionRead(PositionBase):
    id: int

    model_config = {"from_attributes": True}
