# ECL Frontend

React 19 + TypeScript + Vite 6 + Tailwind CSS 4 frontend for the ECL system.

## Quick start (end-to-end)

You need both the API backend and the Vite dev server running. Open two terminals
from the `impl/` directory:

**Terminal 1 — API backend**
```bash
cd impl
just dev-api
# Starts uvicorn on http://localhost:8000
```

**Terminal 2 — Vite dev server**
```bash
cd impl
just dev-frontend
# Starts Vite on http://localhost:5173
# Proxies /api/* → http://localhost:8000
```

Then open **http://localhost:5173** in a browser.  The sidebar provides three
routes:

| Hash | Page | What it calls |
|------|------|---------------|
| `#/chat` (default) | Chat | `POST /api/chat` |
| `#/graph` | Knowledge Graph | `GET /api/graph` |
| `#/ingest` | Ingest | _(stubbed — no API call yet)_ |

Or use the combined recipe if `just` supports background processes on your shell:

```bash
just dev   # runs API + frontend concurrently
```

## Development (frontend only)

```bash
# From the impl/ directory:
just dev-frontend

# Or directly inside frontend/:
cd frontend
npm install
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + build for production |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type-check only |
| `npm run test` | Run Vitest |
| `npm run preview` | Preview production build |

## Project structure

```
src/
  App.tsx                    # Root app + useHashRoute() + hash-based routing
  main.tsx                   # React entry point
  shared/
    api/client.ts            # Typed fetch wrapper (get, post, stream)
    styles/index.css         # Tailwind 4 + base styles
    ui/
      AppShell.tsx           # Layout: sidebar + main content area
      Sidebar.tsx            # Dark sidebar with Chat / Graph / Ingest nav
      Button.tsx             # primary / secondary / ghost variants
      Panel.tsx              # Rounded card with optional header
      icons.tsx              # Inline SVG icon components
  features/
    chat/                    # ChatPage — POST /api/chat, MessageList, CitationPills
    graph/                   # GraphPage — GET /api/graph, force-directed canvas
    ingest/                  # IngestPage — FileDropzone + CategoryPicker (stubbed)
```

## Routing

Hash-based routing with no external router library.  `useHashRoute()` in
`App.tsx` listens for `hashchange` events and returns the active `Page`.

Supported routes: `#/chat` (default), `#/graph`, `#/ingest`.

## Vite proxy

In development, all `/api/*` requests are forwarded to `http://localhost:8000`
(the FastAPI backend) — see `vite.config.ts`.  No CORS workarounds needed.

## Tests

```bash
npm run test          # vitest — all *.test.tsx files
```
