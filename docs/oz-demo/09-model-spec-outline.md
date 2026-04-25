# Model Spec Outline

Use this file as compact context for future model sessions that need to understand or implement the Oz + Nebula demo.

## One-Line Product Description

Oz + Nebula is a voice-first web demo where a sales AI assistant converts field notes, calls, emails, specs, and sales data into insights, dashboards, quotes, leads, routes, and recurring reports.

## Hard Requirements

- Web UI only for first implementation.
- DigitalOcean-compatible architecture, preferably deployable on DigitalOcean App Platform first.
- Use Vite/React.
- Use hard-coded demo data first.
- Use `assets/oz-speaking-orb-reference.png` as the Oz speaking orb visual reference.
- Use ElevenLabs for Oz voice synthesis.
- Use black, red, white, blue, space, parallax, shimmer, and glass styling.
- Do not build inside any existing `frontend` folder unless explicitly requested later.
- Every workflow must end in a concrete sales action.

## Core Product Entities

```ts
type Medium = "note" | "call_center" | "email";
type LocationTag = "zoom" | "phone_call" | "in_person";

type Customer = {
  id: string;
  name: string;
  location: string;
  segment: string;
  currentRep: string;
};

type Interaction = {
  id: string;
  customerId: string;
  representative: string;
  date: string;
  medium: Medium;
  locationTag: LocationTag;
  topic: string;
  complaint?: string;
  productRequested?: string;
  competitorMentioned?: string;
  transcriptExcerpt: string;
  suggestedAction: string;
  confidence: number;
};

type BackgroundTask = {
  id: string;
  label: string;
  status: "queued" | "running" | "complete" | "blocked";
};
```

## App Pages

- `/`: hero or Oz home.
- `/oz`: persistent assistant and voice/orb surface.
- `/nebula`: workflow hub.
- `/field-notes`: voice notes and meeting prep.
- `/call-mining`: interaction intelligence table.
- `/dashboards`: generated dashboard.
- `/quotes`: quote automation and pricing draft.
- `/leads`: lead generation and route planning.
- `/reports`: report generation and scheduling.

## Global Layout

- Left sidebar navigation.
- Main workflow canvas.
- Right Oz assistant panel.
- Optional background task rail.

## Oz Orb States

- `idle`: soft pulse.
- `listening`: expanded particle ring.
- `thinking`: tighter rotating mesh and shimmer.
- `speaking`: rhythmic pulse and streaming text.
- `running_action`: task rail visible and main canvas updates.

## Workflow Contracts

### Field Notes

Input: voice memo, customer, rep, context.

Output: structured note, follow-up questions, upsell/cross-sell, pricing guidance, web action.

Primary action: push recommendation/specs to web app.

### Call Mining

Input: notes, calls, emails, and location tags.

Output: table, ranked insights, evidence rows, recommended actions.

Primary action: generate dashboard, quote, lead list, or report from insight.

Required location tags: Zoom, phone call, and in person. Each row must show a visible colored-dot chip.

### Dashboard Generation

Input: natural language dashboard prompt or Excel upload.

Output: template-based dashboard modules, hard-coded generated web apps, charts, primary insight, recommended actions.

Primary action: ask Oz follow-up or export/report insight.

The dashboard page must include a Lovable-style chatbot that can hard-code generation of three or four web apps and simulate adding AI chat, dynamic graph generation, and Excel-to-dashboard features.

### Quote Automation

Input: voice memo, specs, pricing template, customer context.

Output: 80%-complete quote, line items, assumptions, missing information, upsell/cross-sell.

Primary action: rep review.

Use `assets/fake-automation-source-document.pdf` as the placeholder source document.

### Lead Generation

Input: customer profile, location, similarity criteria.

Output: prospect table, contact info, similarity reasons, route.

Primary action: visit/call prospects.

### Reporting

Input: selected insights, cadence, recipients.

Output: weekly sales intelligence digest.

Primary action: send or schedule report.

## Demo Data Needed

- 20 customers.
- 8 reps.
- 60 interactions across notes, calls, and emails.
- 10 requested product categories.
- 5 competitors.
- 8 complaint categories.
- 10 lead prospects.
- 3 quote templates.
- 3 report templates.
- 3 or 4 generated web app templates.
- Editable JSON assets for demo data and app templates.
- Editable Excel dashboard mapping file.

## Environment Variables

Required for live voice:

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`

Required for live AI:

- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

Optional:

- Email provider key for report sending.
- DigitalOcean Spaces keys for storing generated/uploaded files.

The route map is mocked for the demo. Do not add Mapbox or Google Maps keys.

## Implementation Bias

Prefer deterministic scripted flows over live AI for the first demo. Add real AI behind the same contracts later. The UX should look intelligent before the backend is intelligent.

## Quality Bar

The demo should feel:

- Executive-ready.
- Fast.
- High-contrast.
- Traceable.
- Sales-action oriented.
- More like a command center than a CRM plugin.
