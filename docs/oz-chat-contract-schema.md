# Oz Chat Contract Schema (`/api/oz/chat`)

This document defines the request payload and server-sent event (SSE) stream protocol for the unified `POST /api/oz/chat` endpoint. The runtime that emits these events is [`backend/oz/chatRuntime.ts`](../backend/oz/chatRuntime.ts).

## Goals

- One shared request and stream contract for frontend and backend.
- Stable event taxonomy for UI rendering and runtime observability.
- Backward-compatible evolution path with explicit versioning.

### Sandbox, artifacts, and slide-out panels (design baseline)

The `<artifact/>` / `<panel/>` grammar, resolver behavior, and six agent tools (`run_python`, `make_*`, `display_*`) are specified in [code-sandbox-and-artifact-generation.md](code-sandbox-and-artifact-generation.md). **Sequencing (§6.2, §11.6, §12.2.6):** this contract document lands **before** tool definitions ship in the same change; the system prompt should link here. The separate [data-retention-and-artifact-policy.md](data-retention-and-artifact-policy.md) is expected **with** Phase 2 (first Spaces-backed artifacts), not gating the tag/panel schema below.

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
  "decision": "agent",
  "details": {
    "reason": "fallback to runtime loop"
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

## Assistant text: `<artifact/>` and `<panel/>` tags

Assistant messages remain markdown plus existing citation tokens. For file downloads and the right-hand slide-out, the model (or the runtime, for panels—see **Injection**) may embed **self-closing XML elements** parsed in the same pass as citations ([`citationGrammarResolver.ts`](../shared/oz/citationGrammarResolver.ts)).

### `<artifact/>` (file in object storage)

Emitted so the user gets a download affordance. The model does **not** invent `id` values; they come from a `tool_result` in the same turn.

| Attribute | Required | Description |
|-----------|----------|-------------|
| `id` | yes | Server-allocated artifact id (e.g. `art_01HX…`). |
| `kind` | yes | `xlsx` \| `docx` \| `pdf` \| `png` \| `csv` \| `other` |
| `title` | yes | Human-facing label in the pill. |
| `size_bytes` | yes | Integer size for display. |

Example (whitespace for readability only; parser accepts compact form):

```xml
<artifact
  id="art_01HXYZ"
  kind="xlsx"
  title="Top-50 margin SKUs by product line"
  size_bytes="48213"
/>
```

**Provenance:** `id` MUST match an artifact id returned in a `tool_result` for this **same** `assistant_message_id` (one assistant turn, including multi-step tool loops). Unknown or stale ids render as a **warning** in the UI, not a working link. **Signed URL** for download is resolved lazily (e.g. on click) per §12.2.2 of the design doc; expired objects return `410` and the pill shows an expired state.

### `<panel/>` (slide-out UI)

Opens or focuses the shared slide-out; inner UI is chosen by `kind` via a panel registry.

| Attribute | Required | Description |
|-----------|----------|-------------|
| `id` | yes | Server-allocated panel id (e.g. `pan_01HX…`). |
| `kind` | yes | `table` \| `invoice_preview` \| `job_cost_recap` \| `chart` \| `docx_outline` — extensible; registry owns the full set. |

```xml
<panel id="pan_01HXYZ" kind="table"/>
```

**Provenance:** Same rule as artifacts: `id` must have appeared in a `tool_result` for `display_table` or `display_panel` in the **same** `assistant_message_id`. **Injection:** when using streaming/agentic mode, `<panel id="…"/>` may be **emitted on the SSE stream by the backend** immediately after the corresponding `tool_result` (backend-owned; frontend does not synthesize). The model may still emit `<panel/>` in its own text when instructed; ordering relative to tokens is defined by stream `sequence`.

---

## `tool_call` / `tool_result` payloads: sandbox and panels

The following tools extend [`ozChatToolRegistry.ts`](../backend/oz/ozChatToolRegistry.ts). Shapes below describe **`tool_call.arguments`** (JSON) and the **`tool_result`** body the runtime exposes to the model and UI. Field names follow OpenAI-style JSON Schema conventions used in the registry.

Unless noted, `tool_result` includes `tool_call_id`, `name`, `ok`, and a short `summary` string for audit logs.

### `run_python`

**Purpose:** execute Python in an isolated sandbox; stdout/stderr, optional inline figures, optional artifact files uploaded to Spaces.

`tool_call.arguments`:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `code` | string | yes | Full program. |
| `data_refs` | array | no | `{ kind, id }` refs to prior tool outputs mounted under `/sandbox/inputs/`. |
| `upload_ids` | string[] | no | Chat upload ids (§10.2) resolved server-side to mounted files. |
| `timeout_s` | number | no | Wall-clock cap; default 30, max 120. |

`data_refs.kind` (baseline enumeration): `catalog_list_result` \| `catalog_get_result` \| `kb_search_result` \| `search_transcripts_result` \| `recommendations_for_result` \| `run_python_result` \| `upload`. Out-of-window or unknown ids → structured failure with `reason: "ref_expired"` or similar.

**Success `tool_result`** (illustrative; exact nesting can mirror existing runtime helpers):

```json
{
  "ok": true,
  "stdout": "…",
  "stderr": "",
  "exit_code": 0,
  "runtime_ms": 420,
  "inline_figures": [{ "mime": "image/png", "base64": "…" }],
  "artifacts": [
    {
      "id": "art_01H…",
      "kind": "png",
      "title": "Margin chart",
      "size_bytes": 98234,
      "signed_url": "https://…"
    }
  ]
}
```

**Failure `tool_result`** — structured reasons include: `timeout` \| `oom` \| `nonzero_exit` \| `sandbox_unavailable` \| `egress_denied` \| `call_cap_exceeded` \| `ref_expired` (plus `stdout`, `stderr`, `exit_code`, `runtime_ms` when applicable). Per-turn cap: **4** `run_python` invocations.

---

### `make_spreadsheet`

**Purpose:** typed xlsx generation without arbitrary user code (wrapper around the same template stack as sandbox in later phases).

`tool_call.arguments`:

| Field | Type | Required |
|-------|------|----------|
| `title` | string | no |
| `sheets` | array | yes |
| `notes` | string | no |
| `upload_ids` | string[] | no |

`sheets[]`: `{ name, columns: [...], rows: [[...]], formats?: [...] }` (see design doc §2.2).

**Success:** single artifact ref in `tool_result` (same `{ id, kind, title, size_bytes, signed_url }` shape as above); model wraps it in `<artifact …/>`.

---

### `make_docx`

`tool_call.arguments`:

| Field | Type | Required |
|-------|------|----------|
| `title` | string | yes |
| `sections` | array | yes |
| `upload_ids` | string[] | no |

`sections` holds structured headings, paragraphs, tables, image refs (design doc §2.2).

**Success:** one artifact ref (`kind: docx`).

---

### `make_pdf`

Same argument shape as `make_docx` (`title`, `sections`, optional `upload_ids`). **Success:** one artifact ref (`kind: pdf`).

---

### `display_table`

**Purpose:** open the slide-out and show tabular data with stable row ids for composer pinning.

`tool_call.arguments`:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | yes | Panel title. |
| `columns` | array | yes | `{ key, label, kind?: "number" \| "currency" \| "text" }` |
| `rows` | array | yes | `{ id, cells: { [key]: value } }` |
| `scope` | string | no | `catalog` \| `recs` \| `calls` \| `sandbox` — chip styling when pinned. |

**Success `tool_result`:** must include a **panel id** and metadata the UI needs alongside the injected `<panel/>` tag:

```json
{
  "ok": true,
  "panel_id": "pan_01H…",
  "kind": "table",
  "title": "…",
  "columns": [],
  "rows": []
}
```

Frontend stores payload keyed by `(thread_id, message_id)` for the slide-out.

---

### `display_panel`

**Purpose:** non-tabular slide-out content (invoice preview, job-cost recap, chart, outline).

`tool_call.arguments`:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `kind` | string | yes | Registry keys, e.g. `invoice_preview`, `job_cost_recap`, `chart`, `docx_outline`. (`file_drop` is **not** used—chat attachments own uploads.) |
| `props` | object | yes | Component-specific props for the registered renderer. |

**Success `tool_result`:** includes `panel_id` and echoes `kind` + resolved props as needed for rendering.

---

## Ordering and lifecycle rules

- `sequence` MUST be monotonically increasing per stream.
- `done` MUST be the final event.
- `tool_result` MUST reference an earlier `tool_call_id`.
- `token` events MAY appear interleaved with `tool_*` and `trace`.
- For `<artifact/>` / `<panel/>` tags, **provenance** is bound to the current assistant message id: ids from earlier messages in the thread are invalid (see [code-sandbox-and-artifact-generation.md](code-sandbox-and-artifact-generation.md) §12.2.2).
- Clients SHOULD gracefully ignore unknown optional fields.

## Error handling notes

- If stream fails before completion, server SHOULD emit a best-effort terminal error frame compatible with current version conventions before closing the connection.
- Clients SHOULD treat missing `done` as interrupted stream and allow retry/resume UX.
