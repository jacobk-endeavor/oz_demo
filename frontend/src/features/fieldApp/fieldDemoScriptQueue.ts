import { KENNY_TTS_AUDIO_BRIEF } from './fieldDemoKennyData'
import {
  SCRIPT1_OPEN_REPLY,
  SCRIPT2_EMAIL_SENDING_REPLY,
  SCRIPT5_BACKGROUND_QUOTE_OPEN,
  TTS_RECOMMEND,
  TTS_UPSELL,
  TTS_USE_CASES,
} from './fieldDemoVoiceCopy'
import { buildProspectOpeningTtsText } from './prospectNotesData'

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
}

/**
 * The end-to-end demo run: every Oz line from `scripts.md`, top to bottom, in
 * the order the rep walks the demo. Tap the orb, speak, stop; the next entry
 * plays. After the last entry, the run ends.
 *
 * Scripts 2 and 3 are merged: "What products should I recommend?" jumps
 * straight into the visit signal, then use cases, then the cross-sell bundle,
 * and the script closes when the rep asks for the specs by email.
 */
export function buildFieldScriptQueue(): readonly FieldScriptStep[] {
  return [
    { scriptIndex: 1, label: 'Script 1 — Customer history (1/2)', ozSays: SCRIPT1_OPEN_REPLY },
    { scriptIndex: 1, label: 'Script 1 — Customer history (2/2)', ozSays: KENNY_TTS_AUDIO_BRIEF },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (1/4)', ozSays: TTS_RECOMMEND },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (2/4)', ozSays: TTS_USE_CASES },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (3/4)', ozSays: TTS_UPSELL },
    { scriptIndex: 2, label: 'Script 2 — Recommend & cross-sell (4/4)', ozSays: SCRIPT2_EMAIL_SENDING_REPLY },
    { scriptIndex: 3, label: 'Script 3 — Prospect Q&A', ozSays: buildProspectOpeningTtsText() },
    { scriptIndex: 4, label: 'Script 4 — Background quote', ozSays: SCRIPT5_BACKGROUND_QUOTE_OPEN },
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
