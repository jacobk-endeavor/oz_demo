import {
  type DemoInvoiceEditFields,
  DUMMY_INVOICE_FILE,
  DUMMY_INVOICE_REVIEW_ID,
  buildCustomerSummaryFromDemoFields,
  DEFAULT_DEMO_INVOICE_FIELDS,
  getInvoicePdfBase64FromFields,
  normalizeDemoInvoiceFields,
} from './dummyDemoInvoice'

const STORAGE_KEY = 'oz-quotes-ready-for-review'
export const QUOTES_READY_CHANGED_EVENT = 'oz-quotes-ready-changed' as const

/** Set when the Field home voice run finishes the lumber handoff; same-tab session only. */
export const VOICE_LUMBER_HANDOFF_SESSION_KEY = 'oz-voice-lumber-quote-unlocked' as const

const MAX_QUOTES = 12

export function setVoiceLumberHandoffUnlocked(): void {
  if (import.meta.env.VITEST || typeof window === 'undefined') return
  try {
    sessionStorage.setItem(VOICE_LUMBER_HANDOFF_SESSION_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function isVoiceLumberHandoffUnlocked(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(VOICE_LUMBER_HANDOFF_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

/** Lumber JCR row id — added to #/quotes-ready when the Field home voice run finishes (generating-quote TTS). */
export const JCR_LUMBER_REVIEW_ID = 'QRV-DEMO-JCR-CARTER' as const
export const JCR_LUMBER_REVIEW_FILE = 'voice-quote-summit-ridge-lumber-package.xlsx' as const

/**
 * Drops the lumber JCR row from persistence when opening Quotes Ready if this tab never completed
 * the voice handoff — clears stale rows left from older builds or prior sessions.
 */
export function pruneJcrLumberQuoteUnlessUnlocked(): void {
  if (import.meta.env.VITEST || typeof window === 'undefined') return
  if (isVoiceLumberHandoffUnlocked()) return
  const list = readQuotesReadyForReview()
  const next = list.filter((e) => e.id !== JCR_LUMBER_REVIEW_ID)
  if (next.length === list.length) return
  writeLocal(next)
  dispatchChanged()
}

export const JCR_KENNY_REVIEW_ID = 'QRV-DEMO-JCR-KENNY' as const
export const JCR_KENNY_REVIEW_FILE = 'voice-quote-kenny-hills-deck-package.xlsx' as const

export type JcrSeed = 'lumber' | 'kenny-hills'

export type QuoteReadyForReviewEntry = {
  /** Human-readable review code, e.g. QRV-20260425-A3F2 */
  id: string
  fileName: string
  createdAt: string
  source: 'prospect-order-background' | 'demo-invoice' | 'jcr-quote'
  /** Raw PDF bytes as base64 (no data: prefix). Empty for jcr-quote entries. */
  pdfBase64: string
  customerSummary?: string
  /** When source is demo-invoice — used to rebuild the PDF after edits. */
  demoInvoiceFields?: DemoInvoiceEditFields
  /** When source is jcr-quote — which schema preset to seed the sheet from. */
  jcrSeed?: JcrSeed
  /** When source is jcr-quote — last-edited cell values, persisted across navigation. */
  jcrSavedValues?: Record<string, string | number>
}

function normalizeJcrSavedValues(raw: unknown): Record<string, string | number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Pre–voice-schema `jcrSavedValues` used mech/elec / component-cost ids; drop so the sheet re-seeds from defaults. */
function isLegacyJcrSavedKeys(saved: Record<string, string | number> | undefined): boolean {
  if (!saved) return false
  return (
    'electrical_components' in saved ||
    'mechanical_design_hrs' in saved ||
    'commercial_mechanical_components' in saved
  )
}

function parseStored(raw: string | null): QuoteReadyForReviewEntry[] {
  if (!raw?.trim()) return []
  try {
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    return p
      .filter((x) => x != null && typeof (x as QuoteReadyForReviewEntry).id === 'string')
      .map((x) => {
        const e = x as QuoteReadyForReviewEntry
        const source: QuoteReadyForReviewEntry['source'] =
          e.source === 'demo-invoice'
            ? 'demo-invoice'
            : e.source === 'jcr-quote'
              ? 'jcr-quote'
              : 'prospect-order-background'
        const demoInvoiceFields =
          source === 'demo-invoice' ? normalizeDemoInvoiceFields(e.demoInvoiceFields) : undefined
        const jcrSeed: JcrSeed | undefined =
          source === 'jcr-quote'
            ? e.jcrSeed === 'kenny-hills'
              ? 'kenny-hills'
              : 'lumber'
            : undefined
        let jcrSavedValues =
          source === 'jcr-quote' ? normalizeJcrSavedValues(e.jcrSavedValues) : undefined
        if (jcrSavedValues && isLegacyJcrSavedKeys(jcrSavedValues)) jcrSavedValues = undefined
        return {
          ...e,
          source,
          pdfBase64: typeof e.pdfBase64 === 'string' ? e.pdfBase64 : '',
          demoInvoiceFields,
          jcrSeed,
          jcrSavedValues,
        }
      })
  } catch {
    return []
  }
}

export function readQuotesReadyForReview(): QuoteReadyForReviewEntry[] {
  if (typeof window === 'undefined') return []
  try {
    return parseStored(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

function writeLocal(entries: QuoteReadyForReviewEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // quota — drop oldest
    if (entries.length > 1) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, -1)))
      } catch {
        /* ignore */
      }
    }
  }
}

export function base64ToPdfBlob(b64: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: 'application/pdf' })
}

function dispatchChanged(): void {
  try {
    window.dispatchEvent(new Event(QUOTES_READY_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

export function removeQuoteReady(id: string): void {
  if (import.meta.env.VITEST) return
  const rest = readQuotesReadyForReview().filter((e) => e.id !== id)
  writeLocal(rest)
  dispatchChanged()
}

/** Persist edited demo fields and regenerate the stored PDF bytes. */
export function applyDemoInvoiceFieldsUpdate(id: string, fields: DemoInvoiceEditFields): void {
  if (import.meta.env.VITEST || typeof window === 'undefined') return
  const list = readQuotesReadyForReview()
  const idx = list.findIndex((e) => e.id === id)
  if (idx < 0) return
  const e = list[idx]
  if (e.source !== 'demo-invoice') return
  const pdfBase64 = getInvoicePdfBase64FromFields(fields, e.id)
  list[idx] = {
    ...e,
    demoInvoiceFields: { ...fields },
    pdfBase64,
    customerSummary: buildCustomerSummaryFromDemoFields(fields),
  }
  writeLocal(list)
  dispatchChanged()
}

/** Persist edited Job Cost Recap values for a jcr-quote entry. */
export function applyJcrQuoteValues(id: string, values: Record<string, string | number>): void {
  if (import.meta.env.VITEST || typeof window === 'undefined') return
  const list = readQuotesReadyForReview()
  const idx = list.findIndex((e) => e.id === id)
  if (idx < 0) return
  const e = list[idx]
  if (e.source !== 'jcr-quote') return
  const customer = typeof values.customer_name === 'string' ? values.customer_name : ''
  const ref = typeof values.ref_quote_numbers === 'string' ? values.ref_quote_numbers : ''
  const summaryBits = [customer, ref].filter(Boolean).join(' · ')
  list[idx] = {
    ...e,
    jcrSavedValues: { ...values },
    customerSummary: summaryBits || e.customerSummary,
  }
  writeLocal(list)
  dispatchChanged()
}

/**
 * Upserts the Summit Ridge lumber JCR row on #/quotes-ready when the Field voice run finishes
 * (“Okay, generating the quote.”). Sets {@link setVoiceLumberHandoffUnlocked} first. Each handoff
 * refreshes **Received** (`createdAt`) to now and moves the row to the top.
 */
export function seedJcrLumberQuoteIfAbsent(): void {
  if (import.meta.env.VITEST || typeof window === 'undefined') return
  if (!isVoiceLumberHandoffUnlocked()) return
  const now = new Date().toISOString()
  const list = readQuotesReadyForReview()
  const idx = list.findIndex((e) => e.id === JCR_LUMBER_REVIEW_ID)
  if (idx >= 0) {
    const cur = list[idx]
    const bumped: QuoteReadyForReviewEntry = {
      ...cur,
      createdAt: now,
      source: 'jcr-quote',
      fileName: JCR_LUMBER_REVIEW_FILE,
      jcrSeed: 'lumber',
    }
    const rest = [...list.slice(0, idx), ...list.slice(idx + 1)]
    writeLocal([bumped, ...rest].slice(0, MAX_QUOTES))
  } else {
    const entry: QuoteReadyForReviewEntry = {
      id: JCR_LUMBER_REVIEW_ID,
      fileName: JCR_LUMBER_REVIEW_FILE,
      createdAt: now,
      source: 'jcr-quote',
      pdfBase64: '',
      customerSummary: 'Summit Ridge Framing · lumber package (Q25-4420-LUM) — voice quote template',
      jcrSeed: 'lumber',
    }
    writeLocal([entry, ...list].slice(0, MAX_QUOTES))
  }
  dispatchChanged()
}

/**
 * Ensures a fixed demo invoice is in the queue (12× 2x4 @ $10, Elm St Chicago) so the review page is never empty in the demo.
 * Skipped if that review id was already present (e.g. user removed it — we do not re-add).
 */
export function seedDummyInvoiceIfAbsent(): void {
  if (import.meta.env.VITEST || typeof window === 'undefined') return
  const list = readQuotesReadyForReview()
  if (list.some((e) => e.id === DUMMY_INVOICE_REVIEW_ID)) return
  const demoFields = normalizeDemoInvoiceFields(DEFAULT_DEMO_INVOICE_FIELDS)
  const entry: QuoteReadyForReviewEntry = {
    id: DUMMY_INVOICE_REVIEW_ID,
    fileName: DUMMY_INVOICE_FILE,
    createdAt: new Date().toISOString(),
    source: 'demo-invoice',
    pdfBase64: getInvoicePdfBase64FromFields(demoFields, DUMMY_INVOICE_REVIEW_ID),
    customerSummary: buildCustomerSummaryFromDemoFields(demoFields),
    demoInvoiceFields: demoFields,
  }
  writeLocal([entry, ...list].slice(0, MAX_QUOTES))
  dispatchChanged()
}
