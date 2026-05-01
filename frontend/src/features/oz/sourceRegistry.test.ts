import { describe, expect, it } from 'vitest'
import { SourceRegistry, sourceIdFromSha256 } from './sourceRegistry'

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

describe('sourceIdFromSha256', () => {
  it('uses first 12 hex chars for stable source_id', () => {
    expect(sourceIdFromSha256(SHA_A)).toBe('aaaaaaaaaaaa')
  })
})

describe('SourceRegistry', () => {
  it('creates a new source and preserves first_seen_path across re-register', () => {
    const registry = new SourceRegistry()
    const first = registry.register({
      path: 'raw/alpha.pdf',
      sha256: SHA_A,
      mime: 'application/pdf',
      meta: { doc_kind: 'tech-bulletin' },
    })
    expect(first.created).toBe(true)
    expect(first.record.firstSeenPath).toBe('raw/alpha.pdf')

    const second = registry.register({
      path: 'raw/archive/alpha-renamed.pdf',
      sha256: SHA_A,
      mime: 'application/pdf',
      meta: { brand: 'Deckorators' },
    })
    expect(second.created).toBe(false)
    expect(second.record.path).toBe('raw/archive/alpha-renamed.pdf')
    expect(second.record.firstSeenPath).toBe('raw/alpha.pdf')
    expect(second.record.meta).toEqual({
      doc_kind: 'tech-bulletin',
      brand: 'Deckorators',
      near_duplicates: [],
    })
  })

  it('returns alreadyReady=true when same sha was already ready', () => {
    const registry = new SourceRegistry()
    const created = registry.register({
      path: 'raw/ready.pdf',
      sha256: SHA_B,
      mime: 'application/pdf',
      status: 'pending',
    })
    registry.setStatus(created.record.sourceId, 'extracting')
    registry.setStatus(created.record.sourceId, 'embedding')
    registry.setStatus(created.record.sourceId, 'ready')

    const again = registry.register({
      path: 'raw/ready-copy.pdf',
      sha256: SHA_B,
      mime: 'application/pdf',
    })
    expect(again.created).toBe(false)
    expect(again.alreadyReady).toBe(true)
  })

  it('enforces status state machine', () => {
    const registry = new SourceRegistry()
    const created = registry.register({
      path: 'raw/doc.txt',
      sha256: SHA_A,
      mime: 'text/plain',
    })
    expect(() => registry.setStatus(created.record.sourceId, 'ready')).toThrow(
      'invalid status transition: pending -> ready',
    )

    registry.setStatus(created.record.sourceId, 'extracting')
    registry.setStatus(created.record.sourceId, 'failed')
    registry.setStatus(created.record.sourceId, 'pending')
    const row = registry.setStatus(created.record.sourceId, 'extracting')
    expect(row.status).toBe('extracting')
  })

  it('flags near-duplicates when normalized filenames match', () => {
    const registry = new SourceRegistry()
    registry.register({
      path: 'raw/2023 Azek-Deckorators Color Comparison U.S. 11.21.2022.pdf',
      sha256: SHA_A,
      mime: 'application/pdf',
    })
    const second = registry.register({
      path: 'raw/2023+Azek-Deckorators+Color+Comparison+U.S..pdf',
      sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      mime: 'application/pdf',
    })
    expect(second.record.meta.near_duplicates).toEqual(['aaaaaaaaaaaa'])
  })

  it('flags near-duplicates for same brand/line/year/doc_kind tuple', () => {
    const registry = new SourceRegistry()
    registry.register({
      path: 'raw/guide-alpha.pdf',
      sha256: SHA_A,
      mime: 'application/pdf',
      meta: {
        brand: 'Deckorators',
        product_line: 'Voyage',
        year: 2026,
        doc_kind: 'tech-bulletin',
      },
    })
    const second = registry.register({
      path: 'raw/guide-beta.pdf',
      sha256: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      mime: 'application/pdf',
      meta: {
        brand: 'deckorators',
        line: 'voyage',
        year: '2026',
        doc_kind: 'tech-bulletin',
      },
    })
    expect(second.record.meta.near_duplicates).toEqual(['aaaaaaaaaaaa'])
  })

  it('flags near-duplicates by first-page minhash similarity and ignores dissimilar pages', () => {
    const registry = new SourceRegistry()
    registry.register({
      path: 'raw/doc-1.pdf',
      sha256: SHA_A,
      mime: 'application/pdf',
      meta: {
        first_page_text:
          'Decking install guidance for Voyage line. Step one clean the joists and place starter clips with spacing.',
      },
    })
    const near = registry.register({
      path: 'raw/doc-2.pdf',
      sha256: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      mime: 'application/pdf',
      meta: {
        firstPageText:
          'Decking install guidance for Voyage line. Step one clean the joists and place starter clips with spacing.',
      },
    })
    expect(near.record.meta.near_duplicates).toEqual(['aaaaaaaaaaaa'])

    const far = registry.register({
      path: 'raw/doc-3.pdf',
      sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      mime: 'application/pdf',
      meta: {
        first_page_text:
          'Quarterly sales analytics for rail fasteners and hidden clips with invoice trend pivots and margin deltas.',
      },
    })
    expect(far.record.meta.near_duplicates).toEqual([])
  })
})
