import { KENNY_TTS_AUDIO_BRIEF } from './fieldDemoKennyData'
import {
  SCRIPT1_OPEN_REPLY,
  SCRIPT2_EMAIL_SENDING_REPLY,
  SCRIPT3_T1_PROJECT_BASICS,
  SCRIPT3_T2_DESCRIPTION_AND_ORDER,
  SCRIPT3_T3_COMPONENTS,
  SCRIPT3_T4_LABOR,
  SCRIPT3_T5_ADDITIONAL_AND_PAYMENT,
  SCRIPT3_T6_CLOSE,
  SCRIPT5_BACKGROUND_QUOTE_OPEN,
  TTS_RECOMMEND,
  TTS_UPSELL,
  TTS_USE_CASES,
  VOICE_MEMO_RECORDING_ACK,
} from './fieldDemoVoiceCopy'

export type FieldScriptStep = {
  /** Short label (e.g. "Script 1 — Customer history (1/2)") shown above the orb. */
  label: string
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
   * voice column dispatches the matching effect — e.g. "capture-field-memo"
   * appends the demo voice memo to the field-notes store.
   */
  sideEffect?: 'capture-field-memo'
}

/**
 * The end-to-end demo run: every Oz line from `scripts.md`, top to bottom, in
 * the order the rep walks the demo. Tap the orb, speak, stop; the next entry
 * plays. After the last entry, the run ends.
 *
 * Demo arc:
 *   Script 1 — customer history (Kenny Hills) — 2 turns
 *   Script 2 — recommend & cross-sell           — 4 turns
 *   Script 3 — field-meeting voice memo         — 1 turn (rep dictates,
 *              Oz acks "Cool, recording", memo lands in Field Notes)
 *   Script 4 — Sammy Carter quote (one-by-one)  — 6 turns into the Job Cost Recap
 *   Script 5 — background quote handoff         — 1 turn
 *
 * The voice-memo turn intentionally runs **before** the quote Q&A so the rep's
 * dictated context is in Field Notes by the time they walk into the quote work.
 */
export function buildFieldScriptQueue(): readonly FieldScriptStep[] {
  return [
    { scriptIndex: 1, label: 'Script 1 — Customer history (1/2)', ozSays: SCRIPT1_OPEN_REPLY },
    { scriptIndex: 1, label: 'Script 1 — Customer history (2/2)', ozSays: KENNY_TTS_AUDIO_BRIEF },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (1/4)', ozSays: TTS_RECOMMEND },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (2/4)', ozSays: TTS_USE_CASES },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (3/4)', ozSays: TTS_UPSELL },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (4/4)', ozSays: SCRIPT2_EMAIL_SENDING_REPLY },
    {
      scriptIndex: 3,
      label: 'Script 3 — Field-meeting voice memo',
      ozSays: VOICE_MEMO_RECORDING_ACK,
      sideEffect: 'capture-field-memo',
    },
    { scriptIndex: 4, label: 'Script 4 — Sammy Carter quote (1/6) project basics', ozSays: SCRIPT3_T1_PROJECT_BASICS },
    { scriptIndex: 4, label: 'Script 4 — Sammy Carter quote (2/6) description + order value', ozSays: SCRIPT3_T2_DESCRIPTION_AND_ORDER },
    { scriptIndex: 4, label: 'Script 4 — Sammy Carter quote (3/6) component costs', ozSays: SCRIPT3_T3_COMPONENTS },
    { scriptIndex: 4, label: 'Script 4 — Sammy Carter quote (4/6) labor', ozSays: SCRIPT3_T4_LABOR },
    { scriptIndex: 4, label: 'Script 4 — Sammy Carter quote (5/6) additional + payment', ozSays: SCRIPT3_T5_ADDITIONAL_AND_PAYMENT },
    { scriptIndex: 4, label: 'Script 4 — Sammy Carter quote (6/6) close', ozSays: SCRIPT3_T6_CLOSE },
    { scriptIndex: 5, label: 'Script 5 — Background quote', ozSays: SCRIPT5_BACKGROUND_QUOTE_OPEN },
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
