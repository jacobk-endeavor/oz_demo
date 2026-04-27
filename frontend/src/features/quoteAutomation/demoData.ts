import { DEMO_REP_FIRST_NAME } from '../../config/demoRep'
import type { QuoteAutomationDemoData } from './types'

export const quoteAutomationDemoData: QuoteAutomationDemoData = {
  customerName: 'Summit Ridge Framing',
  repName: DEMO_REP_FIRST_NAME,
  requestedProduct: 'Marshall Court multi-family lumber package',
  constraints: [
    'Three flatbed drops tied to crane picks',
    'Lumber PO acceptance for deposit',
    'Engineered lumber lead time watch',
  ],
  inputs: [
    {
      id: 'voice-memo',
      label: 'Field voice memo',
      type: 'voice_memo',
      status: 'Ready for review',
      summary:
        '"Summit Ridge walkthrough — customer upbeat, collaborative tone, strong trust. Opportunity feels hot; no relationship concerns."',
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
      summary: 'Framing contractor on 12-unit wood-frame; tight crane windows and staged deliveries.',
    },
    {
      id: 'pricing-template',
      label: 'Pricing template',
      type: 'pricing_template',
      status: 'Selected',
      summary: 'Multi-family lumber & sheathing package (dimensional + engineered + OSB).',
    },
  ],
  sourceReference: {
    fileName: 'fake-automation-source-document.pdf',
    assetPath: 'docs/oz-demo/assets/fake-automation-source-document.pdf',
    documentType: 'Marshall Court — wood-frame lumber takeoff (demo package)',
    customer: 'Summit Ridge Framing',
    preparedFor: 'Field Sales Demo',
    extractedFields: [
      'SPF dimensional 2×6 / 2×10 for walls and plates',
      'LVL and I-joist floor system per structural sheets',
      '7/16 OSB wall and roof sheathing with anchor-bolt schedule',
      'Hardware and strap bundle as specified',
      'Three flatbed drops — align to site crane calendar',
      'Final piece counts subject to field verify',
    ],
  },
  tasks: [
    {
      id: 'review-voice-memo',
      label: 'Reviewing voice memo',
      detail: 'Extract Marshall Court job signals, quote ref, and delivery cadence from the field note.',
    },
    {
      id: 'extract-requested-products',
      label: 'Extracting requested products',
      detail: 'Identify SPF, engineered lumber, OSB, and hardware scope from the takeoff.',
    },
    {
      id: 'review-specs',
      label: 'Reviewing specs',
      detail: 'Read placeholder spec package and capture counts, grades, and drops.',
    },
    {
      id: 'pull-template',
      label: 'Pulling quote template',
      detail: 'Select the multi-family lumber & sheathing quote structure (Q25-4420-LUM).',
    },
    {
      id: 'check-pricing',
      label: 'Checking pricing guidance',
      detail: 'Apply yard pricing bands and delivery assumptions for three flatbeds.',
    },
    {
      id: 'find-additions',
      label: 'Finding upsell/cross-sell additions',
      detail: 'Flag moisture coverage, temporary bracing, or rush mill orders if schedule slips.',
    },
    {
      id: 'prepare-quote',
      label: 'Preparing draft quote',
      detail: 'Assemble the draft Job Cost Recap / invoice preview and mark gaps for rep review.',
    },
  ],
  draftQuote: {
    title: 'Summit Ridge Framing — Marshall Court lumber draft quote',
    customerSummary:
      'Summit Ridge needs a priced lumber-and-sheathing package for Marshall Court (12 units, wood frame). Oz aligned the draft to voice memo Q25-4420-LUM; confirm piece counts and crane windows before the lumber PO is released.',
    completion: 0.82,
    status: 'needs_rep_review',
    estimateRange: '$268,000 - $292,000',
    lineItems: [
      {
        sku: 'LUM-SPF-PKG',
        description: 'SPF dimensional & stud packs (walls / plates)',
        quantity: 'Per takeoff — Marshall Court phase 1',
        priceRange: '$88,000 - $96,000',
        assumption: 'Yard bundle pricing; excludes field waste allowance above 5%.',
      },
      {
        sku: 'LUM-ENG-FLR',
        description: 'Engineered floor system (LVL / I-joist)',
        quantity: 'Matched to structural package',
        priceRange: '$92,000 - $102,000',
        assumption: 'Lead times per current mill quotes; alternates if allocation shifts.',
      },
      {
        sku: 'LUM-OSB-HW',
        description: 'OSB sheathing, anchors & hardware bundle',
        quantity: 'Wall + roof coverage per drawings',
        priceRange: '$68,000 - $76,000',
        assumption: 'Includes strap/tie schedule; long clips priced separately if added.',
      },
      {
        sku: 'DELIV-FLAT-3',
        description: 'Flatbed delivery coordination (3 drops)',
        quantity: '3 staged deliveries',
        priceRange: '$18,000 - $22,000',
        assumption: 'Standard radius; overtime unload or crane standby not included.',
      },
    ],
    assumptions: [
      {
        label: 'Estimate quality',
        value: 'Rough yard estimate — not released lumber PO pricing until rep sign-off.',
      },
      {
        label: 'Delivery',
        value: 'Assumes three drops aligned to Summit Ridge’s crane schedule; dates to confirm.',
      },
      {
        label: 'Payment',
        value: 'Deposit framing follows lumber PO acceptance per Job Cost Recap terms.',
      },
      {
        label: 'Approval',
        value: 'Rep must validate takeoff and moisture coverage before customer-facing invoice.',
      },
    ],
    missingInfo: ['Final piece counts from field verify', 'Crane calendar lock dates', 'Moisture coverage selection'],
    suggestions: [
      {
        title: 'Hold moisture / job-site coverage line',
        rationale:
          'Marshall Court is an active wood-frame site; a short moisture rider reduces callback risk if weather slips.',
        estimatedImpact: '+$2K-$6K',
      },
      {
        title: 'Quote alternate mill for I-joist',
        rationale: 'If primary mill allocation tightens, a pre-negotiated alternate keeps Q3 framing on track.',
        estimatedImpact: 'Schedule protection',
      },
    ],
  },
}
