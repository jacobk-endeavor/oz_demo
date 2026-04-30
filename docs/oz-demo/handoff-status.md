# Oz handoff status and run instructions

Issue context: `Oz-Demo-0vl.15`.

This handoff note is for contributors picking up migration/cleanup work.

## Current handoff status

- Architecture boundaries are documented and should be treated as authoritative.
- Guardrails are wired in CI and available locally via `npm run guardrails:arch`.
- Migration + onboarding docs are now linked from both root `README.md` and `docs/README.md`.

## Before you change code

1. Read [`docs/oz-demo/migration-status-tracker.md`](./migration-status-tracker.md).
2. Read [`docs/module-ownership-map.md`](../module-ownership-map.md).
3. Confirm your target area in [`docs/oz-demo/contributor-change-map.md`](./contributor-change-map.md).
4. If the change affects architecture boundaries, update docs in this order:
   - ownership map
   - migration tracker
   - guardrails/deprecation ledger (as applicable)

## Local run + quality gates

From repo root:

```bash
npm run dev
npm run guardrails:arch
npm run validate
```

Use `npm run validate` before finalizing substantial migration changes.

## Handoff checklist for next contributor

- Confirm docs links are still valid from `README.md` and `docs/README.md`.
- Record new migration milestones in the tracker.
- Add deprecation entries for removed paths/bridges.
- If scope exceeds current issue, create a follow-up Beads issue with explicit acceptance criteria.
