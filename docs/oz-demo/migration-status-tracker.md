# Oz migration status tracker

Issue context: `Oz-Demo-0vl.15` (docs publication and handoff).

This tracker summarizes current migration state for the Oz architecture breakup and where follow-on work should land.

## Snapshot (current state)

- Unified Oz chat transport is `POST /api/oz/chat` for the canonical path.
- CI guardrails are active to prevent architecture backslide (`npm run guardrails:arch`).
- Legacy/dead route cleanup has started and is recorded in the deprecation ledger.
- `Sauron/` remains a separate product surface and is out of scope for Oz-only migration edits.

## Milestone status

| Milestone | Status | Evidence |
| --- | --- | --- |
| Ownership boundaries documented | Done | [`docs/module-ownership-map.md`](../module-ownership-map.md) |
| CI guardrails enforcing boundaries | Done | [`docs/oz-demo/ci-guardrails.md`](./ci-guardrails.md) |
| Dead-path inventory + deprecations tracked | In progress | [`docs/oz-demo/deprecation-ledger.md`](./deprecation-ledger.md) |
| Docs handoff + onboarding publication | Done | this tracker + linked handoff docs |

## Open migration threads

- Continue retiring temporary migration fallbacks once all deployment targets reliably support `/api/oz/chat`.
- Keep moving any non-deterministic orchestration behavior out of frontend modules and into backend runtime boundaries.
- Add deprecation ledger entries whenever route aliases, fallback adapters, or temporary bridges are removed.

## How to update this tracker

When migration state changes:

1. Update the "Snapshot" bullets with current reality.
2. Update Milestone statuses and evidence links.
3. Add/remove open migration threads.
4. Cross-link any new docs from [`docs/README.md`](../README.md).
