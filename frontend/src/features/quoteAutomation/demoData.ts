import type { QuoteAutomationDemoData } from './types'

export const quoteAutomationDemoData: QuoteAutomationDemoData = {
  customerName: 'Russin Lumber',
  repName: 'Sami',
  requestedProduct: 'Composite decking package',
  constraints: ['Fast delivery requested', 'Budget sensitive account', 'Accessory recommendation needed'],
  inputs: [
    {
      id: 'voice-memo',
      label: 'Field voice memo',
      type: 'voice_memo',
      status: 'Ready for review',
      summary: '"I am about to visit Russin. They need decking pricing fast and may need fasteners too."',
    },
    {
      id: 'source-pdf',
      label: 'Spec source PDF',
      type: 'spec_document',
      status: 'Fake PDF linked',
      summary: 'fake-automation-source-document.pdf',
    },
    {
      id: 'customer-context',
      label: 'Customer context',
      type: 'customer_context',
      status: 'Matched',
      summary: 'Distributor in Montgomery, NY with recent competitor pressure on delivery windows.',
    },
    {
      id: 'pricing-template',
      label: 'Pricing template',
      type: 'pricing_template',
      status: 'Selected',
      summary: 'Composite decking bundle template with accessory and delivery add-ons.',
    },
  ],
  sourceReference: {
    fileName: 'fake-automation-source-document.pdf',
    documentType: 'Machine Concept / Spec Review Package',
    customer: 'Russin Lumber',
    preparedFor: 'Field Sales Demo',
    extractedFields: [
      'Composite decking bundle for regional contractor program',
      'Hidden fastener system as recommended accessory',
      'Exterior trim option for upsell review',
      'Final dimensions not yet confirmed',
      'Delivery address missing',
    ],
  },
  tasks: [
    {
      id: 'review-voice-memo',
      label: 'Review voice memo',
      detail: 'Extract request, urgency, and rep intent from the field note.',
    },
    {
      id: 'review-specs',
      label: 'Review source PDF',
      detail: 'Read placeholder spec package and capture requested products.',
    },
    {
      id: 'pull-template',
      label: 'Pull quote template',
      detail: 'Select the composite decking package quote structure.',
    },
    {
      id: 'check-pricing',
      label: 'Check pricing guidance',
      detail: 'Apply rough range guidance and standard delivery assumptions.',
    },
    {
      id: 'prepare-quote',
      label: 'Prepare draft quote',
      detail: 'Assemble the 80% complete draft and mark gaps for rep review.',
    },
  ],
  draftQuote: {
    title: 'Russin Lumber Composite Decking Draft Quote',
    customerSummary:
      'Russin Lumber is asking for a fast-turn decking package estimate for a regional contractor program. Oz found enough detail for a useful draft, but dimensions and delivery location still need rep confirmation.',
    completion: 0.8,
    status: 'needs_rep_review',
    estimateRange: '$31,800 - $38,900',
    lineItems: [
      {
        sku: 'DECK-COMP-BUNDLE',
        description: 'Composite decking bundle',
        quantity: 'Estimated 2,400-2,800 sq ft',
        priceRange: '$26,400 - $32,200',
        assumption: 'Assumes standard color boards and contractor-volume bundle pricing.',
      },
      {
        sku: 'FAST-HIDDEN-KIT',
        description: 'Hidden fastener system',
        quantity: 'Coverage matched to decking range',
        priceRange: '$3,100 - $4,200',
        assumption: 'Included as recommended accessory from source PDF.',
      },
      {
        sku: 'DELIV-STANDARD',
        description: 'Standard jobsite delivery coordination',
        quantity: '1 coordinated delivery',
        priceRange: '$2,300 - $2,500',
        assumption: 'Assumes standard delivery window; rush freight not included.',
      },
    ],
    assumptions: [
      {
        label: 'Estimate quality',
        value: 'Here is a rough estimate, not final approved pricing.',
      },
      {
        label: 'Delivery',
        value: 'Assumed standard delivery because the request asks for speed but does not include an address.',
      },
      {
        label: 'Quantity',
        value: 'Used contractor-program range until exact square footage is confirmed.',
      },
      {
        label: 'Approval',
        value: 'This should be reviewed before it goes to the customer.',
      },
    ],
    missingInfo: ['Exact square footage', 'Delivery address', 'Preferred board color'],
    suggestions: [
      {
        title: 'Add hidden fastener system',
        rationale: 'The source PDF calls it out as a recommended accessory and it keeps Russin from sourcing fasteners separately.',
        estimatedImpact: '+$3.1K-$4.2K',
      },
      {
        title: 'Ask about exterior trim phase',
        rationale: 'The PDF flags exterior trim for upsell review; this could become a follow-on quote after decking dimensions are confirmed.',
        estimatedImpact: 'Follow-up opportunity',
      },
    ],
  },
}
