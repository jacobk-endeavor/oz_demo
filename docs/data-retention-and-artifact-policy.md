# Data Retention and Artifact Policy

This policy defines what should be committed to git versus treated as reproducible runtime/build artifacts for the Oz Demo repository.

## Scope

This policy applies to all paths in this repository: `frontend/`, `backend/`, `lumberyard-calls/`, `sauron-calls/` (the data ingestion folder), `scripts/`, and root-level config/docs.

## Retain in git

- Source code, checked-in configuration, docs, and deterministic seed/reference datasets required to reproduce demo behavior.
- Non-secret examples (for example, `.env.example`) and schema-like metadata.
- Curated synthetic input artifacts that are intentional fixtures, not runtime outputs.

## Do not retain in git

The following are treated as disposable artifacts and must be ignored or removed when generated:

- Local secrets and environment files (except committed examples).
- Python and Node runtime caches (`__pycache__`, `.venv`, `node_modules`, test/build caches).
- Build outputs (`dist`, SSR bundles, temporary reports, coverage outputs).
- Logs, lock/runtime socket files, and temporary extraction/work directories.
- Ephemeral audio/transcript work products generated during local processing (for example under `lumberyard-calls/audio/` and `sauron-calls/audio/`).

## Retention expectations

- Default retention for generated artifacts is **zero** in git: regenerate locally or in CI when needed.
- If a generated file must be retained for reproducibility, document the reason and generation command in the owning module docs before commit.
- Before closing cleanup tasks, verify no new generated artifacts are tracked and that ignore rules cover common Oz runtime/build outputs.

## Validation checklist

- `git status --short` has no unexpected generated files in Oz-owned paths.
- `.gitignore` includes current Oz runtime/build/cache patterns.
- Any exception to this policy is documented in the relevant module runbook.
