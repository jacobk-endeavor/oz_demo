# Naming Conventions (Oz Demo First Pass)

This document centralizes naming guidance for the Oz-side cleanup and captures the first-pass, low-risk renames completed under `Oz-Demo-0vl.9`.

## Scope and Guardrails

- This pass is intentionally conservative: naming consistency only, no behavior changes.
- `Sauron/**` is out of scope for these renames and remains unchanged.
- Prefer aliases or incremental call-site updates when a full file rename would add avoidable churn.

## Canonical Rules

- Use `OpenAI` (all-caps acronym) in identifiers, types, and function names.
  - Good: `fetchOpenAIChatCompletion`, `isOpenAIConfigured`, `OzOpenAIMessage`
  - Avoid for new code: `fetchOpenAiChatCompletion`, `isOpenAiConfigured`, `OzOpenAiMessage`
- Use `RAG` (all-caps acronym) in symbols where applicable.
- Keep domain prefixing for Oz demo service symbols (`Oz*`) when they are app-specific.
- Use explicit suffixes by module role:
  - `*Client` for browser HTTP wrappers
  - `*Intent` / `*Intents` for intent matchers
  - `*Model` for deterministic state transforms
  - `*Context` for prompt/context builders
  - `*Page`, `*Panel`, `*Shell`, `*View` for UI surfaces

## First-Pass Renames Applied

Oz service API and call sites were standardized to `OpenAI` acronym casing:

- `isOpenAiConfigured` -> `isOpenAIConfigured`
- `fetchOpenAiChatCompletion` -> `fetchOpenAIChatCompletion`
- `fetchOpenAiJsonObject` -> `fetchOpenAIJsonObject`
- `OzOpenAiRole` -> `OzOpenAIRole`
- `OzOpenAiMessage` -> `OzOpenAIMessage`
- `OpenAiChatOptions` -> `OpenAIChatOptions`

To minimize migration risk, backward-compatible aliases remain exported in `frontend/src/services/ozOpenAi.ts` during this transition window.

## Follow-ups (Not in this pass)

- Consider renaming `frontend/src/services/ozOpenAi.ts` to `ozOpenAI.ts` after coordinating a wider import/path update.
- Expand naming normalization for `RAG`/`API` acronym casing in additional modules as dedicated small issues.
