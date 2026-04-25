# Product Architecture

## Product Shape

Oz + Nebula should be built as a DigitalOcean-ready web application with three conceptual layers:

1. **Oz Assistant Layer**: persistent conversational interface, voice simulation, scripted prompts, and insight generation.
2. **Nebula Workflow Layer**: dedicated screens for field notes, call mining, dashboards, quotes, lead generation, and reports.
3. **Demo Data Layer**: hard-coded sales, call, customer, product, competitor, quote, and lead data that can later be swapped for real integrations.

## Opinionated Decision

Build one cohesive web app, not separate mobile and desktop apps.

## Defense

The demo needs to survive presentation conditions: unreliable microphones, unknown Wi-Fi, investor/customer screen sharing, and rapid copy changes. A single web app gives maximum control. The “mobile voice app” should be represented as a mobile-shaped panel inside the web UI, not as a separate native app. This keeps the story intact without splitting engineering effort.

## Core App Regions

- **Left Sidebar**: brand, navigation, workflow status, and “Nebula” point solutions.
- **Main Canvas**: current workflow surface, table, dashboard, quote preview, or route map.
- **Right Oz Panel**: persistent assistant with contextual Q&A and generated recommendations.
- **Background Agent Rail**: visible async jobs such as “Reviewing specs,” “Mining calls,” and “Preparing report.”

## System Boundaries

### In Scope For Demo

- Web UI only.
- Simulated voice state.
- Scripted assistant responses.
- Hard-coded Russins-style sales/customer data.
- Fake-but-believable loading and background agent states.
- Real email sending only if simple and reliable through a provider later.
- Export-looking PDF/report previews without requiring full document generation initially.
- ElevenLabs-backed Oz voice once the API key and voice ID are provided.
- Excel-to-dashboard demo path, mocked first and wired to real parsing later.

### Out Of Scope For First Demo

- Native mobile app.
- Real-time transcription.
- Full CRM integration.
- Real call center ingestion.
- Production-grade pricing engine.
- Full auth/roles.
- Complex dashboard builder.

## Deployment Assumptions

The future implementation should fit a DigitalOcean deployment, preferably on DigitalOcean App Platform for the first hosted demo:

- Static-first UI with client-side scripted interactions.
- Node-based backend/API routes only where needed for email sending, enrichment, or AI calls.
- Environment variables managed through DigitalOcean App Platform.
- Dockerfile support should be considered once the app grows beyond a static demo.
- DigitalOcean Spaces can be used later for generated reports, PDFs, or uploaded spec documents.
- Demo data stored in local TypeScript/JSON modules.
- Assets stored in the repo under a public or app asset directory.
- No dependency on local files outside the deployed project.

## Suggested Technical Direction

- Framework: Vite/React.
- Styling: Tailwind CSS or CSS modules with a small design-token file.
- Motion: Framer Motion or CSS keyframes.
- Charts: Recharts, Nivo, or lightweight custom SVG.
- Maps/routes: mocked route view first, Mapbox/Google later only if needed.
- Voice: ElevenLabs for Oz speech synthesis, hidden behind a small voice service adapter so scripted demo audio can be swapped for live generation later.
- Email: Resend, SendGrid, or Postmark later, hidden behind a small `sendReportEmail()` adapter.
- AI calls: use a lightweight Node service only when needed so API keys are not exposed in the browser.

## Data Model Families

- `Customer`
- `Contact`
- `Interaction`
- `CallTranscript`
- `ProductRequest`
- `CompetitorMention`
- `Complaint`
- `QuoteRequest`
- `QuoteLineItem`
- `Lead`
- `RouteStop`
- `GeneratedReport`
- `BackgroundTask`
- `LocationTag`
- `GeneratedWebAppTemplate`
- `ExcelDashboardImport`

## Product Principle

Every workflow must end in a concrete sales action. Avoid screens that only summarize. Each page should answer: “What should the rep do next?”

## Definition: End In A Sales Action

“End in a sales action” means the workflow must produce a clear next step that can be assigned, clicked, sent, reviewed, or performed by a rep or sales leader. A chart by itself is not enough. A ranked list by itself is not enough. Oz should translate the insight into a sales motion.

Valid sales actions include:

- Call these accounts.
- Visit these leads in this order.
- Ask these follow-up questions.
- Draft this quote.
- Add this upsell line item.
- Send this report to the sales team.
- Escalate this complaint.
- Stock or promote this requested product category.

This principle keeps the demo from becoming a passive analytics dashboard. The buyer should see Oz as an operating layer that moves work forward.
