import { useEffect } from 'react'
import { playFieldElevenTts, stopFieldTts } from '../../services/fieldElevenTts'
import { buildProspectOpeningTtsText } from './prospectNotesData'
import {
  CUSTOMER_HISTORY_VOICE_FALLBACK,
  KENNY_TTS_AUDIO_BRIEF,
  PROSPECT_OZ_TTS,
  SCRIPT1_AFTER_AUDIO_SUMMARY,
  SCRIPT1_OPEN_REPLY,
  SCRIPT2_EMAIL_REPLY,
  SCRIPT2_OPEN_REPLY,
  SCRIPT2_PRODUCT_STALE_HINT,
  SCRIPT2_SPEC_BRIDGE,
  SCRIPT2_UPSELL_INTRO,
  SCRIPT5_BACKGROUND_QUOTE_OPEN,
  TTS_RECOMMEND,
  TTS_UPSELL,
  TTS_USE_CASES,
} from './fieldDemoVoiceCopy'

export type FieldTtsHotkeyEntry = {
  /** `KeyboardEvent.key` (e.g. `1`, `a`; Numpad digits normalize to same as top row). */
  key: string
  label: string
  text: string
}

function buildFieldTtsHotkeyTable(): readonly FieldTtsHotkeyEntry[] {
  const prospectOpening = buildProspectOpeningTtsText()
  const prospectSteps = PROSPECT_OZ_TTS.map((text, i) => ({
    key: ['a', 's', 'd', 'f', 'g', 'h', 'j'][i]!,
    label: `Prospect Oz line ${i + 1} / 7`,
    text,
  }))
  return [
    { key: '1', label: 'Script 1 — Oz open (customer history)', text: SCRIPT1_OPEN_REPLY },
    { key: '2', label: 'Script 1 — Kenny audio brief', text: KENNY_TTS_AUDIO_BRIEF },
    { key: '3', label: 'Script 1 — after audio summary', text: SCRIPT1_AFTER_AUDIO_SUMMARY },
    { key: '4', label: 'Script 2 — open What to recommend', text: SCRIPT2_OPEN_REPLY },
    { key: '5', label: 'Script 2 — visit signal', text: TTS_RECOMMEND },
    { key: '6', label: 'Script 2 — spec bridge', text: SCRIPT2_SPEC_BRIDGE },
    { key: '7', label: 'Script 2 — use cases', text: TTS_USE_CASES },
    { key: '8', label: 'Script 3 — open upsell run', text: SCRIPT2_UPSELL_INTRO },
    { key: '9', label: 'Script 3 — bundle TTS', text: TTS_UPSELL },
    { key: '0', label: 'Script 2 — email handoff', text: SCRIPT2_EMAIL_REPLY },
    { key: 'z', label: 'Script 2 — stale hint', text: SCRIPT2_PRODUCT_STALE_HINT },
    { key: 'x', label: 'Customer history LLM fallback', text: CUSTOMER_HISTORY_VOICE_FALLBACK },
    { key: 'c', label: 'Script 5 — background quote open', text: SCRIPT5_BACKGROUND_QUOTE_OPEN },
    { key: 'p', label: 'Script 4 — prospect opening (all five Qs)', text: prospectOpening },
    ...prospectSteps,
  ] as const
}

export const FIELD_TTS_HOTKEYS: readonly FieldTtsHotkeyEntry[] = buildFieldTtsHotkeyTable()

const HOTKEY_MAP = new Map(FIELD_TTS_HOTKEYS.map((e) => [e.key, e.text]))

function hotkeysAllowedForTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true
  if (target.closest('button, input, textarea, select, [contenteditable="true"]')) return false
  return true
}

/**
 * While the Field app is mounted: digit/letter keys play the fixed Eleven Labs lines from
 * `fieldDemoVoiceCopy.ts`; **Enter** stops playback. Hotkeys are ignored when focus is
 * inside a form control or interactive element.
 */
export function useFieldAppTtsHotkeys(): void {
  useEffect(() => {
    if (import.meta.env.VITEST) return

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (!hotkeysAllowedForTarget(ev.target)) return

      if (ev.key === 'Enter') {
        const el = ev.target instanceof HTMLElement ? ev.target : null
        if (el?.closest('summary, a[href]')) return
        stopFieldTts()
        ev.preventDefault()
        return
      }

      const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key
      const text = HOTKEY_MAP.get(k)
      if (!text) return

      ev.preventDefault()
      void playFieldElevenTts(text, { sessionKey: 'hotkey' }).catch(() => {})
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}

export function FieldTtsHotkeyLegend() {
  const rows = [
    { title: '1–0', keys: FIELD_TTS_HOTKEYS.filter((e) => /^[0-9]$/.test(e.key)) },
    { title: 'Letters', keys: FIELD_TTS_HOTKEYS.filter((e) => !/^[0-9]$/.test(e.key)) },
  ]
  return (
    <details
      className="mt-2 rounded-xl border border-zinc-200/90 bg-white/80 px-2 py-1.5 text-[11px] text-zinc-700 shadow-sm"
      data-testid="field-tts-hotkey-legend"
    >
      <summary className="cursor-pointer select-none font-semibold text-zinc-900">Keyboard TTS (demo)</summary>
      <p className="mt-1.5 text-zinc-600">
        <strong>Enter</strong> stops playback. Keys work when a field or button is not focused. The orb pulses to your
        mic input; these hotkeys and the on-screen Hear/Play buttons are the only things that drive Oz audio.
      </p>
      {rows.map(({ title, keys }) => (
        <div key={title} className="mt-2">
          <p className="font-medium text-zinc-800">{title}</p>
          <ul className="mt-0.5 max-h-40 space-y-0.5 overflow-y-auto font-mono text-[10px] leading-snug">
            {keys.map((e) => (
              <li key={e.key + e.label}>
                <kbd className="rounded border border-zinc-300 bg-zinc-100 px-1">{e.key}</kbd> {e.label}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  )
}
