/**
 * Local store for **incoming voice memos** (Field App Script 3 and Field Notes **P**).
 * The Field Notes page merges this list with the static `VOICE_MEMO_DEMO` array.
 */
import type { VoiceMemoRow } from './fieldNotesDashboardData'

const STORAGE_KEY = 'oz-demo-voice-memos-v1'
export const VOICE_MEMOS_CHANGED_EVENT = 'oz-voice-memos-changed' as const

const MAX_MEMOS = 24
/** Previous default for demo memos; migrate to `Summit Ridge` on read (see `readStoredVoiceMemos`). */
const LEGACY_MEMO_CUSTOMER = 'Field visit'

function safeParse(raw: string | null): VoiceMemoRow[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is VoiceMemoRow =>
        r != null &&
        typeof r === 'object' &&
        typeof (r as VoiceMemoRow).id === 'string' &&
        typeof (r as VoiceMemoRow).customer === 'string' &&
        typeof (r as VoiceMemoRow).salesman === 'string' &&
        typeof (r as VoiceMemoRow).atIso === 'string' &&
        typeof (r as VoiceMemoRow).notesPreview === 'string' &&
        Array.isArray((r as VoiceMemoRow).conversation),
    )
  } catch {
    return []
  }
}

export function readStoredVoiceMemos(): VoiceMemoRow[] {
  if (import.meta.env.VITEST) return []
  if (typeof window === 'undefined') return []
  try {
    const raw = safeParse(window.localStorage.getItem(STORAGE_KEY))
    const hadLegacy = raw.some((r) => r.customer === LEGACY_MEMO_CUSTOMER)
    if (!hadLegacy) return raw
    const next = raw.map((r) =>
      r.customer === LEGACY_MEMO_CUSTOMER ? { ...r, customer: 'Summit Ridge' } : r,
    )
    writeLocal(next)
    queueMicrotask(() => dispatchChanged())
    return next
  } catch {
    return []
  }
}

function writeLocal(rows: VoiceMemoRow[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    /* quota or disabled — ignore */
  }
}

function dispatchChanged(): void {
  try {
    window.dispatchEvent(new Event(VOICE_MEMOS_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

/**
 * Append a memo to the incoming-voice-memos store. Skipped under Vitest so tests
 * stay deterministic. Returns the row that was stored (with a generated id if needed).
 */
export function appendVoiceMemo(memo: Omit<VoiceMemoRow, 'id'> & { id?: string }): VoiceMemoRow {
  const id =
    memo.id ??
    `vm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const row: VoiceMemoRow = { ...memo, id }
  if (import.meta.env.VITEST) return row
  if (typeof window === 'undefined') return row
  const prev = readStoredVoiceMemos()
  // Idempotent on id — replace existing entry if the same id is appended again
  // (e.g. repeated demo runs reusing a stable id like `vm-demo-sammy-walkthrough`).
  const next = [row, ...prev.filter((r) => r.id !== row.id)].slice(0, MAX_MEMOS)
  writeLocal(next)
  dispatchChanged()
  return row
}

export function removeVoiceMemo(id: string): void {
  if (import.meta.env.VITEST || typeof window === 'undefined') return
  const next = readStoredVoiceMemos().filter((r) => r.id !== id)
  writeLocal(next)
  dispatchChanged()
}
