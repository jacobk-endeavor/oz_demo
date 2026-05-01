import { describe, expect, it } from 'vitest'
import type { ExtractManifest } from './extractArtifact'
import { buildStructuredRefreshEvent, diffStructuredManifestUnits } from './structuredRefresh'

function manifest(units: ExtractManifest['units']): ExtractManifest {
  return {
    manifest_version: 1,
    source_id: 'abcdef123456',
    title: 'product_catalog.json',
    doc_kind: 'structured-data',
    has_full_text: false,
    units,
  }
}

describe('structuredRefresh', () => {
  it('diffs structured units by locator + content_hash', () => {
    const previous = manifest([
      { locator: '[catalog:sku=A]', file: 'a.txt', chunk_ids: ['cat_a'], content_hash: 'h1' },
      { locator: '[catalog:sku=B]', file: 'b.txt', chunk_ids: ['cat_b'], content_hash: 'h2' },
    ])
    const next = manifest([
      { locator: '[catalog:sku=A]', file: 'a.txt', chunk_ids: ['cat_a'], content_hash: 'h1' },
      { locator: '[catalog:sku=B]', file: 'b.txt', chunk_ids: ['cat_b'], content_hash: 'h3' },
      { locator: '[catalog:sku=C]', file: 'c.txt', chunk_ids: ['cat_c'], content_hash: 'h4' },
    ])

    const diff = diffStructuredManifestUnits(previous, next)
    expect(diff.added.map((unit) => unit.locator)).toEqual(['[catalog:sku=C]'])
    expect(diff.modified).toHaveLength(1)
    expect(diff.modified[0]?.before.locator).toBe('[catalog:sku=B]')
    expect(diff.removed).toEqual([])
  })

  it('builds kb.refreshed event summary from diff counts', () => {
    const previous = manifest([
      { locator: '[recs:cross_sell:A#0]', file: 'a.txt', chunk_ids: ['recs_a'], content_hash: 'ha' },
      { locator: '[recs:cross_sell:B#0]', file: 'b.txt', chunk_ids: ['recs_b'], content_hash: 'hb' },
    ])
    const next = manifest([
      { locator: '[recs:cross_sell:A#0]', file: 'a.txt', chunk_ids: ['recs_a'], content_hash: 'hc' },
      { locator: '[recs:cross_sell:C#0]', file: 'c.txt', chunk_ids: ['recs_c'], content_hash: 'hd' },
    ])
    const { diff, event } = buildStructuredRefreshEvent({ previous, next, replay: true })
    expect(diff.added).toHaveLength(1)
    expect(diff.modified).toHaveLength(1)
    expect(diff.removed).toHaveLength(1)
    expect(event).toEqual({
      event: 'kb.refreshed',
      event_version: 1,
      source_id: 'abcdef123456',
      replay: true,
      summary: { added: 1, modified: 1, removed: 1 },
    })
  })
})
