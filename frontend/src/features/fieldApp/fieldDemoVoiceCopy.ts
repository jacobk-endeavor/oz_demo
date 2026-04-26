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

/** Script 2 — home route into product recommend. */
export const SCRIPT2_OPEN_REPLY =
  'On it. I’m opening the What to recommend run—start from the visit signal, then you can go deeper on specs and use cases on screen.'

/** Script 2 — visit signal (Kenny). */
export const TTS_RECOMMEND =
  'Last time at Kenny Hills they had to call back a day later to add Apex Hidden Fasteners. Lead with your quoted capped composite line, then place Apex hidden fasteners in the conversation now so they do not leave without them. If they are stepping up, the deck drainage pitch still plays well on wet sites.'

/** Script 2 — after “tell me more about specs.” */
export const SCRIPT2_SPEC_BRIDGE =
  'Got it—here are the spec highlights. Jump in when you want the ICC detail, or just hit me with the next question.'

/** Script 2 — use cases. */
export const TTS_USE_CASES =
  'Coastal decks, pool surrounds, and anywhere you want a clean face with no top screws. Min one-quarter inch gapping for drainage in wet climates.'

/** Script 2 — transition into upsell run. */
export const SCRIPT2_UPSELL_INTRO =
  'Makes sense. I’m opening upsell and cross-sell for Kenny—the usual rhythm is lead line, paired fasteners, then the common third add.'

/** Script 2 — bundle walkthrough. */
export const TTS_UPSELL =
  'For accounts like Kenny Hills, when buyers take your primary deck recommendation together with Apex hidden fasteners, history shows a third add: color-matched fascia or a riser bundle on long runs. Position that third line as the typical completion package.'

export const SCRIPT2_EMAIL_REPLY = 'It’ll be in your email when you arrive.'

/** Script 5 — drive-time background quote (initial route; aligns with `scripts.md`). */
export const SCRIPT5_BACKGROUND_QUOTE_OPEN =
  'Sounds good. I’m queuing a background quote to the web team—you’ll get a handoff, not the full five-question visit note.'

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
