import { describe, expect, it, vi } from 'vitest'
import { extractPdfUnits, PDF_MIN_AVG_CHARS_PER_PAGE } from './pdfExtractor'

describe('extractPdfUnits', () => {
  it('uses primary extractor when text is above threshold', async () => {
    const fallback = vi.fn(async () => ['unused fallback page text'])
    const result = await extractPdfUnits({
      pdfBytes: new Uint8Array([1, 2, 3]),
      primaryExtractor: async () => ['A'.repeat(PDF_MIN_AVG_CHARS_PER_PAGE + 10)],
      fallbackExtractor: fallback,
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.extractor).toBe('pypdf')
    expect(result.pageCount).toBe(1)
    expect(result.units).toEqual([
      {
        locator: 'page=1',
        body: 'A'.repeat(PDF_MIN_AVG_CHARS_PER_PAGE + 10),
        chunkIds: [],
        fileName: 'unit-page-001.txt',
      },
    ])
    expect(fallback).not.toHaveBeenCalled()
  })

  it('falls back when primary avg chars/page is below threshold', async () => {
    const result = await extractPdfUnits({
      pdfBytes: new Uint8Array([4, 5, 6]),
      primaryExtractor: async () => ['short text'],
      fallbackExtractor: async () => ['B'.repeat(PDF_MIN_AVG_CHARS_PER_PAGE + 5), 'C'.repeat(80)],
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.extractor).toBe('pdfminer')
    expect(result.units.map((u) => u.locator)).toEqual(['page=1', 'page=2'])
    expect(result.units.map((u) => u.fileName)).toEqual(['unit-page-001.txt', 'unit-page-002.txt'])
  })

  it('returns needs_ocr when both extractors fail threshold', async () => {
    const result = await extractPdfUnits({
      pdfBytes: new Uint8Array([7, 8, 9]),
      primaryExtractor: async () => [''],
      fallbackExtractor: async () => ['  too short  '],
    })

    expect(result).toEqual({
      status: 'needs_ocr',
      reason: 'needs_ocr',
      pageCount: 1,
      attemptedExtractors: ['pypdf', 'pdfminer'],
    })
  })

  it('falls back when primary extractor throws', async () => {
    const result = await extractPdfUnits({
      pdfBytes: new Uint8Array([1]),
      primaryExtractor: async () => {
        throw new Error('parser error')
      },
      fallbackExtractor: async () => ['D'.repeat(PDF_MIN_AVG_CHARS_PER_PAGE + 1)],
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.extractor).toBe('pdfminer')
  })
})
