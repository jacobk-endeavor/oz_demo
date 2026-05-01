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
- **Build command:** `npm run build`
- **Run command:** `npm start` (uses `vite preview --host 0.0.0.0` and `$PORT`; set **HTTP port** to **8080** unless your app uses a different `PORT`)
- **Health check:** path `/`

An example App Spec lives in [`.do/app.yaml`](.do/app.yaml). Point **GitHub** and **region** there to match your account if you fork or move the repo.

Keep real API keys in `.env` locally and set **ELEVENLABS_API_KEY** (and **OPENAI_API_KEY** if you use transcription) under the component’s environment variables in App Platform. Do not commit `.env`.
