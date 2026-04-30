# Chat routing, APIs, and prompting: Oz Demo vs Sauron

This document explains how text chat requests are routed in the **Oz Demo** frontend (the Endeavor “command center” prototype), how **prompting** is structured for each path, and how the separate **`Sauron/`** product (FastAPI + React CRM) routes its chat and tools. It also summarizes **`sauron-calls/`**, which is a **data and CLI layer** for pgvector RAG used by the Oz Demo—not an HTTP server for end users.

---

## Part 1 — Oz Demo: from `OzAssistantPanel` to `/api/oz/*`

### What “API chat” means here

The demo does **not** expose a separate UI channel literally named “API chat.” The **center-column text assistant** (“Oz chat”) is the surface that fans out to **multiple backend-style endpoints** in dev/preview: OpenAI proxy, lumberyard intel, transcript RAG, etc. Voice-first surfaces (Field App command center) **skip** the text `onUserMessage` handler entirely.

**Why:** One conversational shell keeps the demo cohesive; routing is **branching logic in `App.tsx`** rather than separate chat products. API keys stay off the client in development via Vite middleware.

### High-level request flow

1. User sends a line from **`OzAssistantPanel`** (`onUserMessage` callback).
2. **`App.tsx`** runs a **priority-ordered decision tree**: special intents (background agents, charts, competitor search, lumberyard, lead table commands) each short-circuit when matched.
3. If no short-circuit, the lead table path tries **LLM interpretation** (`interpretLeadTableWithLlm`), else **rule-based** `processLeadTableChat`.
4. On the home **`page === 'oz'`**, when the rules engine marks the turn as **`usedConversationalFallback`** and OpenAI is configured, the app calls **`POST /api/oz/rag-calls`** (pgvector RAG over synthetic Russin transcripts).
5. Otherwise, if OpenAI is configured, **`fetchOpenAIChatCompletion`** sends a polished reply via **`POST /api/oz/openai`** (dev proxy) or direct OpenAI in production builds with `VITE_OPENAI_API_KEY`.

**Why this order:** Demo-critical **deterministic UX** (open the right panel, load the right table) is handled first with explicit intents. **Expensive or fragile** calls (LLM, DB RAG) run only when needed. RAG is gated on `usedConversationalFallback` so generic chit-chat and off-script questions still get transcript grounding without fighting the lead-table state machine.

### Files and component summaries (Oz Demo)

| File / area | Role |
|-------------|------|
| `frontend/src/shared/ui/OzAssistantPanel.tsx` | Chat UX: composer, thread, loading “knowledge” pills, streaming/instant replies. Invokes `onUserMessage(text, context)` and builds `OzChatTurnContext` (prior lines + row attachments). |
| `frontend/src/shared/ui/OzWorkflowShell.tsx` | Layout shell: nav, context column, optional center chat; passes `assistantProps` into the panel. |
| `frontend/src/App.tsx` | **Central router** for chat: `onUserMessage` implements the full branch tree; wires RAG scope (`ragCallsScope`), lumberyard/competitor/lead state, and `fetchOpenAIChatCompletion`. |
| `frontend/vite.config.ts` | Registers Vite dev/preview middleware: RAG, lumberyard, generic OpenAI proxy, ElevenLabs TTS, email. |
| `frontend/vite.ozRagCallsApi.ts` | **`POST /api/oz/rag-calls`**: embed query → pgvector retrieval → chat completion over excerpts + scope instructions. |
| `frontend/vite.ozLumberyardApi.ts` | **`GET /api/oz/lumberyard-calls`**, **`POST /api/oz/lumberyard-intel`**: file-backed corpus + optional Brave web snippets + `INTEL_SYSTEM` prompt. |
| `frontend/src/services/ozOpenAi.ts` | `buildOzGptSystemPrompt()`, `fetchOpenAIChatCompletion()` → `/api/oz/openai` in dev; documents production key behavior. |
| `frontend/src/features/ragCalls/ragCallsClient.ts` | Browser `fetch` to `/api/oz/rag-calls`; error handling for missing middleware / static hosting. |
| `frontend/src/features/ragCalls/RagCallsScopeMenu.tsx` | UI to pick **admin** vs rep scope (Jacob, Sami, Ryan, Joanna); drives `transcriptResetKey` so threads do not leak context across scopes. |
| `frontend/src/features/lumberyard/lumberyardClient.ts` | `fetchLumberyardLibrary`, `postLumberyardIntel`. |
| `frontend/src/features/leadGen/leadGenTableModel.ts` | Rule engine for the distributor lead table; sets **`usedConversationalFallback: true`** when the user message is not mapped to a table action. |
| `frontend/src/features/leadGen/interpretLeadTableWithLlm.ts` | JSON-mode OpenAI prompt to map natural language → table filters/sorts; runs before rules when API configured. |
| `frontend/src/features/backgroundAgents/backgroundAgentAi.ts` (and helpers) | Optional LLM pass to validate “background agent” setup after heuristics. |

### Prompting in the Oz Demo (details)

1. **Default Oz “polish” turn** (`ozOpenAi.ts` + `App.tsx`)
   - **System:** `OZ_SYSTEM` — Oz persona, markdown, **distributor lead TSV** as source of truth when present, no invented PII.
   - **Augmented system:** `buildOzGptSystemPrompt()` plus `buildLeadTableLlmContext` (table snapshot) plus a **“This turn (handler)”** section so the model does not contradict UI state.
   - **User message:** Original text plus optional row attachment labels via `augmentUserMessageWithTableContext`.
   - **Model:** default `gpt-4o` (or `VITE_OPENAI_MODEL`); temperature **0.45**, up to **3_200** tokens on the main table polish path.
   - **Why:** Separates **UI-ground truth** (handler + TSV) from the user’s free text so the assistant explains what the app did without hallucinating rows.

2. **Lumberyard / “call mining” intel** (`vite.ozLumberyardApi.ts`)
   - **System:** `INTEL_SYSTEM` — sales intelligence persona; transcripts + synthetic telemetry JSON + optional Brave snippets; citation by **call id** in prose; markdown tables for comparisons.
   - **User payload:** Concatenated **corpus** of transcripts, telemetry block, optional web block, then **user question**; last **8** turns of `history` as chat messages.
   - **Model:** `gpt-4o`, temperature **0.35**, **1_400** max tokens (tuned for latency after the knowledge pill animation).
   - **Why:** Keeps quantitative “revenue mix” answers tied to **explicit demo JSON** and transcript ids; Brave is **optional** so the demo works offline with transcripts only.

3. **Transcript RAG** (`vite.ozRagCallsApi.ts`)
   - **Retrieval:** `text-embedding-3-small` (or `OPENAI_EMBEDDING_MODEL`) on the user query; cosine distance over **`call_rag_chunks`** (`pgvector`). **Admin** = all reps; rep scope = **`WHERE owner_user_id = $rep`**.
   - **System message:** Oz + **synthetic Russin** grounding rules; cite **call_id**; avoid over-formal “cannot answer” sections; respect scope.
   - **User message:** A **[Scope]** block (admin vs single-rep warning about comparisons) + **Excerpts** (chunk headers with chunk_id, call_id, rep) + **Question**.
   - **Chat model:** `gpt-4o-mini` by default (`OPENAI_CHAT_MODEL`), temperature **0.15**, **1_600** max tokens; **no multi-turn** in the RAG HTTP handler (single user message with retrieval context).
   - **Why:** Low temperature + grounded excerpts reduce fabrication; scope block mitigates **false cross-rep claims** when viewing one rep’s data.

4. **Lead table LLM interpreter** (`interpretLeadTableWithLlm.ts`)
   - **System:** `TABLE_INTERPRET_SYSTEM` — strict **JSON object** schema for filters, sorts, dataset, engagement, etc.
   - **Why:** JSON mode gives reliable UI state updates; the rules engine remains a fallback when the model is off or errors.

5. **Background agent flow** (`App.tsx`)
   - Uses **`evaluateBackgroundAgentWithLlm`** when OpenAI is configured: recent context string built from prior exchanges plus heuristic extraction of “what” / “when”.
   - **Why:** Heuristics alone miss nuance; the LLM asks clarifying questions before saving an agent.

### Infrastructure decisions (defense in brief)

- **Vite middleware instead of a separate Node server for Oz:** Fewer moving parts for a static+API demo; **`enforce: 'pre'`** on RAG ensures JSON routes win over SPA fallbacks in preview.
- **`/api/oz/openai` passthrough:** Avoids exposing `OPENAI_API_KEY` to the browser in dev; production comment in `ozOpenAi.ts` acknowledges **billing and CORS** risks of `VITE_OPENAI_API_KEY`.
- **Two retrieval stacks (lumberyard file corpus vs pgvector RAG):** Lumberyard intel answers **full synthetic library** loaded from disk; RAG answers **chunked indexed** store aligned with rep scope—different scale and demo stories.

---

## Part 2 — `Sauron/`: CRM chat routing and prompting

`Sauron/` is a **separate application**: FastAPI backend under `Sauron/backend`, React SPA under `Sauron/frontend`. It is **not** wired into the Oz Demo’s Vite server; auth uses JWT (`localStorage` token) and **`/api/chat`** on the same origin as the SPA (typically reverse-proxied to the API).

### General chat HTTP route

| Layer | Responsibility |
|-------|----------------|
| `Sauron/frontend/src/pages/ChatPage.tsx` | Chat UI, conversation list, `useChat({ endpoint: '/api/chat', ... })`. |
| `Sauron/frontend/src/hooks/useChat.ts` | **SSE** client: streams tokens and structured **tool_call** / **tool_result** segments for UI affordances. |
| `Sauron/backend/app/routers/chat.py` | **`POST /api/chat`**: creates or loads `ChatConversation`, persists user message, loads history, returns **`StreamingResponse`** (`text/event-stream`) with **`X-Conversation-Id`**. Final assistant message and title generation run in background finalization. |
| `Sauron/backend/app/services/general_chat_service.py` | **`stream_general_chat`**: sets CRM-wide system prompt + BDR role addendum; calls **`stream_chat_sse`**. |
| `Sauron/backend/app/services/_chat_common.py` | **`stream_chat_sse`**: assembles **tool definitions** (transcript search, read transcript, company info, company emails, web search, Apollo enrichment when enabled), builds final system content, runs **OpenRouter** streaming with tools. |
| `Sauron/backend/app/services/_openrouter.py` | OpenRouter client; **`CHAT_MODEL = "openai/gpt-5.4"`** (routing label for the gateway—not repeated here as a product claim). |

### Prompting — general chat (`general_chat_service.py`)

- **Identity:** “Helpful assistant” in **Sauron** CRM; Endeavor-aligned; favorable to Endeavor vs competitors.
- **Tool-use discipline:** “ALWAYS research thoroughly with tools before writing any answer”; detailed playbooks for company / person / meeting questions (e.g. `get_company_info` then multiple `search_transcripts`, then `read_transcript`).
- **Output:** Dense markdown, **no emojis**, **no internal numeric IDs** in user-visible prose.
- **BDR role:** Extra system addendum restricting internal meetings and specific names—**confidential** behavioral rules.

**Why:** This is **agentic** CRM chat: answers are expected to be **evidence-backed** from transcripts and CRM tools, not single-shot completions. OpenRouter centralizes model access and tool streaming.

### Entity-scoped chat (example: company page)

| File | Behavior |
|------|----------|
| `Sauron/backend/app/services/company_chat_service.py` | **`stream_company_chat`**: system prompt focused on **this company’s** transcripts + emails; passes `current_scope_filters={"company_ids": [company_id]}` so `search_transcripts` with `scope='current'` stays on-entity. |
| `Sauron/backend/app/routers/companies.py` | Exposes an endpoint that streams `stream_company_chat` for the company detail UI. |

**Why:** Same **tool fabric** as general chat (`_chat_common.py`), but **narrower retrieval scope** and a context block with **preloaded transcript text** for the page—consistent behavior with less prompt drift.

### Conversation title prompting (`chat.py`)

- Small side call: system instructs **2–5 word** titles, no quotes/markdown; uses first few messages truncated; falls back to first user line if the model fails.

---

## Part 3 — `sauron-calls/`: data pipeline and CLI (not user HTTP chat)

The folder **`sauron-calls/`** holds **scripts and JSON artifacts** (e.g. `calls.json`, transcript generators) that feed **pgvector** tables such as **`call_rag_chunks`**. It does **not** replace `Sauron/backend` chat.

| Artifact | Role |
|----------|------|
| `sauron-calls/scripts/ingest_calls_pgvector.py` | Builds/updates chunked embeddings in Postgres for the Oz Demo RAG path. |
| `sauron-calls/scripts/rag_query_cli.py` | **CLI** mirroring Oz’s SQL retrieval (admin vs `--name` rep) + optional LLM answer; useful for debugging without the browser. |
| `frontend/vite.ozRagCallsApi.ts` | The **HTTP** entry the Oz SPA uses at runtime (same DB + embedding model concept as the CLI). |

**Why a separate folder:** Keeps **heavy synthetic call generation** and bulk JSON out of the CRM backend while still letting the **Oz** demo query the same logical dataset via Postgres.

---

## Quick comparison

| Concern | Oz Demo | Sauron CRM |
|--------|---------|------------|
| **Primary transport** | Vite middleware `/api/oz/*` | FastAPI `/api/chat` (+ entity routes) |
| **Auth** | None on demo APIs (local dev risk surface) | JWT bearer |
| **Model vendor** | OpenAI (proxied) | OpenRouter |
| **Retrieval** | File corpus + optional Brave; pgvector for Russin RAG | Transcript indexer / DB tools wired in `_chat_common` |
| **Tool calling** | No general tool loop in Oz; fixed endpoints per intent | Yes — SSE tool stream |

---

*Generated from the repository layout as of the authoring date; adjust paths if you refactor routers or rename env vars.*
