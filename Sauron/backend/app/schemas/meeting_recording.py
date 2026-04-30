from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas._pagination import PaginatedResponse


class MeetingRecordingRead(BaseModel):
    id: int
    engagement_id: str
    title: str
    summary: str | None = None
    start_at: datetime | None = None
    meeting_id: int | None = None
    is_linked_to_meeting: bool = False
    linked_meeting_title: str | None = None
    linked_meeting_company_names: list[str] = []
    linked_meeting_person_names: list[str] = []
    linked_meeting_sales_rep_names: list[str] = []
    company_names: list[str] = []
    matched_sales_rep_names: list[str] = []
    company_count: int = 0
    person_count: int = 0
    sales_rep_count: int = 0

    model_config = {"from_attributes": True}


MeetingRecordingListResponse = PaginatedResponse[MeetingRecordingRead]


class MeetingRecordingSalesRepCandidate(BaseModel):
    id: int
    display_name: str
    email: str | None


class CompanyRef(BaseModel):
    id: int
    name: str
    domain: str | None = None

    model_config = {"from_attributes": True}


class PersonRef(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str

    model_config = {"from_attributes": True}


class SalesRepRef(BaseModel):
    id: int
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None

    model_config = {"from_attributes": True}


class MeetingRecordingDetail(BaseModel):
    id: int
    engagement_id: str
    title: str
    summary: str | None = None
    transcript: str
    start_at: datetime | None = None
    meeting_id: int | None = None
    is_linked_to_meeting: bool = False
    linked_meeting_title: str | None = None
    linked_meeting_company_names: list[str] = []
    linked_meeting_person_names: list[str] = []
    linked_meeting_sales_rep_names: list[str] = []
    companies: list[CompanyRef] = []
    people: list[PersonRef] = []
    sales_reps: list[SalesRepRef] = []

    model_config = {"from_attributes": True}


class MeetingRecordingMediaUrl(BaseModel):
    media_url: str | None = None
