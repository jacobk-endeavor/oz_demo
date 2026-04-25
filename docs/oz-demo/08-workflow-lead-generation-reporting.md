# Workflow: Lead Generation And Reporting

## Goal

Help sales teams find nearby lookalike customers, produce a route, and turn insights into recurring reports.

## User Story

“Find the nearest customers similar to ours, show me who to contact, generate a route, and send my sales team a weekly report.”

## Opinionated Decision

Combine lead generation and reporting in the same demo arc, but keep them as separate screens.

## Defense

Lead generation creates the “what should we do?” moment. Reporting creates the “make this repeatable” moment. They are strongest together in the presentation, but they need separate screens because one is an exploration workflow and one is an automation workflow.

## Lead Generation UI

- Prompt card: “Find nearby customers similar to ours.”
- Prospect table.
- Similarity reasons.
- Contact name and phone number.
- Distance from route.
- Confidence score.
- Route preview.
- “Add to weekly report” action.

## Lead Table Columns

- Company
- Contact
- Phone
- Location
- Similarity Reason
- Estimated Fit
- Current Supplier Signal
- Suggested Product
- Route Stop

## Lead Generation Prompts

- “Find the nearest customers similar to ours.”
- “Who should Sami visit tomorrow?”
- “Find prospects like our best decking customers.”
- “Generate a route to hit them all.”

## Route Behavior

The route is mocked for the demo. Do not call a real mapping provider. The route view should show:

- Ordered stops.
- Estimated travel time (deterministic strings).
- Reason for each stop.
- Suggested talking point.
- Product or quote angle.

Render the route as a styled list, not a live map widget. Reaching for Mapbox or Google Maps is out of scope until the team decides explicitly otherwise.

## Reporting UI

- Report builder prompt.
- Report preview.
- Recipient list.
- Schedule selector.
- Delivery status.
- Email sent confirmation.

## Report Prompts

- “Generate a report and send it every week to me and my sales team.”
- “Send the top requested products, competitor mentions, and urgent complaints every Monday.”
- “Create a weekly sales intelligence digest.”

## Report Contents

Weekly report should include:

- Top product requests.
- Top complaints.
- Competitor mentions.
- New leads.
- Quote opportunities.
- Recommended rep actions.
- Links or references back to source records.

## Demo Script

1. Open Lead Generation.
2. Ask: “Find the nearest customers similar to ours.”
3. Oz generates a prospect table with phone numbers.
4. User asks: “Generate a route to hit them all.”
5. Route preview appears.
6. User says: “Now send me this report every week to me and my sales team.”
7. Reports screen opens with a prefilled weekly digest.
8. User clicks send or schedule.
9. UI shows sent/scheduled confirmation.

## Email Decision

For the first hosted demo, implement real email only behind a safe feature flag or provider adapter. If email setup is not ready, show a convincing “sent” state with a demo inbox screenshot or local confirmation state.

## Data Contract

```json
{
  "leadQuery": "Find nearby customers similar to our best decking accounts.",
  "leads": [
    {
      "company": "North Ridge Builders",
      "contact": "Jordan Miles",
      "phone": "555-0142",
      "similarityReason": "Matches high-volume exterior materials profile",
      "suggestedProduct": "Composite decking bundle"
    }
  ],
  "report": {
    "cadence": "weekly",
    "recipients": ["sami@example.com", "sales@example.com"],
    "sections": ["product_requests", "competitor_mentions", "leads"]
  }
}
```

## Acceptance Criteria

- Lead output includes names, phone numbers, and reasons.
- Route output feels actionable, even if mocked.
- Report output can be scheduled or sent in the UI.
- The same insight can move from call mining to leads to report.

## What To Avoid

- Do not present leads without a reason.
- Do not let reporting feel like a static PDF export.
- Do not make real email a blocking dependency for the demo.
