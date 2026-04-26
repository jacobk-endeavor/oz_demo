/**
 * Canonical Field demo lines for TTS and scripted voice.
 * Keep in sync with `scripts.md` (Scripts 1–3 teleprompter tables).
 */
import { KENNY_TTS_AUDIO_BRIEF } from './fieldDemoKennyData'

export { KENNY_TTS_AUDIO_BRIEF }

/** Script 1 — after home route into customer history. */
export const SCRIPT1_OPEN_REPLY =
  'I’ve got you, Alex. I’m opening Kenny Hills now—you’ll get recent orders, value bands, and the field and service notes so you’re not walking in cold.'

/** Script 1 — follow-up after `KENNY_TTS_AUDIO_BRIEF` (any short rep line advances scripted step). */
export const SCRIPT1_AFTER_AUDIO_SUMMARY =
  'That’s the snapshot. Anytime you want a line read back with the notes and ballpark numbers, just say the word.'

/** Script 2 — recommendation reply (jumps straight into the visit signal, no on-screen routing). */
export const TTS_RECOMMEND =
  'Last time at Kenny Hills they had to call back a day later to add Apex Hidden Fasteners. Lead with your quoted capped composite line, then place Apex hidden fasteners in the conversation now so they do not leave without them. If they are stepping up, the deck drainage pitch still plays well on wet sites.'

/** Script 2 — use cases. */
export const TTS_USE_CASES =
  'Coastal decks, pool surrounds, and anywhere you want a clean face with no top screws. Min one-quarter inch gapping for drainage in wet climates.'

/** Script 2 — bundle / cross-sell walkthrough. */
export const TTS_UPSELL =
  'For accounts like Kenny Hills, when buyers take your primary deck recommendation together with Apex hidden fasteners, history shows a third add: color-matched fascia or a riser bundle on long runs. Position that third line as the typical completion package.'

/** Script 2 — closing reply when the rep asks for specs by email. */
export const SCRIPT2_EMAIL_SENDING_REPLY = 'Ok, sending.'

/** Script 5 — drive-time background quote (initial route; aligns with `scripts.md`). */
export const SCRIPT5_BACKGROUND_QUOTE_OPEN =
  'Sounds good. I’m queuing a background quote to the web team—you’ll get a handoff, not the full five-question visit note.'

/** Field meeting voice memo — Oz's only line: a short ack so the rep just dictates the rest. */
export const VOICE_MEMO_RECORDING_ACK = 'Cool, recording.'

/* ────────────────────────────────────────────────────────────────────────────
 * Script 3 — one-by-one Q&A for Sammy Carter / automation cell upgrade (Job Cost Recap).
 * Six turns: rep opens, Oz asks Q1; rep answers, Oz asks Q2; … rep answers Q5,
 * Oz closes with the formula totals from the JCR sheet. Each Oz line targets one
 * logical group of fields on the schema so the rep fills the sheet in passes.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Turn 1 — rep opens, Oz asks for project basics (PO is auto-generated, so we don't ask for it). */
export const SCRIPT3_T1_PROJECT_BASICS =
  'Got it, Alex. First — give me the project basics for Sammy Carter’s automation cell upgrade: what project number, which existing quote we’re tying to, and which P-M leads on our side? I’ll auto-generate the P-O on the sheet — you can edit it after if Sammy supplies a real one.'

/** Turn 2 — Oz asks for the job description and order value. */
export const SCRIPT3_T2_DESCRIPTION_AND_ORDER =
  'Locked. Next — give me a one-line job description and the order value Sammy sees on the cover.'

/** Turn 3 — Oz asks for component cost split. */
export const SCRIPT3_T3_COMPONENTS =
  'Got it. Component costs — break it down: electrical, commercial mechanical, manufactured mechanical.'

/** Turn 4 — Oz asks for labor (design + assembly hours). */
export const SCRIPT3_T4_LABOR =
  'Labor next. Design hours and assembly hours — mechanical first, then electrical. We’ll keep our standard rates: sixty-eight an hour for design, sixty-one for assembly.'

/** Turn 5 — Oz asks for additional costs and payment schedule. */
export const SCRIPT3_T5_ADDITIONAL_AND_PAYMENT =
  'Last block — indirect labor, travel, shipping, any sales commission, and the payment schedule. Walk me through it.'

/** Turn 6 — Oz closes Script 3 with the JCR formula totals (matches Sammy Carter demo). */
export const SCRIPT3_T6_CLOSE =
  'Locked in. Sammy’s Job Cost Recap is staged — total cost about one hundred fifty-six thousand, profit one hundred twenty-eight thousand, around forty-five percent margin. Open the sheet to review and queue the invoice.'

/** Script 2 — closing hint if they stay on recommend after the scripted arc. */
export const SCRIPT2_PRODUCT_STALE_HINT =
  'Say upsell or cross-sell on the Field home orb to open the bundle run—or we can pick this up on the next visit.'

/** Script 3 — prospect Q&A Oz lines (order matches `PROSPECT_QS_SPOKEN` in prospectNotesData). */
export const PROSPECT_OZ_TTS: readonly string[] = [
  "Sounds good—we’ll take it one at a time. First: Who was the customer, who were you speaking to, and what were they trying to buy? Name any specific products or line items.",
  'Second: Who else are they trying to purchase from, and who have they already spoken to?',
  'Third: What insights do we have from the call, how was the interaction, and anything else that matters for the note?',
  'Fourth: What are we ordering: parts, SKUs, and quantities, including any alternates you talked through?',
  'Fifth: Where is it shipping: full address, and any job site or delivery notes?',
  'Do you want me to create a quote for when you get back to the office?',
  "Perfect. I’m queuing a background quote with your visit answers already filled in—you’ll get the handoff in Quote Automation when you’re back, not another full Q&A pass.",
]

/** LLM / Vitest fallback when customer-interactions reply is empty — voice-first, no on-screen table assumption. */
export const CUSTOMER_HISTORY_VOICE_FALLBACK =
  'You’ve got recent orders with ballpark values and the field notes we care about—say which line you want to dig into and I’ll walk it with you.'
