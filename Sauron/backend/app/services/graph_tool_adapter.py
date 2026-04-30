from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


def _clamp_limit(requested: Any, *, default: int, maximum: int) -> int:
    try:
        value = int(requested)
    except (TypeError, ValueError):
        value = default
    return max(1, min(value, maximum))


def resolve_graph_depth_limit(
    requested_depth: Any,
    *,
    default_depth: int,
    max_depth: int,
) -> int:
    return _clamp_limit(
        requested_depth,
        default=max(1, default_depth),
        maximum=max(1, max_depth),
    )


def resolve_graph_size_limit(
    requested_size: Any,
    *,
    default_size: int,
    max_size: int,
) -> int:
    return _clamp_limit(
        requested_size,
        default=max(1, default_size),
        maximum=max(1, max_size),
    )


@dataclass(slots=True)
class GraphTraversalLimits:
    max_depth: int
    max_size: int


class GraphToolAdapter(Protocol):
    async def graph_search(
        self,
        *,
        query: str,
        scope: str,
        max_depth: int,
        max_size: int,
    ) -> dict[str, Any]: ...

    async def graph_neighbors(
        self,
        *,
        node_id: str,
        scope: str,
        depth: int,
        max_size: int,
    ) -> dict[str, Any]: ...


@dataclass(slots=True)
class StubGraphToolAdapter:
    allowed_scopes: set[str]

    def _validate_scope(self, scope: str) -> None:
        if scope not in self.allowed_scopes:
            raise ValueError(
                f"scope must be one of: {', '.join(sorted(self.allowed_scopes))}"
            )

    async def graph_search(
        self,
        *,
        query: str,
        scope: str,
        max_depth: int,
        max_size: int,
    ) -> dict[str, Any]:
        self._validate_scope(scope)
        return {
            "query": query,
            "scope": scope,
            "nodes": [],
            "edges": [],
            "applied_limits": {
                "max_depth": max_depth,
                "max_size": max_size,
            },
            "stub": True,
        }

    async def graph_neighbors(
        self,
        *,
        node_id: str,
        scope: str,
        depth: int,
        max_size: int,
    ) -> dict[str, Any]:
        self._validate_scope(scope)
        return {
            "node_id": node_id,
            "scope": scope,
            "neighbors": [],
            "edges": [],
            "applied_limits": {
                "depth": depth,
                "max_size": max_size,
            },
            "stub": True,
        }
