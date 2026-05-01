# Oz Demo documentation hub

## Architecture and chat

- [Oz chat internals + adding a new knowledge base](./oz-chat-internals-and-knowledge-base-extension.md) — how a chat turn flows through `/api/oz/chat`, what the runtime tools are, and where to plug in a new KB.
- [Oz chat flow diagram](./oz-new-chat-flow-diagram.md) — Mermaid diagram of the end-to-end path.
- [Oz chat contract schema](./oz-chat-contract-schema.md) — request payload + SSE event protocol for `/api/oz/chat`.

## Operations

- [Oz CI guardrails](./oz-demo/ci-guardrails.md) — what `npm run guardrails:arch` enforces.
- [Data retention and artifact policy](./data-retention-and-artifact-policy.md) — what belongs in git vs. regenerated locally.

## Operator / demo runbooks

- [Oz chat demo runbook](./oz-demo/chat-runbook.md) — `#/oz` chat scripts, intents, and reset mechanics.
- [Voice + chat demo runbook](./oz-demo/demo-runbook.md) — Field App orb scripts and the Home chat paste-list.
- [Prompt cookbook (`#/oz` Q&A)](./oz-demo/runbook.md) — what the system answers well and what falls through.
