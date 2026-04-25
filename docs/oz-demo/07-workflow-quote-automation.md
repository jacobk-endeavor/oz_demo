# Workflow: Quote Automation And Pricing

## Goal

Turn voice memos, specs, templates, and customer context into an 80%-complete quote that a rep can review and send.

## User Story

“I have a customer asking for pricing. I want Oz to review the specs, pull the right template, suggest pricing, identify missing information, and draft the quote.”

## Opinionated Decision

Position the output as “80% done” instead of fully automated final pricing.

## Defense

Pricing and quoting carry business risk. The demo is more credible if Oz accelerates expert work rather than pretending to replace approval. “80% done” is believable, valuable, and safer for customer conversations.

## Primary UI

- Left: input queue with voice memo, spec document, and customer context.
- Center: animated document review space with transparent rounded PDF cards.
- Right: Oz assistant and quote rationale.
- Bottom or side: background task rail.

## Background Task States

- Reviewing voice memo.
- Extracting requested products.
- Reviewing specs.
- Pulling quote template.
- Checking pricing guidance.
- Finding upsell/cross-sell additions.
- Preparing draft quote.

## Inputs

- Customer name.
- Voice memo or typed request.
- Spec document preview. Use `assets/fake-automation-source-document.pdf` as the placeholder PDF until the real customer/spec document is available.
- Pricing template.
- Product catalog data.
- Similar quote examples.
- Rep notes.

## Output

Oz should generate:

- Quote title.
- Customer summary.
- Line items.
- Quantity assumptions.
- Pricing estimate/range.
- Missing information.
- Upsell/cross-sell suggestions.
- Approval warning if needed.
- Draft PDF-style preview.

## Pricing Guidance Behavior

Oz should say:

- “Here is a rough estimate.”
- “I assumed standard delivery.”
- “Confirm dimensions before sending.”
- “This should be reviewed before it goes to the customer.”

Oz should not say:

- “This is final approved pricing.”
- “Send automatically without review.”

## Demo Script

1. User says: “Hey, I’m about to visit XYZ. How do I price this?”
2. A voice memo appears in the quote queue.
3. The fake source PDF appears as the document Oz is reviewing.
4. Oz starts background tasks.
5. Spec cards scroll with parallax.
6. Oz pulls a pricing template.
7. Quote preview fills in with line items.
8. Oz suggests one upsell and one question to ask.
9. User asks: “Anything else they might benefit from?”
10. Oz adds a recommended accessory or service line item.

## Placeholder Source PDF

Use `assets/fake-automation-source-document.pdf` as the first demo source document. It should look like a believable machine/spec/pricing request, but it is intentionally fake and replaceable.

When the real document is available:

- Replace the PDF in the assets folder.
- Keep the same file name if possible so demos do not need code changes.
- Re-run any AI demonstrations against the new document.
- Update the hard-coded extracted fields if the real document changes the story.

## Data Contract

```json
{
  "quoteRequest": {
    "customer": "XYZ Supply",
    "source": "voice_memo",
    "requestedProduct": "Composite decking package",
    "constraints": ["fast delivery", "budget sensitive"]
  },
  "draftQuote": {
    "status": "needs_rep_review",
    "completion": 0.8,
    "lineItems": [],
    "missingInfo": ["Exact square footage", "Delivery address"],
    "upsellSuggestions": []
  }
}
```

## Acceptance Criteria

- Background tasks are visible and sequential.
- The quote preview feels materially useful.
- Missing information is clearly called out.
- Upsell/cross-sell is tied to the customer request.
- Final output requires human review.

## What To Avoid

- Do not make the quote generator a generic text box.
- Do not claim pricing is final.
- Do not hide assumptions.
