/**
 * Field App — mobile voice workflow definitions.
 * Edit this file to change copy, behavior notes, and demo UI labels. The
 * "Mobile workflows" tab in the app reads from this module.
 */
export type FieldMobileWorkflowId =
  | 'customer-interactions'
  | 'product-recommend'
  | 'upsell-cross-sell'
  | 'background-quote'
  | 'prospect-notes'

export interface FieldMobileWorkflow {
  id: FieldMobileWorkflowId
  /** Short label in lists */
  shortTitle: string
  /**
   * Example things a rep might say (voice). First entry is the primary script
   * for the mock voice router.
   */
  examplePhrases: readonly string[]
  /** One-line description for the authoring tab */
  summary: string
  /** How Oz should behave (for you and the team to iterate on) */
  behaviorIntent: string
  /** Data sources or systems to wire (Salesforce, specs, web agent, etc.) */
  dataSources: readonly string[]
  /** Rich notes you can expand in the product — shown on the run screen and authoring */
  productNotes: string
}

export const FIELD_MOBILE_WORKFLOWS: readonly FieldMobileWorkflow[] = [
  {
    id: 'customer-interactions',
    shortTitle: 'Customer history',
    examplePhrases: [
      "I'm about to visit contractor Kenny Hills — what have we sold them, and what notes are on the account?",
    ],
    summary: 'Full interaction history and context before you walk in.',
    behaviorIntent:
      'Voice-to-voice: pull CRM timeline, past voice memos, and other reps’ field notes. Summarize in speakable chunks with names and dates.',
    dataSources: [
      'Salesforce (accounts, opps, activities)',
      'Prior voice notes (this rep + org)',
      'Other reps’ visit logs & Nebula handoffs',
    ],
    productNotes:
      'Narration order: (1) last 3 touchpoints, (2) open risks, (3) who owns next step. Let the rep “go deeper” with follow-up voice questions.',
  },
  {
    id: 'product-recommend',
    shortTitle: 'What to recommend',
    examplePhrases: [
      'What products should I recommend?',
      'What are some use cases for it?',
    ],
    summary: 'Recommendations, specs, and spoken follow-ups about products.',
    behaviorIntent:
      'Answer with ranked SKUs, pull spec sheets, then ask: “Do you want any specific info on this product?” If yes, read highlights and offer use cases from the spec.',
    dataSources: [
      'Product catalog & margin bands',
      'Spec PDFs and install guides',
      'Compat rules (substrate, climate, code)',
    ],
    productNotes:
      'After the first answer, use short prompts (not chat) so the rep stays eyes-up: “Hear the spec?” “Compare to SKU B?”',
  },
  {
    id: 'upsell-cross-sell',
    shortTitle: 'Upsell & cross-sell',
    examplePhrases: [
      'For Kenny Hills, what do accounts usually add when they buy what I am recommending, plus the fasteners?',
    ],
    summary: 'Surface add-on, trade-up, and bundle paths tied to this visit.',
    behaviorIntent:
      'Scan line items, site conditions, and account tier; return ranked upsell and cross-sell with one-line “why” for each.',
    dataSources: [
      'Cart and quote line history',
      'Warranty and bundle programs',
      'Competitive displacement offers',
    ],
    productNotes:
      'Spoken as a tight list. Let the rep ask “Why that one?” on any line via voice to expand.',
  },
  {
    id: 'prospect-notes',
    shortTitle: 'Prospect Q&A + notes',
    examplePhrases: [
      'Run a visit note for this order — capture who they are, what we are ordering, and where it ships.',
      'Ask me questions about this prospect and capture line items, ship-to, and call notes while I talk.',
    ],
    summary:
      'Structured visit order background: five on-screen fields, PDF, Field Notes log, optional quote handoff — a separate session from the drive-time background quote.',
    behaviorIntent:
      'Voice: fill customer, competition, insights, line items, ship-to. When customer, line items, and ship-to are covered, nudge toward quote generation instead of re-interviewing optional lines.',
    dataSources: [
      'CRM / account context',
      'Prior visit and call summaries',
    ],
    productNotes:
      'Rep stays eyes-up. When quote fields are complete, point to Open Quote Automation. Use the top strip to chain the Background quote session separately if they only need a handoff.',
  },
  {
    id: 'background-quote',
    shortTitle: 'Background quote (drive time)',
    examplePhrases: [
      'I just got back from the customer and they want XYZ — can you generate a quote by the time I get back to the office?',
      'Queue a background quote for me while I drive.',
    ],
    summary: 'Hands a quote job to the web app agent while the rep is away — not the same as the full five-line visit Q&A.',
    behaviorIntent:
      'Confirm and queue; no five-field order-background interview. Chain to Prospect Q&A in the strip if they also need a visit note capture.',
    dataSources: [
      'Quote automation on web',
      'Pricing and availability service',
      'Approval workflow when margin is tight',
    ],
    productNotes:
      'Field shows “generating” when the web agent is running. Separate from the Prospect Q&A + visit note workflow.',
  },
] as const

export function getFieldMobileWorkflow(
  id: FieldMobileWorkflowId,
): FieldMobileWorkflow | undefined {
  return FIELD_MOBILE_WORKFLOWS.find((w) => w.id === id)
}
