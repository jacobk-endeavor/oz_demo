import asyncio

import pytest

from app.services.memory_adapters import (
    MemoryWritePolicy,
    MemoryWriteRejected,
    MemoryWriteRequest,
    InMemoryMemoryAdapter,
)


def test_memory_write_rejects_low_confidence():
    adapter = InMemoryMemoryAdapter(policy=MemoryWritePolicy(min_confidence=0.8))

    async def _write():
        await adapter.memory_write(
            request=MemoryWriteRequest(
                fact="Customer prefers email follow ups.",
                namespace="user:7",
                confidence=0.6,
                source_ref="trace-1",
                provenance={"source_type": "chat_turn", "source_id": "turn-1"},
            )
        )

    with pytest.raises(MemoryWriteRejected):
        asyncio.run(_write())


def test_memory_write_rejects_missing_provenance_fields():
    adapter = InMemoryMemoryAdapter()

    async def _write():
        await adapter.memory_write(
            request=MemoryWriteRequest(
                fact="Prefers Monday morning calls.",
                namespace="user:7",
                confidence=0.95,
                source_ref="trace-2",
                provenance={"source_type": "chat_turn"},
            )
        )

    with pytest.raises(MemoryWriteRejected):
        asyncio.run(_write())


def test_memory_write_rejects_ttl_above_max():
    adapter = InMemoryMemoryAdapter(policy=MemoryWritePolicy(max_ttl_days=90))

    async def _write():
        await adapter.memory_write(
            request=MemoryWriteRequest(
                fact="Uses quarterly planning cycle.",
                namespace="org:12",
                confidence=0.92,
                source_ref="trace-3",
                provenance={"source_type": "chat_turn", "source_id": "turn-3"},
                ttl_days=120,
            )
        )

    with pytest.raises(MemoryWriteRejected):
        asyncio.run(_write())


def test_memory_write_and_recall_succeeds():
    adapter = InMemoryMemoryAdapter()

    async def _write_and_read():
        written = await adapter.memory_write(
            request=MemoryWriteRequest(
                fact="Interested in cedar fence bundles.",
                namespace="user:7",
                confidence=0.91,
                source_ref="trace-4",
                provenance={"source_type": "chat_turn", "source_id": "turn-4"},
            )
        )
        recalled = await adapter.memory_recall(
            query="cedar fence",
            namespace="user:7",
            k=3,
        )
        return written, recalled

    written, recalled = asyncio.run(_write_and_read())
    assert recalled
    assert recalled[0].id == written.id
    assert recalled[0].source_ref == "trace-4"
