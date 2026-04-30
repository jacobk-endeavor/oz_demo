from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meeting_recording import MeetingRecording
from app.services.transcript_indexer import (
    SearchResult,
    format_search_results_as_context,
    is_enabled as transcript_search_enabled,
    search_transcripts,
)


@dataclass(slots=True)
class ToolExecutionResult:
    llm_content: str
    summary: str
    provenance: dict[str, Any]


ToolHandler = Callable[[dict[str, Any]], Awaitable[ToolExecutionResult]]


@dataclass(slots=True)
class ToolDefinition:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: ToolHandler


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> ToolDefinition | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return sorted(self._tools.keys())


def _citation_for_chunk(chunk: SearchResult) -> dict[str, Any]:
    return {
        "kind": "transcript_chunk",
        "recording_id": chunk.recording_id,
        "meeting_id": chunk.meeting_id,
        "title": chunk.title,
        "start_ts": chunk.start_ts,
        "end_ts": chunk.end_ts,
        "speakers": chunk.speakers,
        "score": chunk.score,
    }


def build_transcript_tool_registry(*, db: AsyncSession | None) -> ToolRegistry:
    registry = ToolRegistry()

    if transcript_search_enabled():

        async def _search_transcripts_handler(args: dict[str, Any]) -> ToolExecutionResult:
            query = str(args.get("query") or "").strip()
            if not query:
                return ToolExecutionResult(
                    llm_content="search_transcripts error: query is required.",
                    summary="search_transcripts failed: query is required",
                    provenance={"error": "query is required", "citations": []},
                )

            try:
                top_k = int(args.get("top_k") or 8)
            except (TypeError, ValueError):
                top_k = 8
            top_k = max(1, min(top_k, 20))

            results = await search_transcripts(query, top_k=top_k)
            llm_content = (
                format_search_results_as_context(results) or "No relevant results found."
            )
            citations = [_citation_for_chunk(r) for r in results]

            return ToolExecutionResult(
                llm_content=llm_content,
                summary=f"Found {len(results)} transcript chunk(s) for query.",
                provenance={
                    "query": query,
                    "result_count": len(results),
                    "citations": citations,
                },
            )

        registry.register(
            ToolDefinition(
                name="search_transcripts",
                description="Search transcript chunks and return ranked excerpts.",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "top_k": {"type": "integer"},
                    },
                    "required": ["query"],
                },
                handler=_search_transcripts_handler,
            )
        )

    if db is not None:

        async def _read_transcript_handler(args: dict[str, Any]) -> ToolExecutionResult:
            try:
                recording_id = int(args.get("recording_id"))
            except (TypeError, ValueError):
                return ToolExecutionResult(
                    llm_content="read_transcript error: recording_id is required.",
                    summary="read_transcript failed: recording_id is required",
                    provenance={"error": "recording_id is required", "citations": []},
                )

            row = (
                await db.execute(
                    select(
                        MeetingRecording.id,
                        MeetingRecording.title,
                        MeetingRecording.transcript,
                    ).where(MeetingRecording.id == recording_id)
                )
            ).one_or_none()
            if row is None:
                return ToolExecutionResult(
                    llm_content=f"read_transcript error: recording {recording_id} not found.",
                    summary=f"read_transcript failed: recording {recording_id} not found",
                    provenance={"error": "recording not found", "citations": []},
                )

            transcript = (row.transcript or "").strip()
            if not transcript:
                return ToolExecutionResult(
                    llm_content=f"read_transcript error: recording {recording_id} has no transcript.",
                    summary=f"read_transcript failed: recording {recording_id} has no transcript",
                    provenance={"error": "empty transcript", "citations": []},
                )

            title = row.title or "Untitled"
            llm_content = (
                f"--- FULL TRANSCRIPT: {title} (recording_id: {recording_id}) ---\n"
                f"{transcript}"
            )
            return ToolExecutionResult(
                llm_content=llm_content,
                summary=f"Loaded full transcript for {title}.",
                provenance={
                    "recording_id": recording_id,
                    "title": title,
                    "char_count": len(transcript),
                    "citations": [
                        {
                            "kind": "transcript_full",
                            "recording_id": recording_id,
                            "title": title,
                        }
                    ],
                },
            )

        registry.register(
            ToolDefinition(
                name="read_transcript",
                description="Read the complete transcript for a recording ID.",
                parameters={
                    "type": "object",
                    "properties": {"recording_id": {"type": "integer"}},
                    "required": ["recording_id"],
                },
                handler=_read_transcript_handler,
            )
        )

    return registry
