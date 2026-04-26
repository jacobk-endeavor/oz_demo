import { jsPDF } from 'jspdf'
import { registerQuoteReadyFromProspectOrder } from '../quotesReady/quotesReadyForReviewStore'
import { PROSPECT_QS } from './prospectNotesData'

export type ProspectOrderPdfInput = {
  repLabel?: string
  answers: Record<number, string>
  /** YYYY-MM-DD for header */
  dateLabel?: string
}

const PAGE_MARGIN = 14
const LINE_H = 6

/**
 * Fills a simple letter PDF with the prospect background template (line items, ship-to, Q&A).
 * Extra space left for hand-written or future form fields.
 */
export function buildProspectOrderPdfBlob(data: ProspectOrderPdfInput): { blob: Blob; fileName: string } {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  let y = PAGE_MARGIN
  const rep = data.repLabel?.trim() || 'Rep (sign)'
  const when = data.dateLabel ?? new Date().toLocaleDateString()

  doc.setFontSize(16)
  doc.text('Prospect / order background', pageW / 2, y, { align: 'center' })
  y += 10
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Rep: ${rep}   ·   Date: ${when}`, PAGE_MARGIN, y)
  y += 10

  const blocks: { title: string; value: string }[] = [
    { title: PROSPECT_QS[0], value: (data.answers[0] ?? '').trim() },
    { title: PROSPECT_QS[1], value: (data.answers[1] ?? '').trim() },
    { title: PROSPECT_QS[2], value: (data.answers[2] ?? '').trim() },
    { title: PROSPECT_QS[3], value: (data.answers[3] ?? '').trim() },
    { title: PROSPECT_QS[4], value: (data.answers[4] ?? '').trim() },
  ]

  for (const b of blocks) {
    if (y > 255) {
      doc.addPage()
      y = PAGE_MARGIN
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    const titleLines = doc.splitTextToSize(b.title, pageW - 2 * PAGE_MARGIN)
    doc.text(titleLines, PAGE_MARGIN, y)
    y += titleLines.length * LINE_H * 0.55
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const val = b.value || '_______________________________'
    const vLines = doc.splitTextToSize(val, pageW - 2 * PAGE_MARGIN)
    doc.text(vLines, PAGE_MARGIN, y)
    y += vLines.length * LINE_H * 0.5 + 4
  }

  y += 4
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  const footer = doc.splitTextToSize(
    'Endeavor demo — edit missing fields in the Field App or here before sending to quote.',
    pageW - 2 * PAGE_MARGIN,
  )
  doc.text(footer, PAGE_MARGIN, y)

  const whenSlug = when.replace(/\//g, '-')
  const fileName = `prospect-order-background-${whenSlug}.pdf`
  const blob = doc.output('blob') as Blob
  return { blob, fileName }
}

/**
 * Triggers a browser download and appends the same bytes to **Quotes ready for review** (with a review code).
 */
export function downloadProspectOrderPdf(data: ProspectOrderPdfInput): void {
  const { blob, fileName } = buildProspectOrderPdfBlob(data)
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
  } finally {
    URL.revokeObjectURL(url)
  }
  void registerQuoteReadyFromProspectOrder({ blob, fileName, answers: data.answers })
}
