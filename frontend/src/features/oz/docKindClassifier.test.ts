import { describe, expect, it } from 'vitest'
import { classifyDocKind } from './docKindClassifier'

describe('classifyDocKind', () => {
  it('classifies install guides from filename deterministically', () => {
    const result = classifyDocKind({
      path: 'raw/Millboard Decking Install Guide_US.pdf',
      mime: 'application/pdf',
    })
    expect(result.doc_kind).toBe('install')
    expect(result.confidence).toBe(1)
    expect(result.matched_by).toBe('filename')
  })

  it('classifies known structured json sources by filename', () => {
    const result = classifyDocKind({
      path: 'raw/product_catalog.json',
      mime: 'application/json',
    })
    expect(result.doc_kind).toBe('structured-data')
  })

  it('uses first-page text fallback at 0.8 confidence', () => {
    const result = classifyDocKind({
      path: 'raw/ambiguous-name.pdf',
      mime: 'application/pdf',
      firstPageText: 'TECHNICAL BULLETIN\nDecking gap guidance',
    })
    expect(result.doc_kind).toBe('tech-bulletin')
    expect(result.confidence).toBe(0.8)
    expect(result.matched_by).toBe('content')
  })

  it('returns unknown when no rule matches', () => {
    const result = classifyDocKind({
      path: 'raw/random-file.pdf',
      mime: 'application/pdf',
      firstPageText: 'General notes with no known markers.',
    })
    expect(result.doc_kind).toBe('unknown')
    expect(result.confidence).toBe(0)
  })

  it('extracts opportunistic metadata from filename and text', () => {
    const result = classifyDocKind({
      path: 'raw/Captivate with Russin logo 2026 deck.pdf',
      mime: 'application/pdf',
      firstPageText: 'Deckorators Captivate product sheet',
    })
    expect(result.brand).toBe('Deckorators')
    expect(result.product_line).toBe('Captivate')
    expect(result.year).toBe(2026)
    expect(result.distributor_branded).toBe(true)
  })
})
