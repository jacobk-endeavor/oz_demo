import { KENNY_TTS_AUDIO_BRIEF } from './fieldDemoKennyData'
import {
  SCRIPT1_OPEN_REPLY,
  SCRIPT2_OPEN_REPLY,
  SCRIPT2_SPEC_BRIDGE,
  SCRIPT2_UPSELL_INTRO,
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
}

/**
 * The end-to-end demo run: every Oz line from `scripts.md`, top to bottom, in
 * the order the rep walks the demo. Tap the orb, speak, stop; the next entry
 * plays. After the last entry, the run ends.
 */
export function buildFieldScriptQueue(): readonly FieldScriptStep[] {
  return [
    { label: 'Script 1 — Customer history (1/2)', ozSays: SCRIPT1_OPEN_REPLY },
    { label: 'Script 1 — Customer history (2/2)', ozSays: KENNY_TTS_AUDIO_BRIEF },
    { label: 'Script 2 — What to recommend (1/4)', ozSays: SCRIPT2_OPEN_REPLY },
    { label: 'Script 2 — What to recommend (2/4)', ozSays: TTS_RECOMMEND },
    { label: 'Script 2 — What to recommend (3/4)', ozSays: SCRIPT2_SPEC_BRIDGE },
    { label: 'Script 2 — What to recommend (4/4)', ozSays: TTS_USE_CASES },
    { label: 'Script 3 — Upsell & cross-sell (1/2)', ozSays: SCRIPT2_UPSELL_INTRO },
    { label: 'Script 3 — Upsell & cross-sell (2/2)', ozSays: TTS_UPSELL },
    { label: 'Script 4 — Prospect Q&A', ozSays: buildProspectOpeningTtsText() },
    { label: 'Script 5 — Background quote', ozSays: SCRIPT5_BACKGROUND_QUOTE_OPEN },
  ]
}
