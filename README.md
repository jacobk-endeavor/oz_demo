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
npm run validate
```

- `npm run build` checks TypeScript and creates a production build.
- `npm run preview` serves the production build locally.
- `npm run validate` runs typecheck, lint, tests, and build.

## DigitalOcean Prep

Use **one Web Service** for this repo root (not a static site only). Vite’s `vite preview` serves `dist/` **and** the `/api/oz/*` proxies defined in `frontend/vite.config.ts` (voice, OpenAI, etc.); a static component cannot run those routes.

- **Source directory:** `/` (repository root)
- **Build command:** `npm run build`
- **Run command:** `npm start` (uses `vite preview --host 0.0.0.0` and `$PORT`; set **HTTP port** to **8080** unless your app uses a different `PORT`)
- **Health check:** path `/`

An example App Spec lives in [`.do/app.yaml`](.do/app.yaml). Point **GitHub** and **region** there to match your account if you fork or move the repo.

Keep real API keys in `.env` locally and set **ELEVENLABS_API_KEY** (and **OPENAI_API_KEY** if you use transcription) under the component’s environment variables in App Platform. Do not commit `.env`.
