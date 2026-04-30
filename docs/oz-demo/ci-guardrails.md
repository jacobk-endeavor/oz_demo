# Oz CI Guardrails

This document describes architectural guardrails enforced in CI for the Oz Demo migration.

## Run locally

```bash
npm run guardrails:arch
```

This command is also part of root `npm run validate`.

## Enforced checks

### 1) Forbidden frontend direct model calls

The guardrail scans `frontend/src` code and fails if new direct model-provider usage appears in frontend modules, including:
- provider endpoint literals like `https://api.openai.com` or `/v1/chat/completions`
- direct SDK usage like `new OpenAI(...)` or `import ... from 'openai'`
- frontend-authored provider `Authorization: Bearer ...` headers

Current temporary allowlist:
- `frontend/src/services/ozOpenAi.ts` (legacy bridge during migration)

### 2) Core architectural regressions (Oz transport + boundaries)

The guardrail enforces:
- Canonical transport path remains `/api/oz/chat` in:
  - `frontend/src/features/oz/ozChatClient.ts`
  - `backend/oz/viteOzChatApi.ts`
- Oz frontend production modules (`frontend/src/features/oz/**`, excluding `*.test.*`/`*.spec.*`) do **not**:
  - import backend runtime modules directly
  - call legacy endpoints (`/api/oz/openai`, `/api/oz/rag-calls`)
  - drift to Sauron transport (`/api/chat`)

## Fixing failures

For direct model-call violations:
- Move provider calls, orchestration, and prompt assembly behind backend/runtime endpoints.
- Keep frontend focused on transport client + rendering.

For transport/boundary violations:
- Route non-hardcoded Oz chat through `postOzChat` and `/api/oz/chat`.
- Remove direct backend imports from Oz frontend production code.
- Update tests/mocks instead of production transport constants when possible.

## CI wiring

- Root script: `guardrails:arch` in `package.json`
- CI workflow: `.github/workflows/architecture-guardrails.yml`
