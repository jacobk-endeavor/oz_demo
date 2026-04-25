# Workflow: Call, Note, And Email Mining

## Goal

Turn customer interactions into a searchable intelligence table that reveals product demand, complaints, competitor mentions, and sales opportunities.

## User Story

“Show me what customers are asking for, what they are complaining about, and which competitors are showing up in our calls, notes, and emails.”

## Opinionated Decision

The first mining interface should be a table with an Oz Q&A layer, not a pure chat experience.

## Defense

Sales leaders trust rows, filters, and source records. Chat is excellent for asking questions, but the table proves the answer has backing data. The table also makes the demo more credible because users can see company, rep, date, medium, and evidence at once.

## Primary UI

Main table columns:

- Company
- Representative
- Date
- Medium
- Location
- Interaction Type
- Topic
- Complaint
- Product Requested
- Competitor Mentioned
- Confidence
- Suggested Action

Medium values:

- Note
- Call center call
- Email

Location tag values:

- Zoom: blue dot, `#23B8FF`.
- Phone call: red dot, `#E10600`.
- In person: white dot, `#F5F7FF`.

The location tag should appear as a visible row chip with a colored dot on the left. This is separate from the medium column because an interaction can be an in-person note, a phone call transcript, or a Zoom call summary. The distinction matters during sales review: location explains context, while medium explains source format.

## Top Query Buttons

- “Top 10 requested products”
- “Customer complaints”
- “Competitor mentions”
- “Lost deals in recent months”
- “Calls with pricing objections”
- “Upsell candidates”

## Natural Language Queries

- “Tell me about the ten products people have been requesting.”
- “Query customer complaints.”
- “Show mining from phone calls for insights.”
- “Which competitors are selling these products?”
- “Have we lost to those competitors in the last several months?”

## Oz Output

Oz should answer with:

- Direct answer.
- Ranked list.
- Source count.
- Evidence rows highlighted in the table.
- Recommended action.

Example answer shape:

```json
{
  "answer": "Composite decking, fasteners, and exterior trim are the fastest-rising requests.",
  "rankedItems": [
    { "name": "Composite decking", "mentions": 18, "trend": "+32%" }
  ],
  "sourceRecordIds": ["call_001", "email_014"],
  "highlightedLocationTags": ["phone_call", "zoom"],
  "recommendedAction": "Create a bundle quote for reps visiting deck builders this week."
}
```

## Demo Script

1. Open Call Mining.
2. Show mixed notes, calls, and emails in the table.
3. Ask Oz: “What are the ten products customers ask for most?”
4. Table filters/highlights relevant rows.
5. Oz returns ranked products with counts and evidence.
6. Ask: “Which competitors are selling these?”
7. Competitor column highlights.
8. Oz recommends a pricing or lead-generation follow-up.

## Data Requirements

Hard-code at least:

- 20 companies.
- 8 representatives.
- 60 interaction records.
- Location tags on every interaction: Zoom, phone call, or in person.
- 10 product request categories.
- 5 competitor names.
- 8 complaint categories.
- 6 lost-deal examples.

## Acceptance Criteria

- Table remains useful without Oz.
- Oz answers always point back to rows.
- Every insight has a count or evidence reference.
- Filters and highlights make the answer feel grounded.
- Every row shows a distinct visible location tag with the correct colored dot.

## What To Avoid

- Do not make this look like raw transcript search only.
- Do not return vague “customers want better service” answers.
- Do not show insights without source evidence.
