import asyncio

from app.schemas.oz_chat import OzChatRequest
from app.services.oz_chat_policy import DefaultPolicyGate
from app.services.oz_chat_runtime import RuntimeContext, run_oz_chat_runtime
from app.services.oz_chat_tools import ToolDefinition, ToolExecutionResult, ToolRegistry


def test_default_policy_gate_routes_agent():
    gate = DefaultPolicyGate()
    decision = gate(OzChatRequest(message="hello"))
    assert decision.route == "agent"
    assert decision.reason


def test_policy_gate_respects_hardcoded_hint():
    gate = DefaultPolicyGate()
    decision = gate(OzChatRequest(message="hello", hardcoded_hint=True))
    assert decision.route == "hardcoded"


def test_runtime_emits_trace_token_done_sequence():
    async def _collect() -> list[dict]:
        events: list[dict] = []
        async for event in run_oz_chat_runtime(
            request=OzChatRequest(message="hello", trace_id="trace-test"),
            context=RuntimeContext(user_id=7),
        ):
            events.append(event)
        return events

    events = asyncio.run(_collect())
    assert [event["event"] for event in events] == [
        "trace",
        "trace",
        "trace",
        "token",
        "done",
    ]
    assert events[0]["trace_id"] == "trace-test"
    assert events[1]["stage"] == "memory_recall"
    assert "write_policy" in events[1]["detail"]
    assert events[2]["stage"] == "tool_registry"
    assert events[-1]["route"] in {"hardcoded", "agent"}


def test_runtime_emits_transcript_tool_events_with_provenance():
    async def _search_handler(_: dict) -> ToolExecutionResult:
        return ToolExecutionResult(
            llm_content="Mock context block",
            summary="Found 1 transcript chunk(s) for query.",
            provenance={
                "query": "hello",
                "result_count": 1,
                "citations": [
                    {
                        "kind": "transcript_chunk",
                        "recording_id": 12,
                        "title": "Quarterly Review",
                    }
                ],
            },
        )

    registry = ToolRegistry()
    registry.register(
        ToolDefinition(
            name="search_transcripts",
            description="search",
            parameters={},
            handler=_search_handler,
        )
    )

    async def _collect() -> list[dict]:
        events: list[dict] = []
        async for event in run_oz_chat_runtime(
            request=OzChatRequest(message="hello", trace_id="trace-tool"),
            context=RuntimeContext(user_id=7),
            tool_registry=registry,
        ):
            events.append(event)
        return events

    events = asyncio.run(_collect())
    assert [event["event"] for event in events] == [
        "trace",
        "trace",
        "trace",
        "tool_call",
        "tool_result",
        "token",
        "done",
    ]
    tool_result = events[4]
    assert tool_result["name"] == "search_transcripts"
    assert tool_result["ok"] is True
    assert tool_result["result"]["provenance"]["citations"][0]["kind"] == "transcript_chunk"

