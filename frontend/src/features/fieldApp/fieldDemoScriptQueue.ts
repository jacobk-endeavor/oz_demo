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
  SCRIPT_QUOTE_GENERATING,
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
   * After “Ok, recording” — on rep **speech end** (same VAD as other lines), save the **canned** Sami
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
 *   Script 3 — field memo (Sami)                 — "Ok, recording" → rep speaks, VAD on **stop** → canned memo in Field Notes + Oz thanks (no P, no transcription)
 *   Script 4 — Summit Ridge lumber package      — 6 rep turns + automatic "generating quote" Oz line
 *
 * The voice-memo turn runs **before** the quote Q&A so the Field Notes table is
 * updated before the lumber walkthrough.
 */
export function buildFieldScriptQueue(): readonly FieldScriptStep[] {
  return [
    { scriptIndex: 1, label: 'Script 1 — Customer history (1/2)', ozSays: SCRIPT1_OPEN_REPLY },
    { scriptIndex: 1, label: 'Script 1 — Customer history (2/2)', ozSays: KENNY_TTS_AUDIO_BRIEF },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (1/4)', ozSays: TTS_RECOMMEND },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (2/4)', ozSays: TTS_USE_CASES },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (3/4)', ozSays: TTS_UPSELL },
    {
      scriptIndex: 2,
      label: 'Script 2 — Recommend & cross-sell (4/4)',
      ozSays: SCRIPT2_EMAIL_SENDING_REPLY,
      sideEffect: 'send-product-specs-email',
    },
    {
      scriptIndex: 3,
      label: `Script 3 — Field memo (1/3) — e.g. “${VOICE_MEMO_OPEN_LINE}”`,
      ozSays: VOICE_MEMO_RECORDING_ACK,
    },
    {
      scriptIndex: 3,
      label: 'Script 3 — Field memo (2/3) — your next line after Ok, recording',
      ozSays: '',
      appendCannedFieldMemoOnSpeechEnd: true,
    },
    { scriptIndex: 3, label: 'Script 3 — Field memo (3/3) — Oz thank-you', ozSays: VOICE_MEMO_SAVED_THANKS },
    { scriptIndex: 4, label: 'Script 4 — Lumber quote (1/6) customer + deal', ozSays: SCRIPT3_T1_PROJECT_BASICS },
    { scriptIndex: 4, label: 'Script 4 — Lumber quote (2/6) description + order value', ozSays: SCRIPT3_T2_DESCRIPTION_AND_ORDER },
    { scriptIndex: 4, label: 'Script 4 — Lumber quote (3/6) material buckets', ozSays: SCRIPT3_T3_COMPONENTS },
    { scriptIndex: 4, label: 'Script 4 — Lumber quote (4/6) takeoff + yard labor', ozSays: SCRIPT3_T4_LABOR },
    { scriptIndex: 4, label: 'Script 4 — Lumber quote (5/6) additional + payment', ozSays: SCRIPT3_T5_ADDITIONAL_AND_PAYMENT },
    { scriptIndex: 4, label: 'Script 4 — Lumber quote (6/6) close', ozSays: SCRIPT3_T6_CLOSE },
    {
      scriptIndex: 4,
      label: 'Script 4 — Generating quote (Oz only)',
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
