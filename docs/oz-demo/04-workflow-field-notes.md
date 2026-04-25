# Workflow: Voice Field Notes

## Goal

Let a sales rep speak messy meeting context into Oz and receive structured notes, follow-up questions, upsell/cross-sell suggestions, and pricing guidance.

## User Story

“I just visited a customer or I am about to visit one. I want Oz to capture what matters, remind me what to ask, and surface products or pricing angles I should not miss.”

## Opinionated Decision

Represent the mobile voice app as a polished phone-sized panel inside the web UI.

## Defense

The customer needs to believe the mobile experience exists, but the immediate demo needs reliability. A web-hosted phone panel lets the team present the mobile concept, animate the orb, and show app-to-web collaboration without building native iOS/Android first.

## Primary UI

- Center phone mock panel with black background.
- Oz speaking orb using `assets/oz-speaking-orb-reference.png`.
- Large tap/hold voice affordance.
- Scripted transcript stream.
- Suggested prompts below the orb.
- Web app sync panel showing “Pushed to Nebula.”

## Inputs

- Voice memo or scripted transcript.
- Customer name.
- Rep name.
- Meeting date.
- Product context.
- Prior interactions.
- Pricing question.

## Core Prompts

- “I am about to visit XYZ. What should I ask?”
- “How should I price this?”
- “Anything else they might benefit from?”
- “What are similar customers buying?”
- “Pull up the spec for that product.”

## Oz Output

Oz should produce:

- Structured meeting note.
- Three recommended follow-up questions.
- Two upsell/cross-sell suggestions.
- One pricing note or rough estimate.
- One “show this in web app” action.

## Suggested Data Shape

```json
{
  "customer": "ABC Building Supply",
  "rep": "Sami",
  "meetingType": "field_visit",
  "rawNote": "Customer asked about faster delivery on composite decking and mentioned competitor pricing.",
  "structuredSummary": "...",
  "questionsToAsk": ["...", "...", "..."],
  "upsellSuggestions": ["...", "..."],
  "pricingGuidance": "...",
  "webActions": ["show_product_specs", "draft_quote"]
}
```

## Demo Script

1. User taps the orb and speaks a short field note.
2. Orb shifts from listening to thinking.
3. Oz writes the structured note.
4. Oz suggests what to ask next.
5. User asks: “Anything else they might benefit from?”
6. Oz recommends a product and pushes specs to the main web canvas.
7. Web UI shows the product card/spec preview appearing in Nebula.

## Acceptance Criteria

- The orb visibly reacts to listening, thinking, and speaking.
- The workflow can be completed without a real microphone.
- The output feels like a sales coach, not a note-taking app.
- The final state includes a concrete next action.

## What To Avoid

- Do not make this a generic voice recorder.
- Do not bury recommendations under the transcript.
- Do not rely on real-time speech recognition for the core demo.
