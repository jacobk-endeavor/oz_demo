import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TrackCToolScaffold } from '../../../../backend/oz/trackCToolScaffold'

describe('track C tool scaffold', () => {
  it('blocks non-SELECT SQL in read-only db wrapper', async () => {
    let called = false
    const scaffold = new TrackCToolScaffold({
      readEnv: () => ({ DATABASE_READONLY_URL: 'postgres://demo' }),
      poolFactory: () =>
        ({
          async query() {
            called = true
            return { rows: [] }
          },
        }) as never,
    })

    const dbQuery = scaffold.readOnlyDbQuery()
    expect(dbQuery).toBeTruthy()
    await expect(dbQuery?.('DELETE FROM call_rag_chunks', [])).rejects.toThrow(/SELECT/i)
    expect(called).toBe(false)
  })

  it('loads JSON at startup and refreshes on mtime change', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'track-c-scaffold-'))
    const catalogPath = path.join(tmpDir, 'product_catalog.json')
    const recommendationsPath = path.join(tmpDir, 'recommendations.json')
    const wikiDir = path.join(tmpDir, 'wiki')
    const wikiPage = path.join(wikiDir, 'entities', 'products', 'voyage.md')
    const wikiLog = path.join(wikiDir, 'log.md')

    await fs.writeFile(catalogPath, JSON.stringify([{ sku: 'SKU-001', sales: 30 }]), 'utf8')
    await fs.writeFile(recommendationsPath, JSON.stringify([{ sku: 'SKU-001', kind: 'upsell' }]), 'utf8')
    await fs.mkdir(path.dirname(wikiPage), { recursive: true })
    await fs.writeFile(wikiPage, '# Voyage\n\nLead times vary by branch.', 'utf8')
    await fs.writeFile(
      wikiLog,
      '# Wiki Log\n\n## [2026-05-01 10:00] query | source=manual\n- Asked about lead times.\n',
      'utf8',
    )

    const scaffold = new TrackCToolScaffold({
      readEnv: () => ({
        OZ_PRODUCT_CATALOG_PATH: catalogPath,
        OZ_RECOMMENDATIONS_PATH: recommendationsPath,
        OZ_WIKI_ROOT_PATH: wikiDir,
      }),
    })

    await scaffold.initialize()
    const first = scaffold.getSnapshot()
    expect(first.catalog.records).toBe(1)
    expect(first.recommendations.records).toBe(1)

    await new Promise((resolve) => setTimeout(resolve, 12))
    await fs.writeFile(catalogPath, JSON.stringify([{ sku: 'SKU-001', sales: 30 }, { sku: 'SKU-002', sales: 5 }]), 'utf8')

    await scaffold.refreshBetweenTurns()
    const second = scaffold.getSnapshot()
    expect(second.catalog.records).toBe(2)
    expect(second.catalog.mtime_ms).toBeGreaterThanOrEqual(first.catalog.mtime_ms)

    const getHit = scaffold.catalog_get('sku-002')
    expect(getHit.found).toBe(true)
    expect(getHit.citation).toBe('[catalog:sku=SKU-002]')

    const list = scaffold.catalog_list({ min_sales: 10, sort_by: 'sales', top_n: 5 })
    expect(list.total).toBe(1)
    expect(list.rows[0]?.citation).toBe('[catalog:sku=SKU-001]')

    const wikiRead = await scaffold.wiki_read('entities/products/voyage')
    expect(wikiRead.found).toBe(true)
    expect(wikiRead.citation).toBe('[wiki:entities/products/voyage.md]')

    const wikiGrep = await scaffold.wiki_grep('vary by branch', 3)
    expect(wikiGrep.total).toBe(1)

    const wikiLogResult = await scaffold.wiki_log({ kind: 'query' })
    expect(wikiLogResult.total).toBe(1)
  })
})
