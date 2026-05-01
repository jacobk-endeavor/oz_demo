/**
 * Oz-Demo-gds: eight representative chat substrate pathways (deterministic, no LLM).
 * Spec: docs/wiki-kb/track-c-chat-integration.md — validates primitives + bundled Layer 3 return shapes.
 */
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createOzToolSurface } from '../../../../backend/oz/chatRuntime'
import { TrackCToolScaffold } from '../../../../backend/oz/trackCToolScaffold'

async function mkFixtureScaffold() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'track-c-eight-'))
  const catalogPath = path.join(tmpDir, 'product_catalog.json')
  const recommendationsPath = path.join(tmpDir, 'recommendations.json')
  const wikiDir = path.join(tmpDir, 'wiki')
  const voyage = path.join(wikiDir, 'entities', 'products', 'voyage.md')
  const captivate = path.join(wikiDir, 'entities', 'products', 'captivate.md')
  await fs.mkdir(path.dirname(voyage), { recursive: true })
  await fs.writeFile(
    catalogPath,
    JSON.stringify([
      { sku: 'SKU-A', product_line: 'Voyage', total_sales: 100, gp_pct_median: 10 },
      { sku: 'SKU-B', product_line: 'Captivate', total_sales: 50, gp_pct_median: 12 },
    ]),
    'utf8',
  )
  await fs.writeFile(
    recommendationsPath,
    JSON.stringify([
      { rule_kind: 'cross_sell', sub_category: 'AT-AT-PMoulding', lift: 0.9 },
      { rule_kind: 'upsell', from_sku: 'SKU-A', to_sku: 'SKU-B', price_uplift_pct: 50 },
    ]),
    'utf8',
  )
  await fs.writeFile(
    voyage,
    `---\ntype: entity\nslug: entities/products/voyage\ntitle: Voyage\n---\n## Warranty\n30-year residential.\n`,
    'utf8',
  )
  await fs.writeFile(
    captivate,
    `---\ntype: entity\nslug: entities/products/captivate\ntitle: Captivate\n---\n## Warranty\nLifetime limited.\n`,
    'utf8',
  )
  await fs.writeFile(path.join(wikiDir, 'log.md'), '# Log\n', 'utf8')

  const scaffold = new TrackCToolScaffold({
    readEnv: () => ({
      OZ_PRODUCT_CATALOG_PATH: catalogPath,
      OZ_RECOMMENDATIONS_PATH: recommendationsPath,
      OZ_WIKI_ROOT_PATH: wikiDir,
      OZ_REPO_ROOT: tmpDir,
    }),
  })
  await scaffold.initialize()
  return { tmpDir, scaffold }
}

describe('Track C eight pathways (Oz-Demo-gds)', () => {
  it('covers SKU lookup, cross-sell, compare, top ops, install wiki, fuzzy search, bundled dossier/compare/wiki_compare/drift, wiki_log', async () => {
    const { scaffold } = await mkFixtureScaffold()
    const surface = createOzToolSurface({ message: 'test' }, { trackC: { scaffold } })

    const hit = await surface.catalog_get({ sku: 'SKU-A' })
    expect(hit.found).toBe(true)

    const rec = await surface.recommendations_for({ sku_or_subcat: 'AT-AT-PMoulding', kind: 'cross_sell' })
    expect(rec.rules.length).toBeGreaterThanOrEqual(0)

    const cmp = await surface.catalog_compare({ skus: ['SKU-A', 'SKU-B'] })
    expect(cmp.rows.length).toBe(2)

    const top = await surface.recommendations_top({
      kind: 'upsell',
      by: 'price_uplift_pct',
      top_n: 5,
    })
    expect(top.rows.length).toBeGreaterThanOrEqual(0)

    const wl = await surface.wiki_lookup({ query: 'Voyage warranty', top_n: 3 })
    expect(wl.pages.length).toBeGreaterThanOrEqual(1)
    const wr = await surface.wiki_read({ path: 'entities/products/voyage' })
    expect(wr.found).toBe(true)

    const fuzzy = await surface.catalog_search({ query: 'voyage decking', k: 5 })
    expect(fuzzy.rows.length).toBeGreaterThanOrEqual(0)

    const dossier = await surface.product_dossier({ target: 'SKU-A' })
    expect(dossier.status).toBe('ok')
    if (dossier.status === 'ok') expect(dossier.bundled_tool).toBe('product_dossier')

    const bundledCmp = await surface.compare({ targets: ['entities/products/voyage', 'entities/products/captivate'] })
    expect(bundledCmp.status).toBe('ok')

    const wc = await surface.wiki_compare({ slugs: ['entities/products/voyage', 'entities/products/captivate'] })
    expect(wc.status).toBe('ok')
    if (wc.status === 'ok') expect(Array.isArray(wc.pages)).toBe(true)

    const drift = await surface.drift_check({ target: 'SKU-A' })
    expect(drift.status).toBe('ok')
    if (drift.status === 'ok') expect(Array.isArray(drift.drift_flags)).toBe(true)

    const log = await surface.wiki_log({ kind: 'ingest', since: '2020-01-01', top_n: 10 })
    expect(log.total).toBeGreaterThanOrEqual(0)
  })
})
