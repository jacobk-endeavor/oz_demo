# Environment And Editable Assets

## Framework Decision

Use Vite/React for the first implementation.

## Local Launch

Run the demo from the repository root:

```sh
npm run dev
```

The root command installs frontend dependencies when needed and starts Vite with `VITE_DEMO_MODE=true`. In this mode the Chat and Graph screens use seeded in-browser demo responses for `/api/chat`, `/api/chat/sessions`, and `/api/graph`, so the app is usable without a backend.

Future live API work can leave `VITE_DEMO_MODE` unset or set it to `false`. The frontend will call live `/api/*` routes first and only falls back to the seeded demo data for missing or non-JSON API responses, which covers the local Vite-only case.

Root validation commands (`npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`) also install frontend dependencies before delegating into `frontend/`.

## Defense

The first Oz + Nebula demo is primarily a polished, scripted web UI with hard-coded data. Vite keeps the app lightweight, fast to develop, and straightforward to deploy on DigitalOcean App Platform. Add a small Node service only when live AI, ElevenLabs, email, or file processing needs protected server-side API keys.

## Required API Keys

Fill these in inside `.env` when the implementation needs live services:

- `ELEVENLABS_API_KEY`: required for Oz voice generation.
- `ELEVENLABS_VOICE_ID`: required to select the Oz voice.
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`: required for live AI responses. Pick one primary provider for the first demo.

Optional keys:

- `RESEND_API_KEY`, `SENDGRID_API_KEY`, or `POSTMARK_API_KEY`: required only when report emails actually send.
- `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_ENDPOINT`, `DO_SPACES_BUCKET`, `DO_SPACES_REGION`: required only when storing generated reports, PDFs, uploads, or Excel files in DigitalOcean Spaces.

## Route Map Rule

The lead route map is mocked for the entire demo. Do not wire Mapbox, Google Maps, or any other mapping provider. The Lead Generation page renders the route as an ordered list of stops with travel time, talking points, and product angles. If the team later wants a real map, treat that as a follow-on workstream with its own scoped decision; do not add map provider keys to `.env` until that decision is made.

## ElevenLabs Voice Rule

Use ElevenLabs for Oz speech. Do not expose the ElevenLabs API key directly in browser code. The first build can use scripted audio or text-only mode, but live ElevenLabs generation should go through a server-side adapter.

## Editable Asset Files

Use `docs/oz-demo/assets/` as the source of truth for demo assets until the app implementation chooses its final `public/` or `src/data/` structure.

Key files:

- `fake-automation-source-document.pdf`: fake PDF for spec/quote/code automation demos.
- `hardcoded-demo-data.template.json`: editable customer, interaction, quote, lead, and report seed data.
- `generated-web-apps.template.json`: editable hard-coded generated app templates and feature add-ons.
- `excel-dashboard-mapping.template.json`: editable Excel sheet/column mapping for dashboard generation.
- `oz-speaking-orb-reference.png`: Oz speaking orb reference.
- `take-sales-to-space-reference.png`: brand mood reference.

## Excel-To-Dashboard Rule

The first demo should support a mocked Excel-to-dashboard path. The UI should let the user drop or select an Excel file, show a convincing parsed preview, and generate one of the hard-coded dashboards.

When the real Excel file is provided:

- Add it to the implementation asset/data folder.
- Map sheet names and columns into the dashboard contract.
- Keep a JSON mapping file next to the Excel file so the group can edit it without hunting through UI code.

## Hardcoding Rule

Keep hard-coded content in files that non-engineers can understand. Names, products, phone numbers, locations, prompt triggers, and app templates should live in JSON or Markdown before they live in React components.
