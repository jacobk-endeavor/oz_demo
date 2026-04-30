# Oz dead-path inventory and deprecation ledger

Issue: `Oz-Demo-0vl.11`

## Dead-path inventory (Oz-owned paths)

| Path / branch | Area | Status | Evidence |
| --- | --- | --- | --- |
| `#/files` hash alias | `frontend/src/app/workflows/workflowRouting.ts` | **Removed** | Single explicit remap branch (`hashPath === 'files'`) with no other route references in `frontend/src`. |
| `#/chat` / `#/graph` / `#/ingest` hashes | `frontend` routing | Dead fallback routes | Only covered as unknown-hash fallbacks in `frontend/src/App.test.tsx`; no registered pages or nav items. |
| Unified-chat migration fallback note | `frontend/src/features/oz/useOzChatStream.ts` | Candidate for later cleanup | Comment indicates temporary migration behavior for 404/405/501; keep until all deployment targets guarantee `/api/oz/chat`. |

## Deprecation ledger

### 2026-04-30 — Remove obsolete `#/files` route alias

- **Removed path:** `#/files`
- **Change:** Deleted the `hashPath === 'files' -> knowledge-base` compatibility branch from `getHashPage()`.
- **Safety rationale:** `#/files` had no remaining call sites or navigation links and existed only as a legacy alias branch.
- **Behavior after removal:** `#/files` now follows unknown-route behavior and resolves to `#/oz`.
- **Verification:** Updated route test coverage in `frontend/src/App.test.tsx` to assert fallback to `oz` for `#/files`.
