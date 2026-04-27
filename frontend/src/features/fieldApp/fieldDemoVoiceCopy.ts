/**
 * Canonical Field demo lines for TTS and scripted voice.
 * Keep in sync with `scripts.md` (Scripts 1–3 teleprompter tables).
 */
import { KENNY_TTS_AUDIO_BRIEF } from './fieldDemoKennyData'

export { KENNY_TTS_AUDIO_BRIEF }

/** Script 1 — after home route into customer history. */
export const SCRIPT1_OPEN_REPLY =
  'I’ve got you, Sami. I’m opening Kenny Hills now—you’ll get recent orders, value bands, and the field and service notes so you’re not walking in cold.'

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

/** After Script 4 JCR close — played automatically (no extra rep line). */
export const SCRIPT_QUOTE_GENERATING = 'Okay, generating the quote.'

/** Drive-time background quote workflow (mobile route); not used on the Field home orb queue. */
export const SCRIPT5_BACKGROUND_QUOTE_OPEN =
  'Sounds good. I’m queuing a background quote to the web team—you’ll get a handoff, not the full five-question visit note.'

/** Rep line for Script 3 (voice memo open) — VAD advances; exact wording optional. */
export const VOICE_MEMO_OPEN_LINE =
  'Hey, I want to record a field memo.'

/** Field meeting — after this ack, the next rep turn uses the same VAD as everywhere else; pause saves the canned memo and plays the thank-you. */
export const VOICE_MEMO_RECORDING_ACK = 'Ok, recording.'

/**
 * Canned **Rep (Sami)** line stored on the Field Notes row (first person, as in the runbook).
 * Written when the rep finishes speaking on that Script 3 turn — same text as in “View conversation.”
 */
export const SAMI_FIELD_MEMO_CANNED_TEXT =
  "Just wrapped a walkthrough with Summit Ridge on site. They're in a good place — upbeat about the job, easy to talk to, and it feels like they trust us. I'd call the tone collaborative and the opportunity hot. No red flags on the relationship side."

/** After Script 3 memo is saved — Eleven Labs (orb queue step). */
export const VOICE_MEMO_SAVED_THANKS = 'Ok, I saved your field note — thanks!'

/** Final System line stored on the Field Notes memo row (category tag for demo). */
export const VOICE_MEMO_SAVED_SYSTEM_LINE = 'Memo saved to Field Notes. — general'

/* ────────────────────────────────────────────────────────────────────────────
 * Script 4 — one-by-one Q&A for Summit Ridge Framing / lumber package (Job Cost Recap).
 * Six turns: rep opens, Oz asks Q1; rep answers, Oz asks Q2; … rep answers Q5,
 * Oz closes with the formula totals from the JCR sheet. Each Oz line targets one
 * logical group of fields on the schema so the rep fills the sheet in passes.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Turn 1 — rep opens; Oz confirms lumber P-O is auto-generated and asks for customer + deal. */
export const SCRIPT3_T1_PROJECT_BASICS =
  'Got it, Sami. The lumber P-O will auto-generate on the sheet — you can edit it if they email you a real purchase order number. First, who is the customer and what’s the deal we’re quoting?'

/** Turn 2 — Oz asks for the job description and order value. */
export const SCRIPT3_T2_DESCRIPTION_AND_ORDER =
  'Locked. Next — give me a one-line job description and the order total on the cover.'

/** Turn 3 — Oz asks for material buckets (maps to component cost rows on the sheet). */
export const SCRIPT3_T3_COMPONENTS =
  'Got it. Material buckets — dimensional lumber and studs, engineered lumber, then treated or specialty stock if any.'

/** Turn 4 — Oz asks for labor hours (maps to design / assembly rows on the sheet). */
export const SCRIPT3_T4_LABOR =
  'Labor next. Takeoff and yard time — layout and lift plan first, then crew staging and delivery alignment. We’ll keep our standard rates: sixty-eight an hour for design, sixty-one for assembly.'

/** Turn 5 — Oz asks for additional costs and payment schedule. */
export const SCRIPT3_T5_ADDITIONAL_AND_PAYMENT =
  'Last block — indirect labor, travel, shipping, any sales commission, and the payment schedule. Walk me through it.'

/** Turn 6 — Oz closes Script 4 with the JCR formula totals (lumber package demo). */
export const SCRIPT3_T6_CLOSE =
  'Locked in. Summit Ridge’s Job Cost Recap is staged — total cost about one hundred fifty-six thousand, profit one hundred twenty-eight thousand, around forty-five percent margin. Open the sheet to review and queue the invoice.'

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
