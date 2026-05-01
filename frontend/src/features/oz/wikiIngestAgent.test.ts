import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
