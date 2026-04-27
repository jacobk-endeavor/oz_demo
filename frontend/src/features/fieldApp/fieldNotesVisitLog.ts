/** localStorage log for the Field Notes workflow (tabular visit rows from Field App). */
const STORAGE_KEY = 'oz-demo-field-notes-visit-log' as const

export type FieldNotesVisitLogRow = {
  id: string
  at: string
  /** Rep label (demo: local user) */
  userLabel: string
  customer: string
  competitors: string
  insights: string
  lineItems: string
  shipTo: string
  fullNote: string
}

function safeParse(raw: string | null): FieldNotesVisitLogRow[] {
  if (!raw) return []
  try {
    const j = JSON.parse(raw) as unknown
    if (!Array.isArray(j)) return []
    return j.filter(
      (r) =>
        r &&
        typeof r === 'object' &&
        'id' in r &&
        'at' in r &&
        typeof (r as FieldNotesVisitLogRow).id === 'string',
    ) as FieldNotesVisitLogRow[]
  } catch {
    return []
  }
}

export function readFieldNotesVisitLog(): FieldNotesVisitLogRow[] {
  if (import.meta.env.VITEST) return []
  try {
    return safeParse(typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null)
  } catch {
    return []
  }
}

export function appendFieldNotesVisitLog(row: Omit<FieldNotesVisitLogRow, 'id' | 'at'>): FieldNotesVisitLogRow {
  const at = new Date().toISOString()
  const id = `v-${at}-${Math.random().toString(36).slice(2, 9)}`
  const full: FieldNotesVisitLogRow = { ...row, id, at }
  if (import.meta.env.VITEST) return full
  try {
    if (typeof window === 'undefined' || !window.localStorage) return full
    const prev = readFieldNotesVisitLog()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([full, ...prev]))
  } catch {
    /* ignore */
  }
  return full
}

export function buildFullNoteFromParts(parts: {
  customer: string
  competitors: string
  insights: string
  lineItems: string
  shipTo: string
}): string {
  const lines = [
    `Customer / contact: ${parts.customer}`.trim(),
    `Competitors / who else: ${parts.competitors}`.trim(),
    `Call insights: ${parts.insights}`.trim(),
    `Order (parts, SKUs, qtys): ${parts.lineItems}`.trim(),
    `Ship to: ${parts.shipTo}`.trim(),
  ]
  return lines.join('\n\n')
}
