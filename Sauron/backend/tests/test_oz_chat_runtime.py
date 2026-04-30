import asyncio

from app.schemas.oz_chat import OzChatRequest
from app.services.oz_chat_policy import DefaultPolicyGate
from app.services.oz_chat_runtime import RuntimeContext, run_oz_chat_runtime


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
    assert [event["event"] for event in events] == ["trace", "token", "done"]
    assert events[0]["trace_id"] == "trace-test"
    assert events[-1]["route"] in {"hardcoded", "agent"}

