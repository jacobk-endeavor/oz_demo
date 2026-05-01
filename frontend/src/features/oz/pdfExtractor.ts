import type { ExtractUnitInput } from './extractArtifact'

export const PDF_MIN_AVG_CHARS_PER_PAGE = 50

export type PdfExtractorName = 'pypdf' | 'pdfminer'

export type PdfPageTextExtractor = (pdfBytes: Uint8Array) => Promise<string[]>

export type PdfExtractSuccess = {
  status: 'ok'
  extractor: PdfExtractorName
  pageCount: number
  avgCharsPerPage: number
  units: ExtractUnitInput[]
}

export type PdfExtractNeedsOcr = {
  status: 'needs_ocr'
  reason: 'needs_ocr'
  pageCount: number
  attemptedExtractors: PdfExtractorName[]
}

export type PdfExtractResult = PdfExtractSuccess | PdfExtractNeedsOcr

type ExtractorAttemptResult = {
  ok: boolean
  pages: string[]
  avgCharsPerPage: number
}

function pageFileName(pageNumber: number): string {
  return `unit-page-${String(pageNumber).padStart(3, '0')}.txt`
}

function normalizePages(pages: string[]): string[] {
  return pages.map((page) => page.replace(/\r\n/g, '\n').trim())
}

function averageCharsPerPage(pages: string[]): number {
  if (pages.length === 0) return 0
  const chars = pages.reduce((sum, page) => sum + page.length, 0)
  return chars / pages.length
}

function toPageUnits(pages: string[]): ExtractUnitInput[] {
  return pages.map((body, idx) => {
    const pageNumber = idx + 1
    return {
      locator: `page=${pageNumber}`,
      body,
      chunkIds: [],
      fileName: pageFileName(pageNumber),
    }
  })
}

async function runExtractor(
  extractor: PdfPageTextExtractor,
  pdfBytes: Uint8Array,
  minAvgCharsPerPage: number,
): Promise<ExtractorAttemptResult> {
  try {
    const normalizedPages = normalizePages(await extractor(pdfBytes))
    const avgChars = averageCharsPerPage(normalizedPages)
    return {
      ok: normalizedPages.length > 0 && avgChars >= minAvgCharsPerPage,
      pages: normalizedPages,
      avgCharsPerPage: avgChars,
    }
  } catch {
    return {
      ok: false,
      pages: [],
      avgCharsPerPage: 0,
    }
  }
}

export async function extractPdfUnits(input: {
  pdfBytes: Uint8Array
  primaryExtractor: PdfPageTextExtractor
  fallbackExtractor: PdfPageTextExtractor
  minAvgCharsPerPage?: number
}): Promise<PdfExtractResult> {
  const minAvgCharsPerPage = input.minAvgCharsPerPage ?? PDF_MIN_AVG_CHARS_PER_PAGE
  const primary = await runExtractor(input.primaryExtractor, input.pdfBytes, minAvgCharsPerPage)
  if (primary.ok) {
    return {
      status: 'ok',
      extractor: 'pypdf',
      pageCount: primary.pages.length,
      avgCharsPerPage: primary.avgCharsPerPage,
      units: toPageUnits(primary.pages),
    }
  }

  const fallback = await runExtractor(input.fallbackExtractor, input.pdfBytes, minAvgCharsPerPage)
  if (fallback.ok) {
    return {
      status: 'ok',
      extractor: 'pdfminer',
      pageCount: fallback.pages.length,
      avgCharsPerPage: fallback.avgCharsPerPage,
      units: toPageUnits(fallback.pages),
    }
  }

  const pageCount = Math.max(primary.pages.length, fallback.pages.length)
  return {
    status: 'needs_ocr',
    reason: 'needs_ocr',
    pageCount,
    attemptedExtractors: ['pypdf', 'pdfminer'],
  }
}
