from __future__ import annotations

from collections.abc import AsyncGenerator
from dataclasses import dataclass
from uuid import uuid4

from app.schemas.oz_chat import (
    OzChatDoneEvent,
    OzChatRequest,
    OzChatTokenEvent,
    OzChatTraceEvent,
)
from app.services.oz_chat_policy import DefaultPolicyGate, PolicyGate


@dataclass(slots=True)
class RuntimeContext:
    user_id: int | None = None
    user_email: str | None = None
    user_role: str | None = None


async def run_oz_chat_runtime(
    *,
    request: OzChatRequest,
    context: RuntimeContext,
    policy_gate: PolicyGate | None = None,
) -> AsyncGenerator[dict, None]:
    gate = policy_gate or DefaultPolicyGate()
    trace_id = request.trace_id or str(uuid4())
    decision = gate(request)

    yield OzChatTraceEvent(
        trace_id=trace_id,
        stage="policy_gate",
        detail={
            "route": decision.route,
            "reason": decision.reason,
            "user_id": context.user_id,
        },
    ).model_dump()

    placeholder_text = (
        "Unified /api/oz/chat runtime scaffold is active. "
        "Tool loop will be added in follow-up tasks."
    )
    yield OzChatTokenEvent(trace_id=trace_id, text=placeholder_text).model_dump()

    yield OzChatDoneEvent(
        trace_id=trace_id,
        route=decision.route,
        final_text=placeholder_text,
    ).model_dump()

