from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class OzChatRequest(BaseModel):
    message: str
    conversation_id: int | None = None
    trace_id: str | None = None
    hardcoded_hint: bool = False


class OzChatTokenEvent(BaseModel):
    event: Literal["token"] = "token"
    trace_id: str
    text: str


class OzChatToolCallEvent(BaseModel):
    event: Literal["tool_call"] = "tool_call"
    trace_id: str
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class OzChatToolResultEvent(BaseModel):
    event: Literal["tool_result"] = "tool_result"
    trace_id: str
    name: str
    ok: bool
    result: dict[str, Any] = Field(default_factory=dict)


class OzChatTraceEvent(BaseModel):
    event: Literal["trace"] = "trace"
    trace_id: str
    stage: str
    detail: dict[str, Any] = Field(default_factory=dict)


class OzChatDoneEvent(BaseModel):
    event: Literal["done"] = "done"
    trace_id: str
    route: Literal["hardcoded", "agent"]
    final_text: str
    usage: dict[str, Any] = Field(default_factory=dict)

