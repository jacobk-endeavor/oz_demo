# Oz + Nebula Frontend

React 19 + TypeScript + Vite 6 + Tailwind CSS 4 frontend for the Oz + Nebula demo.

## Quick Start

From the repository root:

```bash
npm run dev
```

This installs frontend dependencies if needed and starts Vite on **http://localhost:5173**.

## Routes

Hash-based routing, no router library. `useHashRoute()` in `App.tsx` listens for `hashchange`.

| Hash | Page |
|------|------|
| `#/oz` (default) | Oz home |
| `#/nebula` | Nebula workflow hub |
| `#/field-notes` | Voice field notes |
| `#/call-mining` | Interaction intelligence table |
| `#/dashboards` | Dashboard generator |
| `#/quote-automation` | Quote review workspace |
| `#/lead-generation` | Lookalike leads + route preview |
| `#/reports` | Weekly digest report builder |

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
  App.tsx                       # Root app, hash routing, page meta
  main.tsx                      # React entry point
  shared/
    styles/index.css            # Tailwind 4 + base styles
    ui/                         # OzWorkflowShell, Panel, Button, Tag,
                                # PulseOrb, Modal, OzAssistantPanel, etc.
  features/
    oz/                         # OzHomePage + NebulaHubPage
    fieldNotes/                 # Voice field notes module
    callMining/                 # Interaction table + Oz queries
    dashboardGenerator/         # Prompt-driven dashboard with templates
    quoteAutomation/            # Quote review + task rail
    leadsReports/               # Lead generation + reporting
```

## Tests

```bash
npm run test
```
