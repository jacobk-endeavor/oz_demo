from datetime import datetime

from pydantic import BaseModel


class ChatMessageRead(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatConversationSummaryRead(BaseModel):
    id: int
    title: str | None
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime

    model_config = {"from_attributes": True}


class ChatConversationRead(ChatConversationSummaryRead):
    messages: list[ChatMessageRead]


class GeneralChatRequest(BaseModel):
    message: str
    conversation_id: int | None = None
