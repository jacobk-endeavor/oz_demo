# Oz + Nebula Demo

## Run Locally

From the repository root:

```bash
npm run dev
```

That single command installs the frontend dependencies if needed, then starts the Vite dev server.

Open the URL printed by Vite, usually:

```text
http://localhost:5173
```

## Useful Commands

```bash
npm run build
npm run preview
npm run guardrails:arch
npm run validate
```

**Knowledge Base file ingest (dev server)** uses Python `calls/kb/scripts/ingest_kb.py`. One-time setup:

```bash
cd calls/kb/scripts && python3 -m venv .venv && .venv/bin/pip install -r requirements-kb-ingest.txt
```

Then ensure repo-root `.env` has `DATABASE_URL` and `OPENAI_API_KEY` as in `.env.example`.

- `npm run build` checks TypeScript and creates a production build.
- `npm run preview` serves the production build locally.
- `npm run guardrails:arch` enforces Oz architecture boundaries (see `docs/oz-demo/ci-guardrails.md`).
- `npm run validate` runs architecture guardrails, typecheck, lint, tests, and build.

## Documentation

- Docs hub: [`docs/README.md`](docs/README.md)
- Chat internals + adding a new knowledge base: [`docs/oz-chat-internals-and-knowledge-base-extension.md`](docs/oz-chat-internals-and-knowledge-base-extension.md)
- Chat flow diagram: [`docs/oz-new-chat-flow-diagram.md`](docs/oz-new-chat-flow-diagram.md)
- Chat contract schema (`/api/oz/chat`): [`docs/oz-chat-contract-schema.md`](docs/oz-chat-contract-schema.md)
- CI guardrails: [`docs/oz-demo/ci-guardrails.md`](docs/oz-demo/ci-guardrails.md)

## DigitalOcean Prep

Use **one Web Service** for this repo root (not a static site only). Vite’s `vite preview` serves `dist/` **and** the `/api/oz/*` proxies defined in `frontend/vite.config.ts` (voice, OpenAI, etc.); a static component cannot run those routes.

- **Source directory:** `/` (repository root)
- **Build command:** `npm run build && bash scripts/deploy-setup-kb-ingest.sh` — the second step creates `calls/kb/scripts/.venv` on the build worker so **Knowledge Base file ingest** works in production (same as local). If your build image has no `python3`, set **`SKIP_KB_INGEST_SETUP=1`** in App Platform envs to skip (ingest endpoint will keep failing until you use an image with Python; see `Dockerfile` in-repo optional path below).
- **Run command:** `npm start` (uses `vite preview --host 0.0.0.0` and `$PORT`; set **HTTP port** to **8080** unless your app uses a different `PORT`)
- **Health check:** path `/`

**Environment variables (production):** set at least **ELEVENLABS_API_KEY** (voice), **OPENAI_API_KEY** (embeddings + chat), **DATABASE_URL** (or discrete **PG\*** fields) for transcript RAG and **KB document ingest** (`kb_rag_chunks`). Same contract as [`.env.example`](.env.example).

**Raw uploads** land under `incoming/kb-ui-raw/` on the instance filesystem (ephemeral on App Platform unless you attach a **volume**). For durable originals, plan object storage or a DB-backed pipeline later.

An example App Spec lives in [`.do/app.yaml`](.do/app.yaml). Point **GitHub** and **region** there to match your account if you fork or move the repo.

### Docker (alternative if `python3` is missing on the buildpack)

The repo includes a [`Dockerfile`](Dockerfile) with Node + Python so `deploy-setup-kb-ingest.sh` always runs. Point App Platform (or any host) at **Dockerfile** build instead of the default Node buildpack when KB ingest must work and the stock image lacks Python.

Keep real API keys in `.env` locally and set component environment variables in App Platform. Do not commit `.env`.
