import { describe, expect, it } from 'vitest'
import { extractCitations, resolveCitations, type CitationLookupTables } from './wikiCitationResolver'

const tables: CitationLookupTables = {
  docChunks: {
    abc123_p007_00002: { id: 'abc123_p007_00002', status: 'ready' },
    removed_doc: { id: 'removed_doc', status: 'removed' },
  },
  callChunks: {
    c0042_00003: { id: 'c0042_00003', status: 'ready' },
  },
  images: {
    'abc123/img/page-004-fig-01.png': { path: 'abc123/img/page-004-fig-01.png', status: 'ready' },
  },
  catalog: {
    sku: {
      PGFGD: { sku: 'PGFGD', status: 'ready' },
      OLD1: { sku: 'OLD1', status: 'deprecated' },
    },
    line: {
      'DK-MBC-VOYAGE': { code: 'DK-MBC-VOYAGE', status: 'ready' },
    },
    sub: {
      CAPPED_COMPOSITE: { code: 'CAPPED_COMPOSITE', status: 'ready' },
    },
  },
  recommendations: {
    byRule: {
      'cross_sell:CD-RC-RCDeck': [{ id: 'rec-0' }, { id: 'rec-1' }],
    },
    byMethod: {
      cross_sell: { method: 'cross_sell' },
    },
  },
  wikiPages: {
    'concepts/decking-width-tradeoff': { slug: 'concepts/decking-width-tradeoff', status: 'ready' },
    'archive/old-page': { slug: 'archive/old-page', status: 'archived' },
  },
}

describe('extractCitations', () => {
  it('parses all six citation forms', () => {
    const text = [
      '[doc:abc123_p007_00002]',
      '[call:c0042_00003]',
      '[image:abc123/img/page-004-fig-01.png]',
      '[catalog:sku=PGFGD]',
      '[recs:cross_sell:CD-RC-RCDeck#0]',
      '[[wiki:concepts/decking-width-tradeoff]]',
    ].join(' ')
    const parsed = extractCitations(text)
    expect(parsed).toHaveLength(6)
    expect(parsed.map((item) => item.kind)).toEqual(['doc', 'call', 'image', 'catalog', 'recs', 'wiki'])
  })

  it('parses recommendations method citation', () => {
    const parsed = extractCitations('[recs:method=cross_sell]')
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ kind: 'recs', method: 'cross_sell' })
  })
})

describe('resolveCitations', () => {
  it('resolves valid citations to records', () => {
    const text = [
      '[doc:abc123_p007_00002]',
      '[call:c0042_00003]',
      '[image:abc123/img/page-004-fig-01.png]',
      '[catalog:line=DK-MBC-VOYAGE]',
      '[catalog:sub=CAPPED_COMPOSITE]',
      '[recs:cross_sell:CD-RC-RCDeck#1]',
      '[recs:method=cross_sell]',
      '[[wiki:concepts/decking-width-tradeoff]]',
    ].join(' ')
    const resolved = resolveCitations(text, tables)
    expect(resolved.every((item) => item.ok)).toBe(true)
  })

  it('returns reason for removed chunks', () => {
    const [result] = resolveCitations('[doc:removed_doc]', tables)
    expect(result).toMatchObject({ ok: false, reason: 'removed_chunk' })
  })

  it('returns reason for deprecated sku and archived page', () => {
    const [catalog, wiki] = resolveCitations('[catalog:sku=OLD1] [[wiki:archive/old-page]]', tables)
    expect(catalog).toMatchObject({ ok: false, reason: 'deprecated_sku' })
    expect(wiki).toMatchObject({ ok: false, reason: 'archived_page' })
  })

  it('returns invalid index for recommendations tuple that exists', () => {
    const [result] = resolveCitations('[recs:cross_sell:CD-RC-RCDeck#9]', tables)
    expect(result).toMatchObject({ ok: false, reason: 'invalid_recs_index' })
  })

  it('returns missing record when citation key is unknown', () => {
    const [result] = resolveCitations('[catalog:sku=NOPE]', tables)
    expect(result).toMatchObject({ ok: false, reason: 'missing_record' })
  })
})
