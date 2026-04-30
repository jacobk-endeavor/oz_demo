# Oz Chat Contract Schema (`/api/oz/chat`)

Status: canonical contract for Wave 1 task `Oz-Demo-0vl.2`.

This document defines the request payload and server-sent event (SSE) stream protocol for the unified `POST /api/oz/chat` endpoint.

## Goals

- One shared request and stream contract for frontend and backend.
- Stable event taxonomy for UI rendering and runtime observability.
- Backward-compatible evolution path with explicit versioning.

## Versioning

- Contract identifier: `2026-04-oz-chat-v1`.
- Transport header: `x-oz-chat-contract-version`.
- Request field mirror: `contract_version` (optional when header is present).
- Servers SHOULD default to the latest backward-compatible version when client omits version.
- Servers MUST reject unknown major versions with `400` and a machine-readable error payload.

## Backward compatibility policy

- Additive-only changes are allowed within the same major version:
  - adding optional request fields,
  - adding optional event fields,
  - adding new event types only after compatibility window and feature flag gating.
- Existing required fields and event type semantics MUST NOT change in a minor update.
- Deprecations require a documented window (recommended: two release cycles) before removal.
- `done` remains terminal and required for every successful stream across versions.

## Request schema (frontend -> backend)

```json
{
  "contract_version": "2026-04-oz-chat-v1",
  "message": "How did Q2 calls mention competitor pricing?",
  "conversation_id": "optional UUID string",
  "trace_id": "optional trace id propagated end-to-end",
  "scope": {
    "mode": "oz_admin",
    "rep_name": "optional rep display name"
  },
  "ui_context": {
    "page": "oz",
    "attachments": ["optional labels or row ids"],
    "hardcoded_action_taken": false
  },
  "metadata": {
    "client": "web",
    "timezone": "America/Los_Angeles"
  }
}
```

### Request field notes

- `message` is required non-empty user input.
- `conversation_id` allows stream continuity and server-side memory/threading.
- `trace_id` is optional but recommended for observability joins.
- `scope` and `ui_context` are advisory; server-side policy remains authoritative.

## SSE stream schema (backend -> frontend)

All stream chunks are JSON with a common envelope:

```json
{
  "type": "token | tool_call | tool_result | trace | done",
  "contract_version": "2026-04-oz-chat-v1",
  "sequence": 17,
  "timestamp": "2026-04-30T21:00:00.000Z",
  "conversation_id": "optional UUID string",
  "trace_id": "optional trace id"
}
```

### `token` event

Model text delta for incremental rendering.

```json
{
  "type": "token",
  "delta": "pricing was mentioned in 34% of calls..."
}
```

### `tool_call` event

Emitted when runtime invokes a tool.

```json
{
  "type": "tool_call",
  "tool_call_id": "call_01",
  "name": "search_transcripts",
  "arguments": {
    "query": "competitor pricing mentions in Q2",
    "top_k": 8
  }
}
```

### `tool_result` event

Summarized result from a completed tool call.

```json
{
  "type": "tool_result",
  "tool_call_id": "call_01",
  "name": "search_transcripts",
  "ok": true,
  "summary": "8 transcript chunks returned",
  "result_meta": {
    "rows": 8,
    "latency_ms": 142
  }
}
```

### `trace` event

Operational decision details for diagnostics and explainability.

```json
{
  "type": "trace",
  "stage": "policy_gate",
  "decision": "agent_path",
  "details": {
    "reason": "no deterministic hardcoded intent matched"
  }
}
```

### `done` event (terminal)

Required terminal event that closes the stream.

```json
{
  "type": "done",
  "message": "Final assistant response text",
  "usage": {
    "input_tokens": 1560,
    "output_tokens": 402
  },
  "citations": [
    {
      "kind": "transcript_chunk",
      "id": "chunk_abc123"
    }
  ],
  "finish_reason": "stop"
}
```

## Ordering and lifecycle rules

- `sequence` MUST be monotonically increasing per stream.
- `done` MUST be the final event.
- `tool_result` MUST reference an earlier `tool_call_id`.
- `token` events MAY appear interleaved with `tool_*` and `trace`.
- Clients SHOULD gracefully ignore unknown optional fields.

## Error handling notes

- If stream fails before completion, server SHOULD emit a best-effort terminal error frame compatible with current version conventions before closing the connection.
- Clients SHOULD treat missing `done` as interrupted stream and allow retry/resume UX.
