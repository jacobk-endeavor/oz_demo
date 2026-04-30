from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol


@dataclass(slots=True)
class MemoryRecord:
    id: str
    namespace: str
    fact: str
    confidence: float
    source_ref: str
    provenance: dict[str, Any]
    created_at: datetime
    expires_at: datetime


@dataclass(slots=True)
class MemoryWriteRequest:
    fact: str
    namespace: str
    confidence: float
    source_ref: str
    provenance: dict[str, Any]
    ttl_days: int | None = None


@dataclass(slots=True)
class MemoryWritePolicy:
    min_confidence: float = 0.8
    default_ttl_days: int = 30
    max_ttl_days: int = 180
    required_provenance_fields: tuple[str, ...] = ("source_type", "source_id")


class MemoryWriteRejected(ValueError):
    """Raised when a memory write request violates policy constraints."""


def validate_memory_write_request(
    request: MemoryWriteRequest,
    policy: MemoryWritePolicy,
) -> int:
    if request.confidence < policy.min_confidence:
        raise MemoryWriteRejected(
            f"confidence={request.confidence} is below min_confidence={policy.min_confidence}"
        )
    missing = [
        field
        for field in policy.required_provenance_fields
        if not request.provenance.get(field)
    ]
    if missing:
        raise MemoryWriteRejected(
            "provenance missing required fields: " + ", ".join(missing)
        )
    ttl_days = request.ttl_days or policy.default_ttl_days
    if ttl_days <= 0:
        raise MemoryWriteRejected("ttl_days must be positive")
    if ttl_days > policy.max_ttl_days:
        raise MemoryWriteRejected(
            f"ttl_days={ttl_days} exceeds max_ttl_days={policy.max_ttl_days}"
        )
    return ttl_days


class MemoryRecallAdapter(Protocol):
    async def memory_recall(
        self,
        *,
        query: str,
        namespace: str,
        k: int,
    ) -> list[MemoryRecord]: ...


class MemoryWriteAdapter(Protocol):
    async def memory_write(
        self,
        *,
        request: MemoryWriteRequest,
    ) -> MemoryRecord: ...


class InMemoryMemoryAdapter(MemoryRecallAdapter, MemoryWriteAdapter):
    """
    Transitional adapter that provides memory_recall/memory_write interfaces
    while persistence integrations are still in progress.
    """

    def __init__(self, policy: MemoryWritePolicy | None = None) -> None:
        self._policy = policy or MemoryWritePolicy()
        self._records: list[MemoryRecord] = []

    async def memory_recall(
        self,
        *,
        query: str,
        namespace: str,
        k: int,
    ) -> list[MemoryRecord]:
        normalized = query.strip().lower()
        matches = [
            record
            for record in self._records
            if record.namespace == namespace
            and (not normalized or normalized in record.fact.lower())
        ]
        matches.sort(key=lambda record: (record.confidence, record.created_at), reverse=True)
        return matches[: max(k, 0)]

    async def memory_write(
        self,
        *,
        request: MemoryWriteRequest,
    ) -> MemoryRecord:
        ttl_days = validate_memory_write_request(request, self._policy)
        now = datetime.now(UTC)
        record = MemoryRecord(
            id=f"mem-{len(self._records) + 1}",
            namespace=request.namespace,
            fact=request.fact.strip(),
            confidence=request.confidence,
            source_ref=request.source_ref,
            provenance=request.provenance,
            created_at=now,
            expires_at=now + timedelta(days=ttl_days),
        )
        self._records.append(record)
        return record


@dataclass(slots=True)
class MemoryToolAdapters:
    recall: MemoryRecallAdapter
    write: MemoryWriteAdapter
    write_policy: MemoryWritePolicy


def build_default_memory_tool_adapters() -> MemoryToolAdapters:
    policy = MemoryWritePolicy()
    adapter = InMemoryMemoryAdapter(policy=policy)
    return MemoryToolAdapters(
        recall=adapter,
        write=adapter,
        write_policy=policy,
    )
