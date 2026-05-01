import { describe, expect, it } from 'vitest'
import {
  crossReferenceCatalogSkus,
  extractSkuLikeTokens,
  loadProductCatalogSkuSet,
  normalizeIngestManifest,
  slugifyWikiSegment,
} from './wikiIngestPlaybooks'

describe('wikiIngestPlaybooks helpers', () => {
  it('normalizes legacy manifests without manifest_version', () => {
    const m = normalizeIngestManifest({
      source_id: 's1',
      title: 'Doc',
      doc_kind: 'marketing',
      units: [{ locator: 'p1', chunk_ids: ['c1'] }],
    })
    expect(m.manifest_version).toBe(1)
    expect(m.has_full_text).toBe(false)
    expect(m.units[0]?.file).toBe('legacy.txt')
    expect(m.units[0]?.chunk_ids).toEqual(['c1'])
  })

  it('tokenizes SKU-like strings', () => {
    const tokens = extractSkuLikeTokens('Order DK35031021 and PGFGD today.')
    expect(tokens).toContain('DK35031021')
    expect(tokens).toContain('PGFGD')
  })

  it('cross-references catalog SKUs against PDF text', () => {
    const catalog = { items: [{ sku: 'PGFGD', product_line: 'Voyage', description: 'x', product_line_code: 'V', sub_category: 's' }] }
    const skuSet = loadProductCatalogSkuSet(catalog)
    const cross = crossReferenceCatalogSkus({
      fullText: 'See PGFGD and UNKNOWN99',
      catalogSkus: skuSet,
      productLineFilter: 'Voyage',
      catalogItems: catalog.items as Record<string, unknown>[],
    })
    expect(cross.matchedInCatalog).toEqual(['PGFGD'])
    expect(cross.pdfNotInCatalog).toContain('UNKNOWN99')
    expect(cross.catalogNotInPdf).toEqual([])
  })

  it('slugifies wiki path segments', () => {
    expect(slugifyWikiSegment('Black Label')).toBe('black-label')
  })
})
