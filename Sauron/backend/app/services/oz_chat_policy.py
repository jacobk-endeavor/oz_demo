from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from app.schemas.oz_chat import OzChatRequest

PolicyRoute = Literal["hardcoded", "agent"]


@dataclass(slots=True)
class PolicyDecision:
    route: PolicyRoute
    reason: str


class PolicyGate(Protocol):
    def __call__(self, request: OzChatRequest) -> PolicyDecision: ...


class DefaultPolicyGate:
    """Minimal policy hook for hardcoded-vs-agent turn routing."""

    def __call__(self, request: OzChatRequest) -> PolicyDecision:
        if request.hardcoded_hint:
            return PolicyDecision(
                route="hardcoded",
                reason="request.hardcoded_hint=true",
            )
        return PolicyDecision(
            route="agent",
            reason="default_agent_runtime_path",
        )

