# Agent Loop Migration Outline for Oz Demo

This document specifies how to evolve Oz Demo from mostly branch-routed LLM calls into a Sauron-style server-side agent loop for all non-hardcoded flows, while adding a memory layer and knowledge-graph traversal.

## 1) Target behavior

### What should happen

- Keep hardcoded demo-critical intents deterministic (existing product dashboard, competitor board setup, explicit workflow opens).
- Route all other prompts through one server-side agent runtime with bounded tool rounds.
- Make retrieval first-class tools: transcript RAG, structured DB lookups, web, and graph traversal.
- Add memory on top of RAG so the agent can use:
  - short-term session memory,
  - long-term user/org memory,
  - knowledge graph navigation (P1).

### What should not happen

- Do not let the browser choose endpoint-per-intent for open-ended prompts.
- Do not couple prompt assembly to many frontend branches.
- Do not rely on one-shot fallback prompts for general questions.

---

## 2) Current state (specific to this repo)

### Current Oz pattern

- `frontend/src/App.tsx` is the primary prompt router (`onUserMessage`) with ordered branch checks.
- `frontend/src/services/ozOpenAi.ts` issues direct `/api/oz/openai` calls for generic polish/chat.
- `frontend/vite.ozRagCallsApi.ts` is a dedicated RAG endpoint used only in specific fallback conditions.
- `frontend/src/features/lumberyard/lumberyardClient.ts` calls separate intel APIs with dedicated prompting.
- Result: multiple fixed lanes, each with its own retrieval and prompt shape.

### Current Sauron pattern (reference)

- `Sauron/backend/app/routers/chat.py` accepts one chat endpoint and streams SSE.
- `Sauron/backend/app/services/_chat_common.py` defines tools + execution dispatch.
- `Sauron/backend/app/services/_openrouter.py` runs bounded tool rounds.
- Result: one server-led loop, tool-backed evidence gathering, then answer synthesis.

---

## 3) Proposed target architecture

```text
Browser (OzAssistantPanel)
  -> POST /api/oz/chat
      -> oz_chat_router (persist + stream)
          -> oz_agent_runtime
              -> policy gate (hardcoded vs agent)
              -> tool loop (RAG, DB, web, memory, graph)
              -> response validator
              -> stream tokens + tool events
```

### Policy split

1. **Hardcoded policy path (deterministic)**  
   Existing explicit intents stay in deterministic handlers.
2. **Agent policy path (default for non-hardcoded)**  
   Use the agent loop for everything else.

This preserves guaranteed UI outcomes for known demo flows while scaling open-ended intelligence.

---

## 4) LLM calling contract (new standard)

Implement one common call envelope for all agent turns.

## Request contract (frontend -> backend)

```json
{
  "message": "user text",
  "conversation_id": "optional uuid",
  "scope": {
    "mode": "oz_admin | rep",
    "rep_name": "optional"
  },
  "ui_context": {
    "page": "oz|leadGen|...",
    "attachments": ["optional row context labels"],
    "hardcoded_action_taken": false
  }
}
```

## Stream contract (backend -> frontend)

SSE events (or structured chunk stream):

- `token` -> model output text delta
- `tool_call` -> name + arguments
- `tool_result` -> summarized result metadata
- `trace` -> policy/router decisions
- `done` -> final payload + usage + citations

Frontend should render tool activity similarly to Sauron tool groups.

---

## 5) Tooling model for Oz agent loop

Define tools in backend, not in frontend branches.

### Core tools (Phase 1)

- `search_transcripts(query, scope, top_k)`
- `read_transcript(call_id | chunk_id)`
- `query_lead_table(filters, sort, limit)`
- `get_customer_activity(filters)`
- `web_search(query)` (optional by key/role)
- `memory_recall(query, namespace, k)`
- `memory_write(fact, confidence, namespace, source_ref)`
- `graph_neighbors(node_id, edge_types, depth)`
- `graph_search(query, entity_types, max_nodes)`

### Constraints

- Tool allowlist based on role + page + prompt class.
- Max tool rounds (start with 4-6).
- Max tool calls per round (start with 2-4).
- Timeout and token budget per turn.
- Mandatory citations for claims derived from tools.

---

## 6) RAG handling changes

### Current issue

RAG is currently called from specific branches (for example conversational fallback in `App.tsx`) rather than as a first-class retrieval tool inside one loop.

### New design

Treat RAG as one of the agent tools:

1. Agent decides when to call `search_transcripts`.
2. Runtime executes retrieval against pgvector and returns chunk metadata + snippets.
3. Agent may call `read_transcript` for deeper evidence.
4. Final response must cite `call_id`/chunk provenance.

### Retrieval pipeline standard

- Embeddings: standardize on one embedding model per index version.
- Chunk schema: include `chunk_id`, `call_id`, `speaker`, `timestamp`, `owner_user_id`, tags.
- Ranking: vector score + optional metadata rerank.
- Guardrails: scope filter always enforced server-side, never trusted from client.

---

## 7) Memory + knowledge graph layer (P1 integration)

Add memory as a separate layer that complements RAG.

### Memory tiers

1. **Working memory (session)**  
   Recent decisions/preferences in current conversation.
2. **Semantic memory (long-term)**  
   Durable facts about user/org/workflows, with confidence and provenance.
3. **Episodic memory (event log)**  
   Timestamped interaction summaries and outcomes.

### Knowledge graph role

Use graph as a traversal substrate for connected entities and relationships:

- nodes: companies, reps, products, competitors, calls, intents, playbooks
- edges: mentioned_in, competes_with, sold_by, interested_in, owns_account, similar_to

### How memory + graph integrate with the loop

1. On each prompt, runtime performs lightweight memory retrieval seed:
   - `memory_recall(query=message, namespace=user/org)`
2. If needed, agent calls graph tools:
   - `graph_search` to locate relevant entities,
   - `graph_neighbors` to traverse relationships.
3. Runtime fuses evidence:
   - RAG snippets + memory facts + graph paths.
4. Agent answers with explicit provenance markers:
   - transcript citation,
   - memory fact id,
   - graph node/edge refs.
5. Post-answer writer:
   - extract stable facts,
   - run confidence filter,
   - write accepted facts via `memory_write`.

### Default memory write policy (Oz runtime scaffold)

- Minimum write confidence: `0.80`
- Required provenance keys: `source_type`, `source_id`
- Default retention TTL: `30 days`
- Maximum retention TTL without override: `180 days`
- Writes that fail these constraints are rejected by policy guardrails.

### Suggested storage model

- `memory_items` table:
  - `id`, `namespace`, `fact_text`, `embedding`, `confidence`, `source_type`, `source_ref`, `created_at`, `expires_at`
- `memory_links` table:
  - `memory_id`, `entity_node_id`, `relation_type`
- graph store:
  - PostgreSQL graph tables or external graph db (Neo4j/Neptune) behind tool adapters.

---

## 8) Required repo changes (specific)

### 8.1 Clean frontend/backend split and labeling

Use a clear "UI shell vs agent platform" boundary so contributors know where logic belongs.

### Boundary rule (authoritative)

- Frontend owns presentation, local UI state, and deterministic UI-only actions.
- Backend owns orchestration, prompts, tool selection/execution, memory, RAG, graph traversal, and policy validation.
- No new business logic branches in `App.tsx` for non-hardcoded prompts.

### Recommended package layout

```text
frontend/
  src/
    app/                      # app bootstrapping + route shell only
    features/
      chat/
        components/           # transcript, tool-call UI, composer
        hooks/                # useOzChatStream, useConversation
        clients/              # typed API client only (/api/oz/chat)
        types/                # shared FE chat DTOs
      workflows/              # deterministic workflow UIs (hardcoded)
      dashboards/
      leadGen/
    shared/
      ui/
      lib/                    # pure UI helpers only

backend/                      # new service root (preferred) OR vite server modules
  src/
    api/
      routers/
        oz_chat.ts            # POST /api/oz/chat (stream)
        oz_health.ts
    agent/
      runtime/                # loop engine, round control, stream adapter
      policy/                 # deterministic-vs-agent gate, tool allowlists
      prompts/                # system prompt builders (versioned)
      tools/
        rag/
        memory/
        graph/
        crm/
      validators/             # output schema, citation checks, safety
      observability/          # traces, metrics, eval hooks
    data/
      repositories/           # db access adapters
      models/
```

If creating a top-level `backend/` is not feasible immediately, mirror this structure under `frontend/server/` (or existing Vite middleware area) and later extract.

### Naming conventions (reduce ambiguity)

- Use `ozChat` for transport endpoints and clients:
  - `POST /api/oz/chat`
  - `useOzChatStream`
  - `ozChatClient.ts`
- Use `agentRuntime` for loop internals:
  - `agentRuntime.ts`, `agentPolicy.ts`, `agentToolRegistry.ts`
- Use explicit tool prefixes:
  - `ragSearchTranscripts`, `memoryRecall`, `graphNeighbors`, `crmGetCompanyInfo`
- Use suffixes consistently:
  - `*Router` for HTTP handlers
  - `*Service` for orchestration units
  - `*Repository` for DB access
  - `*Adapter` for external systems (OpenAI/OpenRouter/Brave/Graph DB)

### Ownership map (what moves out of frontend)

- Move prompt-building and retrieval orchestration out of:
  - `frontend/src/App.tsx`
  - `frontend/src/services/ozOpenAi.ts` (except thin client wrappers)
  - route-specific frontend LLM orchestration files
- Keep in frontend:
  - intent-triggered visual actions (open panel, focus tab, set local filters)
  - rendering streamed output and tool activity
- Move to backend:
  - all final prompt assembly
  - tool routing + retries + backoff
  - memory write policy
  - graph traversal guardrails

### Contract-first development pattern

- Define shared DTOs once (request/stream events/tool payloads).
- Generate or share types between frontend and backend.
- Enforce backward-compatible versioning:
  - `x-oz-chat-contract-version` header
  - explicit deprecation window for stream event changes.

### Practical cleanup mapping from current files

- `frontend/src/App.tsx`
  - Keep: hardcoded deterministic intents and page/panel state transitions.
  - Remove over time: non-hardcoded prompt branching and endpoint fanout.
- `frontend/src/services/ozOpenAi.ts`
  - Convert to low-level model adapter used by backend runtime (or deprecate in FE).
- `frontend/vite.ozRagCallsApi.ts`
  - Refactor into `backend/src/agent/tools/rag/*` (or mirrored server folder).
- `frontend/src/features/ragCalls/ragCallsClient.ts`
  - Fold into generic `ozChatClient` except for optional diagnostics UI.
- `frontend/src/shared/ui/OzAssistantPanel.tsx`
  - Add typed rendering for `tool_call`, `tool_result`, `trace`.

This split makes PRs cleaner: UI changes stay UI-only, while intelligence changes stay in agent modules with tests and evals.

## Backend additions (new)

- Add `frontend/vite.ozChatApi.ts` (or move to dedicated backend service) with:
  - `POST /api/oz/chat` streaming endpoint,
  - conversation state + trace id,
  - tool loop runtime and policy gate.
- Add `frontend/src/features/oz/agent/` (or backend-equivalent package):
  - `tools.ts` (schemas),
  - `toolExecutor.ts`,
  - `runtime.ts` (loop),
  - `policy.ts` (hardcoded-vs-agent gate),
  - `validators.ts`.
- Add memory/graph tool adapters:
  - `memoryStore.ts`, `graphStore.ts`.

## Frontend changes (modify existing)

- `frontend/src/shared/ui/OzAssistantPanel.tsx`:
  - add support for streamed `tool_call` and `tool_result` events.
- `frontend/src/App.tsx`:
  - keep hardcoded handlers only,
  - replace most direct LLM endpoint calls with one fallback to `/api/oz/chat`.
- `frontend/src/services/ozOpenAi.ts`:
  - deprecate direct conversational usage in favor of backend runtime client.
- `frontend/src/features/ragCalls/ragCallsClient.ts`:
  - fold into generic tool-backed chat path; keep direct endpoint only for diagnostics.

## Optional alignment with Sauron code

- Extract a shared loop utility patterned after:
  - `Sauron/backend/app/services/_chat_common.py`
  - `Sauron/backend/app/services/_openrouter.py`
- Keep model provider abstraction so Oz can use OpenAI/OpenRouter interchangeably.

---

## 9) Prompting strategy in the new loop

### System prompt layers

1. Global assistant behavior (tone, truthfulness, citation requirement).
2. Domain policy (Oz workflow constraints).
3. Tool policy (when to retrieve before answering).
4. Scope policy (admin vs rep filters).
5. Output contract policy (format + safety checks).

### Example policy text pattern

- "For factual claims, call retrieval tools first unless claim is directly in recent tool outputs."
- "If confidence is low, ask one concise clarification."
- "Never infer cross-rep comparisons in rep-scoped mode."
- "Cite transcript call IDs and memory/graph refs for non-trivial assertions."

---

## 10) Deterministic guarantees with an agent loop

To guarantee outcomes for certain prompts at scale:

- Add an intent classifier before tool loop.
- Map guaranteed intents to deterministic workflows.
- For those workflows, use the model only in bounded slots (summarize, rephrase).
- Validate output against strict schema.
- If validation fails, auto-repair or fail closed with deterministic fallback.

This gives Sauron-style flexibility for open prompts while preserving hard guarantees where required.

---

## 11) Phased rollout plan

### Phase 0: Observability first

- Add tracing for current Oz prompt branches.
- Log which branch handled each turn and why.
- Capture latency, tool usage, retrieval hit rate, answer quality outcomes.

### Phase 1: Introduce `/api/oz/chat` with minimal tools

- Tools: transcript search/read + lead/customer data read tools.
- Keep existing deterministic handlers untouched.
- Route only non-hardcoded prompts to new endpoint.

### Phase 2: Memory layer

- Add `memory_recall` and post-turn memory write pipeline.
- Add memory quality filters and TTL policy.

### Phase 3: Knowledge graph (P1)

- Add graph tools with scoped traversal limits.
- Add evidence fusion/rerank combining RAG + memory + graph.
- Add graph-aware prompts for relationship-centric questions.

### Phase 4: Consolidation

- Remove duplicated endpoint-specific prompting logic.
- Keep only:
  - deterministic hardcoded handlers,
  - one agent runtime,
  - tool adapters.

---

## 12) Concrete before/after examples

### Example A: Non-hardcoded analytics question

Current:

- `App.tsx` may route to rule fallback, then optional RAG fallback, then OpenAI polish.

Target:

- `App.tsx` sends to `/api/oz/chat`.
- Agent calls:
  1. `search_transcripts`
  2. `query_lead_table`
  3. optional `memory_recall`
- Agent returns answer with citations and confidence.

### Example B: Competitor relationship question with KG

Current:

- Separate competitor flow and custom endpoint behavior.

Target:

- Deterministic handler opens competitor panel if exact hardcoded intent is matched.
- Otherwise, agent loop handles nuanced query:
  1. `graph_search("product X competitors")`
  2. `graph_neighbors(node=productX, edge=competes_with, depth=2)`
  3. `search_transcripts` for evidence
  4. response with graph path + transcript citations.

### Example C: User preference memory

Current:

- Preferences are mostly implicit in short-term UI context.

Target:

- Runtime calls `memory_recall` at turn start.
- After response, extractor writes stable preference facts (`memory_write`) with source.
- Future turns retrieve those preferences automatically.

---

## 13) Risks and controls

- **Tool explosion risk** -> enforce tool budgets and per-intent allowlists.
- **Hallucinated memory facts** -> only write memory from validated sources/tool outputs.
- **Graph drift/incorrect edges** -> versioned graph ingestion and confidence weights.
- **Latency growth** -> parallel tool execution, cached retrieval, early-stop criteria.
- **Prompt regressions** -> eval suite with required tool-sequence and citation checks.

---

## 14) Definition of done

- Non-hardcoded prompts are handled by `/api/oz/chat` agent runtime.
- Hardcoded intents retain deterministic UX outcomes.
- RAG is a tool, not a special fallback endpoint path.
- Memory retrieval/write is active with governance.
- Knowledge graph traversal is available via tools and cited in answers.
- Metrics dashboard shows latency, correctness proxy, citation coverage, and fallback rates.
