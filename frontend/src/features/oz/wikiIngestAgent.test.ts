import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runIngestAgentScaffold } from './wikiIngestAgent'

const tempRoots: string[] = []

async function createRepoFixture() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'wiki-ingest-agent-'))
  tempRoots.push(repoRoot)
  await mkdir(path.join(repoRoot, 'wiki', 'sources'), { recursive: true })
  await writeFile(path.join(repoRoot, 'wiki', 'log.md'), '# Wiki Log\n', 'utf8')
  await mkdir(path.join(repoRoot, 'kb_extracts', 'abc123def456'), { recursive: true })
  await writeFile(
    path.join(repoRoot, 'kb_extracts', 'abc123def456', 'manifest.json'),
    `${JSON.stringify(
      {
        source_id: 'abc123def456',
        title: 'Voyage Decking Technical Bulletin',
        doc_kind: 'tech-bulletin',
        brand: 'Deckorators',
        product_line: 'Voyage',
        year: 2026,
        distributor_branded: false,
        units: [{ locator: 'page=1', chunk_ids: ['abc123_p001_00000'] }],
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  return repoRoot
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })))
})

describe('runIngestAgentScaffold', () => {
  it('writes a source draft and appends a structured log entry', async () => {
    const repoRoot = await createRepoFixture()
    const result = await runIngestAgentScaffold({
      repoRoot,
      now: new Date('2026-05-01T21:22:00.000Z'),
      event: {
        event_version: 1,
        event: 'kb.ingested',
        source_id: 'abc123def456',
      },
    })
    const sourcePage = await readFile(result.sourcePagePath, 'utf8')
    expect(sourcePage).toContain('source_id: abc123def456')
    expect(sourcePage).toContain('doc_kind: tech-bulletin')
    expect(sourcePage).toContain('[doc:abc123_p001_00000]')

    const logText = await readFile(path.join(repoRoot, 'wiki', 'log.md'), 'utf8')
    expect(logText).toContain('event=kb.ingested')
    expect(logText).toContain('source_id=abc123def456')
  })

  it('adds text playbook section for tech-bulletin sources', async () => {
    const repoRoot = await createRepoFixture()
    const manifestPath = path.join(repoRoot, 'kb_extracts', 'abc123def456', 'manifest.json')
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          source_id: 'abc123def456',
          title: 'Width bulletin',
          doc_kind: 'tech-bulletin',
          brand: 'Deckorators',
          product_line: 'Voyage',
          year: 2026,
          units: [{ locator: 'page=1', chunk_ids: ['abc123_p001_00000'], file: 'p1.txt', content_hash: 'h' }],
          has_full_text: false,
          manifest_version: 1,
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
    const result = await runIngestAgentScaffold({
      repoRoot,
      now: new Date('2026-05-01T21:22:00.000Z'),
      event: {
        event_version: 1,
        event: 'kb.ingested',
        source_id: 'abc123def456',
      },
    })
    const sourcePage = await readFile(result.sourcePagePath, 'utf8')
    expect(sourcePage).toContain('## Playbook: tech-bulletin')
    expect(sourcePage).toContain('Linker targets')
    expect(result.bootstrappedWikiPaths).toEqual([])
  })

  it('runs catalog SKU cross-reference when full text and product_catalog.json exist', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'wiki-ingest-catalog-'))
    tempRoots.push(repoRoot)
    await mkdir(path.join(repoRoot, 'wiki', 'sources'), { recursive: true })
    await writeFile(path.join(repoRoot, 'wiki', 'log.md'), '# Wiki Log\n', 'utf8')
    await mkdir(path.join(repoRoot, 'kb_extracts', 'catsrc1'), { recursive: true })
    await writeFile(
      path.join(repoRoot, 'product_catalog.json'),
      `${JSON.stringify(
        {
          items: [
            {
              sku: 'ALPHA1',
              description: 'a',
              product_line_code: 'L',
              product_line: 'LineA',
              sub_category: 'sub',
            },
            {
              sku: 'BETA2',
              description: 'b',
              product_line_code: 'L',
              product_line: 'LineA',
              sub_category: 'sub',
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
    await writeFile(path.join(repoRoot, 'kb_extracts', 'catsrc1', 'full.txt'), 'SKU ALPHA1 only in PDF.', 'utf8')
    await writeFile(
      path.join(repoRoot, 'kb_extracts', 'catsrc1', 'manifest.json'),
      `${JSON.stringify(
        {
          manifest_version: 1,
          source_id: 'catsrc1',
          title: 'Line card',
          doc_kind: 'catalog',
          brand: 'Deckorators',
          product_line: 'LineA',
          year: 2026,
          has_full_text: true,
          units: [{ locator: 'page=1', chunk_ids: ['x'], file: 'p1.txt', content_hash: 'h' }],
        },
        null,
        2,
      )}\n`,
      'utf8',
    )

    const result = await runIngestAgentScaffold({
      repoRoot,
      now: new Date('2026-05-01T21:22:00.000Z'),
      event: {
        event_version: 1,
        event: 'kb.ingested',
        source_id: 'catsrc1',
      },
    })
    const sourcePage = await readFile(result.sourcePagePath, 'utf8')
    expect(sourcePage).toContain('## Playbook: catalog')
    expect(sourcePage).toContain('[catalog:sku=ALPHA1]')
    expect(sourcePage).toContain('BETA2')
  })

  it('bootstraps product line entities for structured-data catalog ingest', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'wiki-ingest-structured-'))
    tempRoots.push(repoRoot)
    await mkdir(path.join(repoRoot, 'wiki', 'sources'), { recursive: true })
    await writeFile(path.join(repoRoot, 'wiki', 'log.md'), '# Wiki Log\n', 'utf8')
    await mkdir(path.join(repoRoot, 'kb_extracts', 'struct1'), { recursive: true })
    await writeFile(
      path.join(repoRoot, 'product_catalog.json'),
      `${JSON.stringify(
        {
          items: [
            {
              sku: 'S1',
              description: 'd',
              product_line_code: 'PL1',
              product_line: 'Alpha Line',
              sub_category: 'SC-A',
              total_sales: 100,
            },
            {
              sku: 'S2',
              description: 'd2',
              product_line_code: 'PL1',
              product_line: 'Alpha Line',
              sub_category: 'SC-B',
              total_sales: 50,
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
    await writeFile(
      path.join(repoRoot, 'kb_extracts', 'struct1', 'manifest.json'),
      `${JSON.stringify(
        {
          manifest_version: 1,
          source_id: 'struct1',
          title: 'product_catalog.json',
          doc_kind: 'structured-data',
          has_full_text: false,
          units: [
            {
              locator: '[catalog:sku=S1]',
              chunk_ids: ['cat_sku_S1'],
              file: 'unit-catalog-sku-S1.txt',
              content_hash: 'h1',
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf8',
    )

    const result = await runIngestAgentScaffold({
      repoRoot,
      now: new Date('2026-05-01T21:22:00.000Z'),
      event: {
        event_version: 1,
        event: 'kb.ingested',
        source_id: 'struct1',
      },
    })

    expect(result.bootstrappedWikiPaths.length).toBeGreaterThan(0)
    const entityPath = path.join(repoRoot, 'wiki', 'entities', 'products', 'alpha-line.md')
    await access(entityPath)
    const entityText = await readFile(entityPath, 'utf8')
    expect(entityText).toContain('product_line_code')
    expect(entityText).toContain('sku_count: 2')

    const sourcePage = await readFile(result.sourcePagePath, 'utf8')
    expect(sourcePage).toContain('## Structured-data artifacts')
    expect(sourcePage).toContain('[catalog:sku=S1]')
  })

  it('records near-duplicate hints without auto-merge guidance', async () => {
    const repoRoot = await createRepoFixture()
    const result = await runIngestAgentScaffold({
      repoRoot,
      now: new Date('2026-05-01T21:22:00.000Z'),
      event: {
        event_version: 1,
        event: 'kb.ingested',
        source_id: 'abc123def456',
        near_duplicate_source_ids: ['dupaaa'],
        supersedes_slug: 'older-slug',
      },
    })
    const sourcePage = await readFile(result.sourcePagePath, 'utf8')
    expect(sourcePage).toContain('supersedes: "older-slug"')
    expect(sourcePage).toContain('near_duplicate source_id=`dupaaa`')
    expect(sourcePage).toContain('Curator review')
  })

  it('records classification mismatches when classify-confirm differs from manifest', async () => {
    const repoRoot = await createRepoFixture()
    const result = await runIngestAgentScaffold({
      repoRoot,
      now: new Date('2026-05-01T21:22:00.000Z'),
      event: {
        event_version: 1,
        event: 'kb.refreshed',
        source_id: 'abc123def456',
        classify_confirm: {
          doc_kind: 'marketing',
          brand: 'TimberTech',
          product_line: 'Legacy',
          year: 2025,
        },
      },
    })

    expect(result.classificationMismatches).toHaveLength(4)
    const sourcePage = await readFile(result.sourcePagePath, 'utf8')
    expect(sourcePage).toContain('doc_kind expected=marketing actual=tech-bulletin')
    expect(sourcePage).toContain('brand expected=TimberTech actual=Deckorators')
  })
})
