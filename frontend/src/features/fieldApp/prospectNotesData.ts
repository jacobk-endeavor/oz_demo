/** Shared copy for prospect Q&A (voice route, TTS, and LLM must stay aligned). */
export const PROSPECT_QS = [
  'Who was the customer? Who were you speaking to, and what were they trying to buy? List specific items.',
  'Who else are they trying to purchase from? Who have they spoken to?',
  'What insights have we gathered from the call? How was the interaction, and so on?',
  'What are you planning to order for them—parts, SKUs, quantities, and any alternates you discussed?',
  'What address is this order shipping to, including any dock or job-site notes?',
] as const

export const PROSPECT_QA_COUNT = PROSPECT_QS.length

/** Core fields required to hand off quote generation in the demo (customer, line items, ship-to). */
const QUOTE_Q_IDX = { customer: 0, lineItems: 3, shipTo: 4 } as const

export function isProspectCoreQuoteReady(answers: Record<number, string> | undefined | null): boolean {
  if (!answers) return false
  const t = (i: number) => (answers[i] ?? '').trim()
  return (
    t(QUOTE_Q_IDX.customer).length > 0 &&
    t(QUOTE_Q_IDX.lineItems).length > 0 &&
    t(QUOTE_Q_IDX.shipTo).length > 0
  )
}

const EN_NUM = ['One', 'Two', 'Three', 'Four', 'Five'] as const

/** Slightly shorter spoken phrasing; same intent as the on-screen list. */
const PROSPECT_QS_SPOKEN: readonly string[] = [
  'Who was the customer, who were you speaking to, and what were they trying to buy? Name any specific products or line items.',
  'Who else are they trying to purchase from, and who have they already spoken to?',
  'What insights do we have from the call, how was the interaction, and anything else that matters for the note?',
  'What are we ordering: parts, SKUs, and quantities, including any alternates you talked through?',
  'Where is it shipping: full address, and any job site or delivery notes?',
]

/** Spoken line after routing to prospect-notes (TTS + initial route). */
export function buildProspectOpeningTtsText(): string {
  const body = PROSPECT_QS_SPOKEN.map((q, i) => `${EN_NUM[i]}: ${q}`).join(' ')
  return `Okay, cool. ${body} I will line your answers up in the order background and your note.`
}
