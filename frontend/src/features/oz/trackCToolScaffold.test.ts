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

    await fs.writeFile(catalogPath, JSON.stringify([{ sku: 'SKU-001' }]), 'utf8')
    await fs.writeFile(recommendationsPath, JSON.stringify([{ sku: 'SKU-001', kind: 'upsell' }]), 'utf8')

    const scaffold = new TrackCToolScaffold({
      readEnv: () => ({
        OZ_PRODUCT_CATALOG_PATH: catalogPath,
        OZ_RECOMMENDATIONS_PATH: recommendationsPath,
      }),
    })

    await scaffold.initialize()
    const first = scaffold.getSnapshot()
    expect(first.catalog.records).toBe(1)
    expect(first.recommendations.records).toBe(1)

    await new Promise((resolve) => setTimeout(resolve, 12))
    await fs.writeFile(catalogPath, JSON.stringify([{ sku: 'SKU-001' }, { sku: 'SKU-002' }]), 'utf8')

    await scaffold.refreshBetweenTurns()
    const second = scaffold.getSnapshot()
    expect(second.catalog.records).toBe(2)
    expect(second.catalog.mtime_ms).toBeGreaterThanOrEqual(first.catalog.mtime_ms)
  })
})
