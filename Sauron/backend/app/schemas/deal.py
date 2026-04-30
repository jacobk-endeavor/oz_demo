from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas._pagination import PaginatedResponse


class DealSalesRepRead(BaseModel):
    id: int
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None

    model_config = {"from_attributes": True}


class DealRead(BaseModel):
    id: int
    name: str
    domains: list[str] = []
    deal_stage: str | None = None
    sales_reps: list[DealSalesRepRead] = []
    last_contact_at: datetime | None = None
    last_contact_type: str | None = None
    next_meeting_start_at: datetime | None = None
    next_meeting_title: str | None = None
    next_meeting_duration_minutes: int | None = None
    key_contact_name: str | None = None
    key_contact_description: str | None = None
    products_of_interest: list[str] = []
    other_products_detail: str | None = None
    erp_system: str | None = None
    actively_migrating_erp: bool = False
    next_step: str | None = None
    main_concerns: list[str] = []
    main_selling_points: list[str] = []

    model_config = {"from_attributes": True}


DealListResponse = PaginatedResponse[DealRead]
