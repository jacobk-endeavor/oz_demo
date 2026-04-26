import { jsPDF } from 'jspdf'

export const DUMMY_INVOICE_REVIEW_ID = 'QRV-DEMO-ELM-INVOICE' as const
export const DUMMY_INVOICE_FILE = 'demo-invoice-elm-st-chicago.pdf' as const

const M = 14

export type DemoInvoiceLineItem = {
  id: string
  qty: number
  description: string
  unitPrice: number
}

export type DemoInvoiceEditFields = {
  shipStreet: string
  shipCityStateZip: string
  lineItems: DemoInvoiceLineItem[]
}

function newLineId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* ignore */
  }
  return `li-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** New empty or partially filled line for the editor (add row). */
export function newDemoLineItem(overrides?: Partial<Omit<DemoInvoiceLineItem, 'id'>>): DemoInvoiceLineItem {
  return {
    id: newLineId(),
    qty: 1,
    description: '',
    unitPrice: 0,
    ...overrides,
  }
}

const DEFAULT_SEED_LINE_ID = 'demo-line-seed' as const

export const DEFAULT_DEMO_INVOICE_FIELDS: DemoInvoiceEditFields = {
  shipStreet: '1234 Elm Street',
  shipCityStateZip: 'Chicago, Illinois 60062',
  lineItems: [
    {
      id: DEFAULT_SEED_LINE_ID,
      qty: 12,
      description: '2x4 lumber (construction)',
      unitPrice: 10,
    },
  ],
}

function clampQty(n: number): number {
  return Math.max(0, Math.floor(Number.isFinite(n) ? n : 0))
}

function clampMoney(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100)
}

function parseQtyLoose(x: unknown): number {
  if (typeof x === 'number' && Number.isFinite(x)) return clampQty(x)
  if (typeof x === 'string') return clampQty(parseInt(x.replace(/[^0-9]/g, ''), 10) || 0)
  return 0
}

function parseMoneyLoose(x: unknown): number {
  if (typeof x === 'number' && Number.isFinite(x)) return clampMoney(x)
  if (typeof x === 'string') {
    const n = parseFloat(x.replace(/[^0-9.-]/g, ''))
    return clampMoney(Number.isFinite(n) ? n : 0)
  }
  return 0
}

function normalizeLineItem(row: unknown): DemoInvoiceLineItem | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  return {
    id: typeof r.id === 'string' && r.id.trim() ? r.id : newLineId(),
    qty: parseQtyLoose(r.qty),
    description: typeof r.description === 'string' ? r.description : '',
    unitPrice: parseMoneyLoose(r.unitPrice),
  }
}

/** Merge stored JSON with defaults; supports legacy single-line { qty, description, unitPrice } on the root object. */
export function normalizeDemoInvoiceFields(input: unknown): DemoInvoiceEditFields {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const shipStreet =
    typeof o.shipStreet === 'string' ? o.shipStreet : DEFAULT_DEMO_INVOICE_FIELDS.shipStreet
  const shipCityStateZip =
    typeof o.shipCityStateZip === 'string' ? o.shipCityStateZip : DEFAULT_DEMO_INVOICE_FIELDS.shipCityStateZip

  let lineItems: DemoInvoiceLineItem[] = []
  if (Array.isArray(o.lineItems) && o.lineItems.length > 0) {
    for (const row of o.lineItems) {
      const li = normalizeLineItem(row)
      if (li) lineItems.push(li)
    }
  }
  if (lineItems.length === 0 && ('qty' in o || 'description' in o || 'unitPrice' in o)) {
    lineItems.push(
      newDemoLineItem({
        qty: parseQtyLoose(o.qty),
        description: typeof o.description === 'string' ? o.description : '',
        unitPrice: parseMoneyLoose(o.unitPrice),
      }),
    )
  }
  if (lineItems.length === 0) {
    lineItems = DEFAULT_DEMO_INVOICE_FIELDS.lineItems.map((x) => ({ ...x }))
  }
  return { shipStreet, shipCityStateZip, lineItems }
}

export function lineItemsSubtotal(lineItems: DemoInvoiceLineItem[]): number {
  let s = 0
  for (const li of lineItems) {
    s += clampQty(li.qty) * clampMoney(li.unitPrice)
  }
  return Math.round(s * 100) / 100
}

function createInvoiceDocFromFields(fields: DemoInvoiceEditFields, referenceId: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const w = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const bottomY = pageH - M
  let y = M

  const subtotal = lineItemsSubtotal(fields.lineItems)

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('INVOICE (DEMO)', w / 2, y, { align: 'center' })
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Date: ${new Date().toLocaleDateString()}`, w - M, y, { align: 'right' })
  y += 6
  doc.text(`Reference: ${referenceId}`, w - M, y, { align: 'right' })
  y += 10

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Ship to / job site', M, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  for (const line of [fields.shipStreet.trim() || '—', fields.shipCityStateZip.trim() || '—']) {
    const wrapped = doc.splitTextToSize(line, w - 2 * M)
    doc.text(wrapped, M, y)
    y += Math.max(5, wrapped.length * 4)
  }
  y += 4

  const drawLineTableHeader = (continued: boolean) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    if (continued) {
      doc.text('Line items (continued)', M, y)
    } else {
      doc.text('Line items (purchase order)', M, y)
    }
    y += 6
    doc.text('Qty', M, y)
    doc.text('Description', M + 16, y)
    doc.text('Unit', w - M - 40, y)
    doc.text('Line total', w - M, y, { align: 'right' })
    y += 4
    doc.setLineWidth(0.3)
    doc.setDrawColor(0)
    doc.line(M, y, w - M, y)
    y += 5
    doc.setFont('helvetica', 'normal')
  }

  drawLineTableHeader(false)

  for (const li of fields.lineItems) {
    const qty = clampQty(li.qty)
    const unit = clampMoney(li.unitPrice)
    const ext = Math.round(qty * unit * 100) / 100
    const desc = (li.description || 'Item').trim() || '—'
    const dLines = doc.splitTextToSize(desc, w - M - 16 - 48)
    const blockH = Math.max(10, dLines.length * 5) + 4
    if (y + blockH > bottomY - 24) {
      doc.addPage()
      y = M
      drawLineTableHeader(true)
    }

    doc.text(String(qty), M, y)
    doc.text(dLines, M + 16, y)
    doc.text(`$${unit.toFixed(2)}`, w - M - 40, y)
    doc.text(`$${ext.toFixed(2)}`, w - M, y, { align: 'right' })
    y += Math.max(10, dLines.length * 5)
    doc.setLineWidth(0.1)
    doc.setDrawColor(220)
    doc.line(M, y, w - M, y)
    doc.setDrawColor(0)
    y += 3
  }

  y += 3
  if (y > bottomY - 32) {
    doc.addPage()
    y = M
  }
  doc.setLineWidth(0.3)
  doc.setDrawColor(0)
  doc.line(M, y, w - M, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Subtotal', w - M - 40, y)
  doc.text(`$${subtotal.toFixed(2)}`, w - M, y, { align: 'right' })
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text('Tax (demo)', w - M - 40, y)
  doc.text('$0.00', w - M, y, { align: 'right' })
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Total due', w - M - 40, y)
  doc.text(`$${subtotal.toFixed(2)}`, w - M, y, { align: 'right' })
  y += 12
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const foot = doc.splitTextToSize(
    'Endeavor demo — not a real invoice. Edits in Oz refresh this PDF for review.',
    w - 2 * M,
  )
  doc.text(foot, M, y)

  return doc
}

export function getInvoicePdfBase64FromFields(
  fields: DemoInvoiceEditFields,
  referenceId: string,
): string {
  const dataUri = createInvoiceDocFromFields(fields, referenceId).output('datauristring') as string
  const i = dataUri.indexOf(',')
  return i >= 0 ? dataUri.slice(i + 1) : dataUri
}

export function buildInvoicePdfBlobFromFields(fields: DemoInvoiceEditFields, referenceId: string): Blob {
  return createInvoiceDocFromFields(fields, referenceId).output('blob') as Blob
}

export function buildDummyInvoicePdfBlob(): Blob {
  return buildInvoicePdfBlobFromFields(
    { ...DEFAULT_DEMO_INVOICE_FIELDS, lineItems: DEFAULT_DEMO_INVOICE_FIELDS.lineItems.map((x) => ({ ...x })) },
    DUMMY_INVOICE_REVIEW_ID,
  )
}

export function getDummyInvoicePdfBase64(): string {
  return getInvoicePdfBase64FromFields(
    { ...DEFAULT_DEMO_INVOICE_FIELDS, lineItems: DEFAULT_DEMO_INVOICE_FIELDS.lineItems.map((x) => ({ ...x })) },
    DUMMY_INVOICE_REVIEW_ID,
  )
}

export function buildCustomerSummaryFromDemoFields(f: DemoInvoiceEditFields): string {
  const n = f.lineItems.length
  const t = lineItemsSubtotal(f.lineItems)
  return `${f.shipStreet.trim() || '—'} — ${n} line${n === 1 ? '' : 's'}, $${t.toFixed(2)}`
}
