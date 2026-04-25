# Oz + Nebula Demo Specification

This folder is the canonical planning/spec pack for the Oz + Nebula web demo. It is written for both humans and models: each file should be readable as product direction, implementation guidance, and prompt context for future code generation.

## Product Thesis

Oz is a voice-first sales intelligence assistant. Nebula is the workflow surface where Oz turns scattered field notes, phone calls, emails, specs, and sales data into concrete actions: insights, dashboards, quotes, leads, and recurring reports.

The demo should feel like a sales command center from the future: black space background, red/white/blue light, a responsive speaking orb, live background agents, and high-confidence outputs that appear as if Oz is actively reasoning through company data.

## Non-Negotiable Decisions

- Build as a **web UI first**, even when simulating mobile or voice interactions. This keeps the demo easy to deploy on DigitalOcean, easy to screen-share, and easy to iterate.
- Treat voice as the **primary input metaphor**, but provide typed prompts and scripted demo controls so the presentation never depends on real microphone reliability.
- Use **hard-coded demo data first**. The purpose is to sell the workflow, not prove integration completeness.
- Make Oz feel persistent. The right-side assistant should follow every workflow and answer questions about the current screen.
- Use the dot orb image as the signature Oz speaking state: `assets/oz-speaking-orb-reference.png`.

## File Map

- `01-product-architecture.md`: product shape, app boundaries, and hosting assumptions.
- `02-visual-and-interaction-system.md`: visual language, layout, motion, orb behavior, and responsive rules.
- `03-information-architecture.md`: pages, navigation, and shared components.
- `04-workflow-field-notes.md`: voice field notes and upsell/cross-sell assistant.
- `05-workflow-call-mining.md`: call, note, and email mining table.
- `06-workflow-dashboard-generation.md`: generated dashboards with Q&A.
- `07-workflow-quote-automation.md`: spec review, quote, and pricing generation.
- `08-workflow-lead-generation-reporting.md`: prospect discovery, route planning, and recurring reports.
- `09-model-spec-outline.md`: compact structured outline for future model/codegen use.
- `10-environment-and-assets.md`: Vite, API keys, ElevenLabs, and editable asset guidance.

## Demo Narrative

1. A rep opens Oz before or after a customer visit.
2. Oz captures field notes through the speaking orb and asks better follow-up questions than a normal CRM.
3. Nebula mines prior calls, complaints, emails, and notes to surface customer demand.
4. The user asks Oz to generate a dashboard from the mined data.
5. Oz creates a quote or pricing estimate from a voice memo and specs.
6. Oz finds similar nearby customers, generates a route, and creates a weekly report for the sales team.

The desired buyer reaction: “This is not a chatbot. This is an operating layer for our sales team.”
