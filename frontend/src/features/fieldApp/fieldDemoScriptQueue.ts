import { KENNY_TTS_AUDIO_BRIEF } from './fieldDemoKennyData'
import {
  SCRIPT1_OPEN_REPLY,
  SCRIPT2_EMAIL_SENDING_REPLY,
  SCRIPT3_T1_PROJECT_BASICS,
  SCRIPT3_T2_DESCRIPTION_AND_ORDER,
  SCRIPT3_T3_COMPONENTS,
  SCRIPT3_T5_ADDITIONAL_AND_PAYMENT,
  SCRIPT3_T6_CLOSE,
  SCRIPT_QUOTE_GENERATING,
  DEMO_REP_FIELD_MEMO_CANNED_TEXT,
  TTS_RECOMMEND,
  TTS_UPSELL,
  TTS_USE_CASES,
  VOICE_MEMO_OPEN_LINE,
  VOICE_MEMO_RECORDING_ACK,
  VOICE_MEMO_SAVED_THANKS,
} from './fieldDemoVoiceCopy'

export type FieldScriptStep = {
  /** Short label (e.g. "Script 1 — Customer history (1/2)") shown above the orb. */
  label: string
  /**
   * What the rep should say on this turn (read aloud to advance). Shown in the script
   * overlay; aligns with the Field voice runbook / `scripts.md` “You read aloud” column.
   */
  repLine: string
  /** Exact Eleven Labs text to play when the user finishes speaking on this turn. */
  ozSays: string
  /**
   * Index of the script this step belongs to (1-based). Adjacent steps that
   * share a `scriptIndex` are turns within the same script; the Skip button
   * uses this to fast-forward to the first step of the next script.
   */
  scriptIndex: number
  /**
   * Optional side-effect tag run after this step's TTS finishes. The Field App
   * voice column dispatches the matching effect — e.g.
   * "send-product-specs-email" posts the canned spec email through the dev
   * server's SMTP proxy.
   */
  sideEffect?: 'send-product-specs-email' | 'seed-quotes-ready-lumber'
  /**
   * After “Ok, recording” — on rep **speech end** (same VAD as other lines), save the **canned**
   * Field Notes row and advance to the thank-you TTS. `ozSays` is empty; this index never plays audio.
   */
  appendCannedFieldMemoOnSpeechEnd?: boolean
  /**
   * After the previous step's TTS, skip rep listening and play this step's Oz line immediately
   * (e.g. automatic "generating quote" ack after the JCR close).
   */
  skipRepListen?: boolean
}

/**
 * The end-to-end demo run: every Oz line from `scripts.md`, top to bottom, in
 * the order the rep walks the demo. Tap the orb, speak, stop; the next entry
 * plays. After the last entry, the run ends.
 *
 * Demo arc:
 *   Script 1 — customer history (Kenny Hills) — 2 turns
 *   Script 2 — recommend & cross-sell           — 4 turns
 *   Script 3 — field memo (demo rep)            — "Ok, recording" → rep speaks, VAD on **stop** → canned memo in Field Notes + Oz thanks (no P, no transcription)
 *   Script 4 — Summit Ridge lumber package      — 5 rep turns + automatic "generating quote" Oz line (no labor Q&A)
 *
 * The voice-memo turn runs **before** the quote Q&A so the Field Notes table is
 * updated before the lumber walkthrough.
 */
const REP_LN_SCRIPT1_OPEN =
  "I'm about to visit contractor Kenny Hills — what have we sold them, and what notes are on the account?"

const REP_LN_KENNY_AUDIO =
  'Optional: In Customer history, tap “Hear a quick audio summary” for the long read, or pause briefly to continue the voice run as-is.'

const REP_LN_WHY_REC =
  'What products should I recommend?'

const REP_LN_USE_CASES =
  'Pause, or in What to recommend use the on-card controls. Next Oz line covers use cases (coastal decks, gapping, etc.).'

const REP_LN_UPSELL =
  'For Kenny Hills, what do accounts usually add when they buy what I am recommending, plus the fasteners?'

const REP_LN_SPECS_EMAIL =
  'Do you have spec sheets? Send the capped composite and Apex fastener pack to my email from the product run.'

const REP_LN_LUMBER_OPEN = "Let's do a quote for Summit Ridge."

const REP_LN_LUMBER_1 =
  'Customer is Summit Ridge Framing. We are quoting the Marshall Court job — twelve wood-frame units over podium, full lumber-and-sheathing package, three flatbed drops locked to their crane picks and a PO reference that matches their release schedule.'

const REP_LN_LUMBER_2 =
  'Cover line: Marshall Court multi-family wood frame for Summit Ridge. Order value on the cover is two hundred eighty-five thousand dollars even, before tax.'

const REP_LN_LUMBER_3 =
  'Buckets for the sheet: thirty-eight thousand five hundred in dimensional and stud packs — long SPF, plates, and jack studs off the issued framing schedule. Sixty-two thousand in engineered — LVL beams and I-joist runs for the floor system they approved last week. Zero in treated or specialty stock on this phase — nothing exotic on the commodity side.'

const REP_LN_LUMBER_4 =
  'Wrap-up costs: sixty-five hundred indirect for PM and document control, forty-two hundred travel for site pulls and sign-offs, twenty-eight hundred freight on the three staged flatbeds. No rep commission booked on this one. Payment is fifty percent on lumber P-O acceptance and the balance net-thirty after final delivery — use P-O-S-R-MARSHALL-zero-four-two-six when they release so finance can tie the draw.'

const REP_OZ_GENERATING = '(This step: Oz only — no line to read. Oz confirms the quote is generating.)'

export function buildFieldScriptQueue(): readonly FieldScriptStep[] {
  return [
    { scriptIndex: 1, label: 'Script 1 — Customer history (1/2)', repLine: REP_LN_SCRIPT1_OPEN, ozSays: SCRIPT1_OPEN_REPLY },
    { scriptIndex: 1, label: 'Script 1 — Customer history (2/2)', repLine: REP_LN_KENNY_AUDIO, ozSays: KENNY_TTS_AUDIO_BRIEF },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (1/4)', repLine: REP_LN_WHY_REC, ozSays: TTS_RECOMMEND },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (2/4)', repLine: REP_LN_USE_CASES, ozSays: TTS_USE_CASES },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (3/4)', repLine: REP_LN_UPSELL, ozSays: TTS_UPSELL },
    {
      scriptIndex: 2,
      label: 'Script 2 — Recommend & cross-sell (4/4)',
      repLine: REP_LN_SPECS_EMAIL,
      ozSays: SCRIPT2_EMAIL_SENDING_REPLY,
      sideEffect: 'send-product-specs-email',
    },
    {
      scriptIndex: 3,
      label: `Script 3 — Field memo (1/3) — e.g. “${VOICE_MEMO_OPEN_LINE}”`,
      repLine: VOICE_MEMO_OPEN_LINE,
      ozSays: VOICE_MEMO_RECORDING_ACK,
    },
    {
      scriptIndex: 3,
      label: 'Script 3 — Field memo (2/3) — your next line after Ok, recording',
      repLine: DEMO_REP_FIELD_MEMO_CANNED_TEXT,
      ozSays: '',
      appendCannedFieldMemoOnSpeechEnd: true,
    },
    { scriptIndex: 3, label: 'Script 3 — Field memo (3/3) — Oz thank-you', repLine: '(Listen — Oz thank-you; no new rep line on this turn.)', ozSays: VOICE_MEMO_SAVED_THANKS },
    { scriptIndex: 4, label: 'Script 4 — Lumber quote (1/5) open — quote for Summit Ridge', repLine: REP_LN_LUMBER_OPEN, ozSays: SCRIPT3_T1_PROJECT_BASICS },
    { scriptIndex: 4, label: 'Script 4 — Lumber quote (2/5) customer + deal', repLine: REP_LN_LUMBER_1, ozSays: SCRIPT3_T2_DESCRIPTION_AND_ORDER },
    { scriptIndex: 4, label: 'Script 4 — Lumber quote (3/5) description + order value', repLine: REP_LN_LUMBER_2, ozSays: SCRIPT3_T3_COMPONENTS },
    { scriptIndex: 4, label: 'Script 4 — Lumber quote (4/5) material buckets', repLine: REP_LN_LUMBER_3, ozSays: SCRIPT3_T5_ADDITIONAL_AND_PAYMENT },
    { scriptIndex: 4, label: 'Script 4 — Lumber quote (5/5) indirect + payment', repLine: REP_LN_LUMBER_4, ozSays: SCRIPT3_T6_CLOSE },
    {
      scriptIndex: 4,
      label: 'Script 4 — Generating quote (Oz only)',
      repLine: REP_OZ_GENERATING,
      ozSays: SCRIPT_QUOTE_GENERATING,
      skipRepListen: true,
      sideEffect: 'seed-quotes-ready-lumber',
    },
  ]
}

/**
 * Index of the first step belonging to the next script after `currentIndex`,
 * or `null` if `currentIndex` is already in the final script. Used by the UI
 * skip button to fast-forward past the rest of the current script.
 */
export function nextScriptStartIndex(
  queue: readonly FieldScriptStep[],
  currentIndex: number,
): number | null {
  const current = queue[currentIndex]
  if (!current) return null
  for (let i = currentIndex + 1; i < queue.length; i += 1) {
    if (queue[i]!.scriptIndex !== current.scriptIndex) return i
  }
  return null
}

/**
 * When the user jumps to `index` in the queue, which interaction mode applies first.
 * `awaitOrb` = first line of a new script: mic is off until the rep taps the orb.
 */
export function phaseForSeekedStep(
  queue: readonly FieldScriptStep[],
  index: number,
): 'listening' | 'oz' | 'awaitOrb' {
  const step = queue[index]
  if (!step) return 'listening'
  if (step.skipRepListen) return 'oz'
  if (index > 0 && queue[index - 1]!.appendCannedFieldMemoOnSpeechEnd) return 'oz'
  if (index > 0 && step.scriptIndex !== queue[index - 1]!.scriptIndex) return 'awaitOrb'
  return 'listening'
}
