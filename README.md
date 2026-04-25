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

The first DigitalOcean App Platform deployment should use the `frontend/` app as the build target:

- Build command: `npm run build`
- Run/preview command for static preview: `npm run preview`
- Frontend source directory: `frontend`

Keep real API keys in `.env` locally and DigitalOcean environment variables in App Platform. Do not commit `.env`.
