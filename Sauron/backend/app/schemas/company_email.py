from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.enums import EmailDirection
from app.schemas._pagination import PaginatedResponse


class CompanyEmailCompanyRead(BaseModel):
    id: int
    name: str


class CompanyEmailUserRead(BaseModel):
    id: int
    email: str
    display_name: str


class CompanyEmailFilterUserRead(BaseModel):
    id: int
    email: str
    display_name: str
    thread_count: int


class CompanyEmailFilterOptionsRead(BaseModel):
    users: list[CompanyEmailFilterUserRead] = []
    directions: list[str] = []


class CompanyEmailOwnerRead(BaseModel):
    hubspot_owner_id: str | None = None
    sales_rep_id: int | None = None
    user_id: int | None = None
    display_name: str | None = None
    email: str | None = None


class CompanyEmailMessageRead(BaseModel):
    id: int
    hubspot_email_id: str
    hubspot_thread_id: str | None = None
    hubspot_message_id: str | None = None
    hubspot_thread_summary: str | None = None
    hubspot_member_of_forwarded_subthread: bool | None = None
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
    companies: list[CompanyEmailCompanyRead] = []
    users: list[CompanyEmailUserRead] = []
    owner: CompanyEmailOwnerRead | None = None


class CompanyEmailThreadListItem(BaseModel):
    thread_key: str
    hubspot_thread_id: str | None = None
    hubspot_thread_summary: str | None = None
    message_count: int
    latest_message: CompanyEmailMessageRead
    companies: list[CompanyEmailCompanyRead] = []
    users: list[CompanyEmailUserRead] = []


class CompanyEmailThreadRead(BaseModel):
    thread_key: str
    hubspot_thread_id: str | None = None
    hubspot_thread_summary: str | None = None
    message_count: int
    latest_occurred_at: datetime
    companies: list[CompanyEmailCompanyRead] = []
    users: list[CompanyEmailUserRead] = []
    messages: list[CompanyEmailMessageRead] = []


CompanyEmailInboxResponse = PaginatedResponse[CompanyEmailThreadListItem]
