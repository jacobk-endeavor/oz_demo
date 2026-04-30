# Module Ownership Map and Boundaries

This document defines who owns which modules during the Oz Demo cleanup migration and where logic must live going forward.

Related docs:
- [`docs/README.md`](./README.md)
- [`docs/oz-demo/migration-status-tracker.md`](./oz-demo/migration-status-tracker.md)
- [`docs/oz-demo/handoff-status.md`](./oz-demo/handoff-status.md)
- [`docs/oz-demo/contributor-change-map.md`](./oz-demo/contributor-change-map.md)
- [`docs/chat-routing-oz-demo-and-sauron.md`](./chat-routing-oz-demo-and-sauron.md)
- [`docs/naming-conventions.md`](./naming-conventions.md)

## Purpose

- Make frontend vs backend ownership explicit.
- Prevent new orchestration logic from being added to UI modules.
- Define the hardcoded-path vs agent-runtime boundary for prompts.
- Clarify migration implications for Wave 1 and follow-on tasks.

## Ownership Domains

### Frontend-owned (UI and deterministic workflow presentation)

Primary scope (examples):
- `frontend/src/app/*`
- `frontend/src/features/chat/*` (rendering/state/view-model only)
- `frontend/src/features/workflows/*` (deterministic, hardcoded workflow handlers)
- `frontend/src/shared/ui/*`

Frontend responsibilities:
- User interaction, routing, and UI state.
- Deterministic workflow branching that does not require model/tool orchestration.
- Calling the canonical chat API client/hook (single transport path).
- Rendering streamed events from backend without interpreting policy/tool internals.

Frontend must not own:
- Direct model-provider calls.
- Tool registry execution.
- Prompt assembly for non-hardcoded paths.
- Retrieval/memory/graph orchestration.

### Backend-owned (runtime, policy, tools, retrieval, integrations)

Primary scope (target shape):
- `backend/src/api/routers/*`
- `backend/src/agent/runtime/*`
- `backend/src/agent/policy/*`
- `backend/src/agent/prompts/*`
- `backend/src/agent/tools/*`
- `backend/src/agent/validators/*`
- `backend/src/agent/observability/*`

Backend responsibilities:
- Unified `POST /api/oz/chat` runtime entrypoint and stream contract.
- Model/tool orchestration loop and policy gating.
- Prompt construction for all non-hardcoded prompts.
- Data access adapters (RAG, memory, graph, CRM) and safety/validation.
- Traceability, event semantics, and operational telemetry.

Backend must not own:
- UI rendering concerns.
- Frontend routing or component-level state logic.

## Hardcoded vs Agent Boundary

This boundary is the decision point for every user turn.

- **Hardcoded path (frontend-owned behavior):**
  - Deterministic, predefined behavior.
  - No model/tool planning loop.
  - No backend agent tool invocation required beyond standard transport.
- **Agent path (backend-owned behavior):**
  - Any non-hardcoded prompt or reasoning flow.
  - Any turn requiring tool use, retrieval, memory, graph traversal, or policy checks.
  - Prompt/module selection and execution live in backend runtime.

Rule: if behavior cannot be fully described as deterministic UI logic, it is agent-path and belongs to backend orchestration.

## Request Flow Boundary (Authoritative)

1. Frontend captures user intent and sends normalized request through one chat client/hook.
2. Backend policy gate classifies turn as hardcoded-compatible or agent-required.
3. Backend executes runtime path and streams canonical events.
4. Frontend renders events and updates UI state only.

This keeps policy and orchestration decisions centralized and auditable.

## Migration Implications

### Immediate (Wave 1)

- `Oz-Demo-0vl.2`: Define canonical request and stream event schemas to enforce this boundary.
- `Oz-Demo-0vl.3`: Implement backend runtime skeleton and policy gate hook.
- `Oz-Demo-0vl.4`: Remove frontend endpoint fanout; route non-hardcoded chat through unified path.

### Follow-on (Waves 2-3)

- Migrate remaining non-hardcoded prompt branches out of frontend modules into backend runtime/prompt modules.
- Move retrieval logic (transcript RAG first, then memory/graph adapters) under backend tool registry.
- Expand CI guardrails as migration debt retires; baseline guardrails are now documented in [`docs/oz-demo/ci-guardrails.md`](./oz-demo/ci-guardrails.md).

### Transitional guidance

- Existing hardcoded frontend flows may remain temporarily if deterministic and isolated.
- Any modified or newly added non-hardcoded flow must be migrated to backend runtime before merge.
- During migration, prefer adapter/stub modules over embedding orchestration into route handlers or components.

## Ownership Decision Checklist

Use this checklist before adding or changing modules:

- Is this UI rendering, routing, or deterministic state behavior? -> frontend.
- Does this build prompts, select models, call tools, or access retrieval/memory/graph data? -> backend.
- Does this affect stream event protocol semantics? -> backend contract first, frontend consumer second.
- Does this introduce a second chat transport path? -> reject; consolidate into the canonical path.

## Acceptance Mapping for `Oz-Demo-0vl.1`

- `docs/module-ownership-map.md` exists. -> satisfied by this document.
- Frontend vs backend responsibilities explicitly defined. -> see Ownership Domains section.
- Migration boundary for non-hardcoded prompts documented. -> see Hardcoded vs Agent Boundary and Migration Implications.
