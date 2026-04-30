import asyncio

import pytest

from app.services.graph_tool_adapter import (
    StubGraphToolAdapter,
    resolve_graph_depth_limit,
    resolve_graph_size_limit,
)


def test_graph_depth_limit_is_clamped():
    assert resolve_graph_depth_limit(5, default_depth=1, max_depth=3) == 3
    assert resolve_graph_depth_limit(0, default_depth=1, max_depth=3) == 1
    assert resolve_graph_depth_limit(None, default_depth=2, max_depth=3) == 2


def test_graph_size_limit_is_clamped():
    assert resolve_graph_size_limit(100, default_size=10, max_size=25) == 25
    assert resolve_graph_size_limit(-1, default_size=10, max_size=25) == 1
    assert resolve_graph_size_limit("bad", default_size=10, max_size=25) == 10


def test_stub_graph_search_returns_limit_metadata():
    adapter = StubGraphToolAdapter(allowed_scopes={"all", "current"})

    result = asyncio.run(
        adapter.graph_search(
            query="pricing pressure",
            scope="current",
            max_depth=2,
            max_size=12,
        )
    )
    assert result["stub"] is True
    assert result["applied_limits"] == {"max_depth": 2, "max_size": 12}
    assert result["nodes"] == []
    assert result["edges"] == []


def test_stub_graph_neighbors_rejects_disallowed_scope():
    adapter = StubGraphToolAdapter(allowed_scopes={"current"})

    with pytest.raises(ValueError, match="scope must be one of"):
        asyncio.run(
            adapter.graph_neighbors(
                node_id="company:acme",
                scope="all",
                depth=1,
                max_size=10,
            )
        )
