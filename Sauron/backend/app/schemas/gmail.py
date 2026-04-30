from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class GmailStatusResponse(BaseModel):
    connected: bool
    account_email: str | None = None
    requires_reauth: bool = False


class GmailAuthUrlResponse(BaseModel):
    auth_url: str


class GmailMessageRead(BaseModel):
    id: str
    thread_id: str | None = None
    snippet: str | None = None
    subject: str | None = None
    from_header: str | None = None
    to_header: str | None = None
    labels: list[str] = []
    unread: bool = False
    has_attachments: bool = False
    received_at: datetime | None = None


class GmailMessageListResponse(BaseModel):
    items: list[GmailMessageRead]
    page_size: int
    next_page_token: str | None = None
    result_size_estimate: int | None = None


class GmailSendRequest(BaseModel):
    to: str
    subject: str
    body: str


class GmailSendResponse(BaseModel):
    message_id: str
    thread_id: str | None = None
