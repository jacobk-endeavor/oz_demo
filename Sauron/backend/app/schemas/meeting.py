from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas._pagination import PaginatedResponse


class MeetingSalesRepRead(BaseModel):
    id: int
    email: str | None
    display_name: str

    model_config = {"from_attributes": True}


class MeetingRead(BaseModel):
    id: int
    external_uid: str
    title: str
    start_at: datetime | None = None
    duration_minutes: int | None = None
    summary: str | None = None
    description: str | None = None
    meeting_url: str | None = None
    location: str | None = None
    cancelled_at: datetime | None = None
    sales_reps: list[MeetingSalesRepRead] = []
    meeting_recording_ids: list[int] = []
    company_names: list[str] = []
    person_names: list[str] = []
    company_count: int = 0
    person_count: int = 0

    model_config = {"from_attributes": True}


class MeetingCompanyRead(BaseModel):
    id: int
    name: str
    domains: list[str] = []

    model_config = {"from_attributes": True}


class MeetingPersonRead(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str

    model_config = {"from_attributes": True}


class MeetingRecordingNestedRead(BaseModel):
    id: int
    engagement_id: str
    title: str
    summary: str | None = None
    start_at: datetime | None = None

    model_config = {"from_attributes": True}


class MeetingDetailRead(MeetingRead):
    companies: list[MeetingCompanyRead] = []
    people: list[MeetingPersonRead] = []
    meeting_recordings: list[MeetingRecordingNestedRead] = []

    model_config = {"from_attributes": True}


MeetingListResponse = PaginatedResponse[MeetingRead]
