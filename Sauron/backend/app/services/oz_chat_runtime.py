from __future__ import annotations

from collections.abc import AsyncGenerator
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.oz_chat import (
    OzChatDoneEvent,
    OzChatToolCallEvent,
    OzChatToolResultEvent,
    OzChatRequest,
    OzChatTokenEvent,
    OzChatTraceEvent,
)
from app.services.memory_adapters import (
    MemoryToolAdapters,
    build_default_memory_tool_adapters,
)
from app.services.oz_chat_policy import DefaultPolicyGate, PolicyGate
from app.services.oz_chat_tools import ToolRegistry, build_transcript_tool_registry


@dataclass(slots=True)
class RuntimeContext:
    user_id: int | None = None
    user_email: str | None = None
    user_role: str | None = None
    db: AsyncSession | None = None


async def run_oz_chat_runtime(
    *,
    request: OzChatRequest,
    context: RuntimeContext,
    policy_gate: PolicyGate | None = None,
    memory_adapters: MemoryToolAdapters | None = None,
    tool_registry: ToolRegistry | None = None,
) -> AsyncGenerator[dict, None]:
    gate = policy_gate or DefaultPolicyGate()
    adapters = memory_adapters or build_default_memory_tool_adapters()
    registry = tool_registry or build_transcript_tool_registry(db=context.db)
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

    memory_namespace = (
        f"user:{context.user_id}" if context.user_id is not None else "anonymous"
    )
    recalled = await adapters.recall.memory_recall(
        query=request.message,
        namespace=memory_namespace,
        k=3,
    )
    yield OzChatTraceEvent(
        trace_id=trace_id,
        stage="memory_recall",
        detail={
            "namespace": memory_namespace,
            "items_returned": len(recalled),
            "write_policy": {
                "min_confidence": adapters.write_policy.min_confidence,
                "default_ttl_days": adapters.write_policy.default_ttl_days,
                "max_ttl_days": adapters.write_policy.max_ttl_days,
                "required_provenance_fields": list(
                    adapters.write_policy.required_provenance_fields
                ),
            },
        },
    ).model_dump()

    tool_names = registry.names()
    yield OzChatTraceEvent(
        trace_id=trace_id,
        stage="tool_registry",
        detail={"tool_names": tool_names},
    ).model_dump()

    final_text = (
        "Unified /api/oz/chat runtime scaffold is active. "
        "No transcript tools are currently available."
    )
    if decision.route == "agent" and "search_transcripts" in tool_names:
        search_tool = registry.get("search_transcripts")
        if search_tool is not None:
            arguments = {"query": request.message, "top_k": 8}
            yield OzChatToolCallEvent(
                trace_id=trace_id,
                name=search_tool.name,
                arguments=arguments,
            ).model_dump()
            tool_result = await search_tool.handler(arguments)
            yield OzChatToolResultEvent(
                trace_id=trace_id,
                name=search_tool.name,
                ok=not bool(tool_result.provenance.get("error")),
                result={
                    "summary": tool_result.summary,
                    "provenance": tool_result.provenance,
                },
            ).model_dump()
            final_text = tool_result.summary

    yield OzChatTokenEvent(trace_id=trace_id, text=final_text).model_dump()

    yield OzChatDoneEvent(
        trace_id=trace_id,
        route=decision.route,
        final_text=final_text,
    ).model_dump()

