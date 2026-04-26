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

const MAX_QUOTES = 12

function generateReviewCode(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const r = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `QRV-${y}${m}${day}-${r}`
}

export type QuoteReadyForReviewEntry = {
  /** Human-readable review code, e.g. QRV-20260425-A3F2 */
  id: string
  fileName: string
  createdAt: string
  source: 'prospect-order-background' | 'demo-invoice'
  /** Raw PDF bytes as base64 (no data: prefix) */
  pdfBase64: string
  customerSummary?: string
  /** When source is demo-invoice — used to rebuild the PDF after edits. */
  demoInvoiceFields?: DemoInvoiceEditFields
}

function parseStored(raw: string | null): QuoteReadyForReviewEntry[] {
  if (!raw?.trim()) return []
  try {
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    return p
      .filter(
        (x) =>
          x != null &&
          typeof (x as QuoteReadyForReviewEntry).id === 'string' &&
          typeof (x as QuoteReadyForReviewEntry).pdfBase64 === 'string',
      )
      .map((x) => {
        const e = x as QuoteReadyForReviewEntry
        const source = e.source === 'demo-invoice' ? 'demo-invoice' : 'prospect-order-background'
        const demoInvoiceFields =
          source === 'demo-invoice' ? normalizeDemoInvoiceFields(e.demoInvoiceFields) : undefined
        return {
          ...e,
          source,
          demoInvoiceFields,
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = r.result
      if (typeof s !== 'string') {
        reject(new Error('read failed'))
        return
      }
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsDataURL(blob)
  })
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

/**
 * When a Field prospect / order background PDF is generated, register it for the “Quotes ready” review queue.
 */
export async function registerQuoteReadyFromProspectOrder(opts: {
  blob: Blob
  fileName: string
  answers: Record<number, string>
}): Promise<QuoteReadyForReviewEntry | null> {
  if (import.meta.env.VITEST) return null
  const pdfBase64 = await blobToBase64(opts.blob)
  const entry: QuoteReadyForReviewEntry = {
    id: generateReviewCode(),
    fileName: opts.fileName,
    createdAt: new Date().toISOString(),
    source: 'prospect-order-background',
    pdfBase64,
    customerSummary: (opts.answers[0] ?? '').trim().slice(0, 200) || undefined,
  }
  const next = [entry, ...readQuotesReadyForReview()].slice(0, MAX_QUOTES)
  writeLocal(next)
  dispatchChanged()
  return entry
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
