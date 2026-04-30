# Contributor change map: where to change what

Issue context: `Oz-Demo-0vl.15`.

Use this map to decide where changes belong during migration. If a change does not fit deterministic UI behavior, route it to backend-owned runtime boundaries.

## Fast routing rules

- UI rendering, page state, deterministic workflow presentation -> `frontend/src/**`
- Oz runtime policy/orchestration/tool boundaries -> `backend/**`
- Sauron CRM product code -> `Sauron/**` (separate product surface; only touch when task explicitly targets Sauron)
- Migration policy/ownership docs -> `docs/**`

## Common change intents

| Intent | Primary location | Do not do |
| --- | --- | --- |
| Update chat UI behavior or display state | `frontend/src/features/oz/**`, `frontend/src/shared/ui/**` | Add provider/tool orchestration logic directly in UI modules |
| Change Oz chat transport contract | `backend/oz/**` + `frontend/src/features/oz/ozChatClient.ts` | Introduce a second production transport path |
| Update architecture boundaries/rules | `docs/module-ownership-map.md`, `docs/oz-demo/ci-guardrails.md` | Leave boundary changes undocumented |
| Track removals and temporary bridges | `docs/oz-demo/deprecation-ledger.md` | Remove paths without ledger entries |
| Update migration progress/handoff | `docs/oz-demo/migration-status-tracker.md`, `docs/oz-demo/handoff-status.md` | Keep status only in chat threads |

## Documentation linkage requirements

When adding or changing migration docs:

1. Link them from [`docs/README.md`](../README.md).
2. Ensure root [`README.md`](../../README.md) points to the docs hub.
3. Update cross-links in ownership or runbook docs where contributors will naturally look.
