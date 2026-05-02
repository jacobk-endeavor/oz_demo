# Data Retention and Artifact Policy

This policy defines what should be committed to git versus treated as reproducible runtime/build artifacts for the Oz Demo repository.

## Scope

This policy applies to all paths in this repository: `frontend/`, `backend/`, `calls/lumberyard/`, `calls/sauron/` (the data ingestion folder), `scripts/`, and root-level config/docs.

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
- Ephemeral audio/transcript work products generated during local processing (for example under `calls/lumberyard/audio/` and `calls/sauron/audio/`).

## Retention expectations

- Default retention for generated artifacts is **zero** in git: regenerate locally or in CI when needed.
- If a generated file must be retained for reproducibility, document the reason and generation command in the owning module docs before commit.
- Before closing cleanup tasks, verify no new generated artifacts are tracked and that ignore rules cover common Oz runtime/build outputs.

## Runtime chat artifacts (DigitalOcean Spaces)

Generated exports intended for user download (see [code-sandbox-and-artifact-generation.md](code-sandbox-and-artifact-generation.md) §6.3) live in **Spaces**, not git.

### Artifacts bucket (`oz-artifacts-<env>`)

- **Object TTL (Spaces):** **30 days** for every object in the bucket. Provisioning in [`infra/spaces-artifacts/`](../infra/spaces-artifacts/) applies lifecycle rule `expire-generated-artifacts-30d` (`expiration.days = 30`), matching §6.3 in [code-sandbox-and-artifact-generation.md](code-sandbox-and-artifact-generation.md). Key layout and ops runbook: [docs/infra/oz-artifacts-spaces.md](infra/oz-artifacts-spaces.md).
- **Presigned URL TTL:** The backend mints time-limited presigned `GetObject` URLs for browser downloads. Default TTL is **1 hour** (override only by changing the mint-time parameter — see §6.3). Root Spaces credentials remain server-side; clients receive short-lived URLs only.

### Chat uploads bucket (`oz-uploads-<env>`)

- **Object TTL:** User uploads use a separate bucket with **24 h** retention intent, implemented as **1 day** S3-compatible lifecycle (minimum granularity on Spaces). See [infra/digitalocean/README.md](../infra/digitalocean/README.md) and §12.1.2 in [code-sandbox-and-artifact-generation.md](code-sandbox-and-artifact-generation.md).

### Redaction and safe exposure

- **Assistant output:** Sandbox / artifact tools must surface files using `<artifact …/>` (and panel tags where applicable); the model must **not** paste raw presigned URLs or bare download links — see guidance in [`backend/oz/ozChatToolRegistry.ts`](../backend/oz/ozChatToolRegistry.ts).
- **Tool audit logs:** With `OZ_TOOL_AUDIT=1`, each tool dispatch logs a one-line summary with **PII-redacted** `args_summary` (emails, phone-like runs) and truncated `result_summary` — see [docs/tool-call-paths.md](tool-call-paths.md). Treat this as defense in depth; do not pass secrets through tool arguments.

## Validation checklist

- `git status --short` has no unexpected generated files in Oz-owned paths.
- `.gitignore` includes current Oz runtime/build/cache patterns.
- Any exception to this policy is documented in the relevant module runbook.
