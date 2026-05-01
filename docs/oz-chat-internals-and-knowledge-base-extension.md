# Oz chat internals and how to plug in a new knowledge base

This doc is the **practical, code-level** explanation of how a chat turn flows through Oz today, where the knowledge base sits in that flow, and the exact surfaces you change to swap or add a different KB.

For the wire contract and the Mermaid flow diagram, see [oz-chat-contract-schema.md](./oz-chat-contract-schema.md) and [oz-new-chat-flow-diagram.md](./oz-new-chat-flow-diagram.md).

---

## TL;DR

- The **canonical** chat entry is `POST /api/oz/chat` → server-streamed SSE.
- The server loop lives in [backend/oz/chatRuntime.ts](../backend/oz/chatRuntime.ts) — `runOzChatLoop`.
- A request takes one of two paths:
  - **`hardcoded`** — deterministic short-circuits (`ping`, `/help`, empty input).
  - **`agent`** — the runtime calls a fixed sequence of tools through `OzToolSurface`, streams trace + tool events, and finishes with a reply.
- The current KB = the `call_rag_chunks` Postgres+pgvector table, accessed via two tools: `search_transcripts` and `read_transcript` ([backend/oz/transcriptRagTools.ts](../backend/oz/transcriptRagTools.ts)).
- There are **three sane ways** to add a new KB. The best one is **add a new tool to `OzToolSurface`** so it participates in the same loop, contract, telemetry and scope plumbing.

---

## 1. End-to-end flow of one chat turn

```
[Browser]                                    [Vite middleware / backend/oz]
OzAssistantPanel
  │ user types
  ▼
App.tsx · onUserMessage(text, context)
  │ priority-ordered branches (lumberyard / charts / lead table / …)
  │ for non-hardcoded turns:
  ▼
useOzChatStream.sendNonHardcodedTurn
  │ (feature-flag VITE_OZ_CHAT_UNIFIED)
  ▼
ozChatClient.postOzChat
  │ POST /api/oz/chat  (SSE, body = { message, context, ragScope, trace_id, contract_version })
  ▼─────────────────────────────────────────► viteOzChatApi.ozChatApiPlugin (Vite middleware)
                                              │ parse JSON body, normalize trace_id
                                              │ open `text/event-stream`
                                              ▼
                                              chatRuntime.runOzChatLoop  (async generator)
                                              │ yields events:
                                              │   trace · policy_gate
                                              │   trace · runtime_loop
                                              │   trace · memory_recall
                                              │   trace · memory_write_policy / memory_write
                                              │   tool_call / tool_result · search_transcripts
                                              │   tool_call / tool_result · read_transcript
                                              │   trace · tool_latency
                                              │   trace · runtime_summary
                                              │   token · <delta>
                                              │   done  · { message, citations, finish_reason }
  ◄───────── SSE frames (one JSON event per `data:` line) ─────────────
ozChatClient.readSseReply
  │ accumulates token deltas; captures final `done.message` when present;
  │ records tool_call/tool_result telemetry
  ▼
useOzChatStream returns { reply, delayMs: 0 }
  ▼
App.tsx renders the reply in OzAssistantPanel
```

Key files:
- Entry, branching: [frontend/src/App.tsx](../frontend/src/App.tsx) (search `onUserMessage`, `sendNonHardcodedTurn`).
- Stream hook: [frontend/src/features/oz/useOzChatStream.ts](../frontend/src/features/oz/useOzChatStream.ts).
- Transport client: [frontend/src/features/oz/ozChatClient.ts](../frontend/src/features/oz/ozChatClient.ts).
- Wire contract: [frontend/src/features/oz/ozChatContract.ts](../frontend/src/features/oz/ozChatContract.ts) and [docs/oz-chat-contract-schema.md](./oz-chat-contract-schema.md).
- HTTP middleware: [backend/oz/viteOzChatApi.ts](../backend/oz/viteOzChatApi.ts) (registered in [frontend/vite.config.ts](../frontend/vite.config.ts)).
- Runtime loop: [backend/oz/chatRuntime.ts](../backend/oz/chatRuntime.ts).
- Tools: [backend/oz/transcriptRagTools.ts](../backend/oz/transcriptRagTools.ts), [backend/oz/graphAdapters.ts](../backend/oz/graphAdapters.ts), [backend/oz/memoryAdapters.ts](../backend/oz/memoryAdapters.ts).

There is also a **legacy fallback** path: if `/api/oz/chat` 404s/405s/501s, `useOzChatStream` switches to `postRagCallsQuery` → `POST /api/oz/rag-calls` ([frontend/vite.ozRagCallsApi.ts](../frontend/vite.ozRagCallsApi.ts)). New work should go through the unified runtime; treat the legacy endpoint as a compatibility shim.

---

## 2. The runtime loop in detail

`runOzChatLoop` is an `async function*` ([backend/oz/chatRuntime.ts:162](../backend/oz/chatRuntime.ts#L162)). Every yielded event is serialized as one SSE frame.

### 2.1 Policy gate

```ts
choosePolicyPath(request) → 'hardcoded' | 'agent'
```

Defined at [chatRuntime.ts:147](../backend/oz/chatRuntime.ts#L147):
- empty → `hardcoded`
- `'ping'` or `/help…` → `hardcoded`
- everything else → `agent`

The `hardcoded` branch (`hardcodedReplyFor`) emits a fixed reply and a single `done` event. Add new deterministic short-circuits here only when you truly want to bypass tools (e.g. `/help <topic>`).

### 2.2 Agent path: build the tool surface

```ts
createOzToolSurface(request, deps): OzToolSurface
```

Defined at [chatRuntime.ts:110](../backend/oz/chatRuntime.ts#L110). The surface today is:

| Tool | Adapter | Purpose |
|---|---|---|
| `graph_search` | `GraphSearchAdapter` (stub by default) | Search a knowledge graph by query |
| `graph_neighbors` | `GraphNeighborsAdapter` (stub by default) | Expand a graph node |
| `search_transcripts` | `TranscriptToolRegistry` (pgvector-backed) | Semantic search over `call_rag_chunks` |
| `read_transcript` | same | Load full chunks for one `call_id` |

Each adapter receives a **scope** that defaults to `request.ragScope` (or `'admin'` when blank). Graph adapters also clamp `depth`, `size`, and `scope` against `GraphTraversalLimits` ([graphAdapters.ts:91](../backend/oz/graphAdapters.ts#L91)).

### 2.3 Memory: recall + write-policy gate

Implemented inline in `runOzChatLoop`:

1. `recallAdapter({ query, conversation_id, trace_id, rag_scope })` → list of `MemoryItem`. Default = `noopMemoryRecall` (returns `[]`). Sanitized via `sanitizeMemoryItem`.
2. Build a `SanitizedMemoryWrite` from the user message at confidence `0.85`, provenance `oz-chat-user-input`, TTL = 30 days.
3. `evaluateMemoryWritePolicy` ([memoryAdapters.ts:81](../backend/oz/memoryAdapters.ts#L81)) gates the write on: non-empty content, confidence ≥ `MIN_MEMORY_WRITE_CONFIDENCE` (0.6), provenance present, TTL > 0.
4. If allowed, `writeAdapter` runs (default = noop, returns `{ accepted: false, reason: 'memory_write_adapter_not_configured' }`).

Both adapters are in `RuntimeDependencies.memory` so you can swap them per-deployment.

### 2.4 Tool calls (current behavior)

The agent branch always runs **two** tool calls in fixed order:

1. `search_transcripts({ query: message, scope, top_k: 8 })` → optional `TranscriptSearchResult`.
2. If `searchResult.hits[0]` exists → `read_transcript({ call_id, scope, max_chunks: 6 })`.

Each call wraps in try/catch and emits `tool_call` + `tool_result` + a `tool_latency` trace. Failures increment `toolFailureCount` but do **not** abort the loop — the runtime always finishes with a `done` event.

There is **no model-driven tool loop** here today. The runtime is a deterministic "always do these two tools, then synthesize" pipeline. If/when you wire an LLM to choose tools, this is the function to change.

### 2.5 Final synthesis

The reply today is a stub string assembled in code (no LLM call):

```text
Oz runtime executed transcript tools.[ Loaded N memory item(s)…][ Top transcript evidence: …]
```

Citations from `searchResult` (or `readResult`) are forwarded on the terminal `done` event. The frontend (`ozChatClient.readSseReply`) prefers `done.message` over assembled `token` deltas.

> When you add LLM synthesis, replace the `agentReply` string with a streaming completion that takes `searchResult.hits` + `recalledItems` as grounding. Keep emitting `token` events so the UI streams.

---

## 3. The current knowledge base

The Oz "KB" today is **call transcripts**, ingested into Postgres with pgvector:

- Table: `call_rag_chunks` (`chunk_id`, `call_id`, `owner_user_id`, `chunk_index`, `content`, `embedding vector`).
- Ingest: `calls/sauron/scripts/ingest_calls_pgvector.py` (referenced from `vite.ozRagCallsApi.ts` error messages).
- Query path: [backend/oz/transcriptRagTools.ts](../backend/oz/transcriptRagTools.ts).
  - `search_transcripts` embeds the query with `text-embedding-3-small`, runs `ORDER BY embedding <=> $1::vector LIMIT topK`, optionally filters by `owner_user_id` for non-admin scope.
  - `read_transcript` loads up to `max_chunks` for one `call_id`, ordered by `chunk_index`.
- Returns `provenance` (`postgres_call_rag_chunks` vs `stub`) and `citations` (`{ kind: 'transcript_chunk', id, label: '${call_id}#${chunk_index}' }`).

Stub fallback: when `dbQuery` or `OPENAI_API_KEY` is missing, the registry returns empty `hits` with `provenance.source = 'stub'`. The runtime still completes; the user just sees "Transcript evidence lookup returned no hits."

The legacy `/api/oz/rag-calls` endpoint ([frontend/vite.ozRagCallsApi.ts](../frontend/vite.ozRagCallsApi.ts)) is a **separate** synchronous JSON endpoint that does the embed-search-and-LLM-synthesis for the **same** table. It exists for the pre-unified UI path and is what `useOzChatStream`'s fallback calls when the unified route is missing.

---

## 4. The contract that any new KB must honor

If you add a tool, conform to these shapes (they're enforced by tests and consumed by the FE):

### Result shape

```ts
type SomeKbSearchResult = {
  query: string
  scope: string
  hits: Array<{ /* fields specific to your KB */ }>
  provenance: {
    source: 'your_table_name' | 'stub'
    retrieval: 'semantic_vector' | 'lexical' | 'graph' | 'none' | …
    top_k: number
  }
  citations: Array<{ kind: string; id: string; label?: string }>
}
```

### Scope rules
- `scope === 'admin'` (or empty) ⇒ no row-level filter.
- Otherwise the scope value is treated as a tenant/owner id and applied as a `WHERE owner_user_id = $n` style filter. Reject unknown scopes with a clear error rather than returning all rows silently.
- Always read `request.ragScope` if the caller did not pass `scope` explicitly (`createOzToolSurface` already does this; preserve the pattern).

### Limits
- Clamp `top_k` (transcripts: 1–24; graph: see `DEFAULT_GRAPH_LIMITS`). Don't trust client values verbatim.
- For graph-style traversal use the existing `applyGraph*Limits` helpers; for new tools add an analogous clamp helper next to your adapter.

### Streaming
- Emit `tool_call` **before** doing work (with the exact arguments) and `tool_result` **after** (with `ok`, `summary`, optional `result_meta`).
- Wrap with try/catch — never throw out of the generator. The FE depends on the loop always reaching `done`.

### Citations
- `kind` should be a stable string the FE can branch on (`transcript_chunk`, `kb_doc`, `graph_node`, …).
- `id` must round-trip — i.e. an opener tool should be able to load the same record from this id alone.

---

## 5. How to add a new knowledge base

Pick the option that matches your KB's shape. **Option A is the recommended path** for any new structured KB.

### Option A — Add a new tool to `OzToolSurface` (recommended)

Use this when the KB is queryable (vector / SQL / graph / API) and you want it to participate in the same runtime, contract, telemetry, scope, and FE rendering as transcripts.

**Steps:**

1. **Create the adapter module.** Mirror [transcriptRagTools.ts](../backend/oz/transcriptRagTools.ts):
   - File: `backend/oz/<yourKb>RagTools.ts`.
   - Export a `create<YourKb>ToolRegistry(deps)` that returns `{ search_<x>, read_<x> }` (or whatever verbs make sense — `lookup_*`, `list_*`, …).
   - Inject side-effects via `deps` (`dbQuery`, `fetchImpl`, `openAiApiKey`, table name) so tests can pass stubs.
   - Always implement a stub fallback when deps are missing.

2. **Extend `OzToolSurface` and `RuntimeDependencies`.** In [chatRuntime.ts](../backend/oz/chatRuntime.ts):
   - Add the new methods to `OzToolSurface` (around [chatRuntime.ts:90](../backend/oz/chatRuntime.ts#L90)).
   - Add a `<yourKb>?: { registry?, dbQuery?, … }` field on `RuntimeDependencies` (around [chatRuntime.ts:68](../backend/oz/chatRuntime.ts#L68)).
   - Wire it in `createOzToolSurface` (around [chatRuntime.ts:110](../backend/oz/chatRuntime.ts#L110)) — default to your registry's stub when no adapter is provided, propagate `requestScope`.

3. **Decide when the runtime should call it.** Two sub-options:
   - **3a. Deterministic order (matches today):** add explicit `tool_call` / `tool_result` emissions inside `runOzChatLoop`'s agent branch, after the existing `read_transcript` block. Wrap with the same try/catch + latency trace pattern.
   - **3b. Conditional on a routing signal:** look at `request.ragScope` or a new `request.context.kb` field and only call the relevant tool.
   - **3c. (Future) Model-chosen:** when an LLM driver lands here, expose the new tool's JSON schema in the same place as the others. Today there is no such driver — see §2.5.

4. **Pass the dependency through the HTTP plugin.** In [viteOzChatApi.ts:140](../backend/oz/viteOzChatApi.ts#L140), the plugin currently only wires `transcripts: { openAiApiKey, dbQuery }`. Add your KB's deps to that `runOzChatLoop` call, reading from `loadEnv` / `process.env` the same way.

5. **Tests.** Add a sibling test next to your adapter (see [transcriptRagTools.ts](../backend/oz/transcriptRagTools.ts) and [frontend/src/features/oz/chatRuntime.transcriptTools.test.ts](../frontend/src/features/oz/chatRuntime.transcriptTools.test.ts) for shape):
   - Stub mode returns expected empty + provenance.
   - Scope filter applied for non-admin.
   - `top_k` clamped.
   - `runOzChatLoop` emits `tool_call` and `tool_result` for the new tool.

6. **Frontend (optional).** If you want richer rendering than "tool ran", add a renderer for your new `tool_result.name` in the chat transcript. The base path (assembled text + citations on `done`) already works without FE changes.

### Option B — Add a new pre-baked endpoint `/api/oz/<yourKb>`

Use this when the KB needs its own **prompt**, **temperature**, or **shape of response** that doesn't fit the agent loop, and you want to invoke it from `App.tsx` branches directly (the legacy Oz pattern, still used by `lumberyard-intel`, `rag-calls`, `email`).

**Steps:**

1. Create `frontend/vite.oz<YourKb>Api.ts`. Copy the structure of [vite.ozRagCallsApi.ts](../frontend/vite.ozRagCallsApi.ts): `readBody`, env loaders, a single handler that intercepts `/api/oz/<yourKb>` POSTs, returns JSON.
2. Register the plugin in [frontend/vite.config.ts](../frontend/vite.config.ts) `plugins: [...]`.
3. Add a client function in `frontend/src/services/` or `features/<yourKb>/`.
4. Branch to it from `App.tsx onUserMessage` **before** the `sendNonHardcodedTurn` fallback so it short-circuits the agent runtime.

Trade-off: your new KB will **not** appear inside the unified `/api/oz/chat` SSE stream, so it won't share telemetry, contract version, trace ids, citation rendering, or memory recall. Only pick this if Option A really doesn't fit.

### Option C — Re-point `search_transcripts` at a different table

Use this only when your new KB has the **same row shape** as `call_rag_chunks` (chunk-id, content, embedding, owner). Set up the table, point `dbQuery` at it (or change the SQL constant in [transcriptRagTools.ts](../backend/oz/transcriptRagTools.ts)), keep the tool name. Cheap but coarse.

---

## 6. End-to-end checklist for a new tool (Option A)

```
[ ] backend/oz/<yourKb>RagTools.ts created (search + read, with stub fallback)
[ ] OzToolSurface extended (chatRuntime.ts)
[ ] RuntimeDependencies extended (chatRuntime.ts)
[ ] createOzToolSurface wires the registry + scope
[ ] runOzChatLoop emits tool_call / tool_result / tool_latency for the new tool
[ ] viteOzChatApi.ts forwards env-derived deps into runOzChatLoop
[ ] Adapter tests cover: stub, scope filter, clamp, error path
[ ] Runtime test asserts the new tool fires with expected args
[ ] (Optional) FE renderer for the new tool_result.name
[ ] (Optional) Update docs/oz-chat-internals-and-knowledge-base-extension.md so the new tool is listed in §2.2
```

---

## 7. Things that bite you

- **Empty / `ping` / `/help` go down `hardcoded`** — your tool will not run for those messages. If you add a new short-circuit, also add a test so you don't accidentally bypass new tools.
- **Failures don't abort the loop** — they're swallowed into a `tool_result` with `ok: false`. Watch the `runtime_summary` trace's `tools_failed` counter to detect KB outages, not the SSE response code.
- **Scope defaults to `admin` when blank** — so an unscoped query reads everything. If your new KB has tenant data, refuse to query without an explicit scope rather than relying on the default.
- **`/api/oz/chat` is a Vite middleware** — it runs in dev and in `vite preview`. There is no separate backend process. For prod hardening, port `viteOzChatApi.ts` to your real server.
- **The reply today is hardcoded text, not an LLM call.** If you wire an LLM in `runOzChatLoop`, move the existing string into a fallback path so the loop still completes when the LLM API is unreachable.
- **Citations are not deduped** — if you add a tool whose hits overlap with `search_transcripts`, decide which one wins on the `done` event (currently `searchResult?.citations ?? readResult?.citations`).

---

## 8. Where to look next

- Contract reference: [docs/oz-chat-contract-schema.md](./oz-chat-contract-schema.md).
- New-flow diagram: [docs/oz-new-chat-flow-diagram.md](./oz-new-chat-flow-diagram.md).
- Operator playbook: [docs/oz-demo/chat-runbook.md](./oz-demo/chat-runbook.md).
- CI guardrails (boundaries enforced in CI): [docs/oz-demo/ci-guardrails.md](./oz-demo/ci-guardrails.md).
