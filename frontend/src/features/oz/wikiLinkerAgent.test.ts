import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeAliasSlug, runLinkerAgent } from './wikiLinkerAgent'

const tempRoots: string[] = []

async function createWikiFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wiki-linker-agent-'))
  tempRoots.push(root)
  await mkdir(path.join(root, 'wiki', 'sources'), { recursive: true })
  await mkdir(path.join(root, 'wiki', 'entities', 'brands'), { recursive: true })
  await mkdir(path.join(root, 'wiki', 'entities', 'products'), { recursive: true })
  const sourcePath = path.join(root, 'wiki', 'sources', 'voyage-abc123def456.md')
  await writeFile(
    sourcePath,
    `---
type: source
slug: sources/voyage-abc123def456
title: Voyage Bulletin
source_id: abc123def456
doc_kind: tech-bulletin
brand: "Deckorators"
product_line: "Voyage"
---
`,
    'utf8',
  )
  return { root, sourcePath }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })))
})

describe('normalizeAliasSlug', () => {
  it('normalizes and reuses alias maps', () => {
    expect(normalizeAliasSlug('Timber Tech', { 'timber-tech': 'timbertech' })).toBe('timbertech')
    expect(normalizeAliasSlug('Deckorators', {})).toBe('deckorators')
  })
})

describe('runLinkerAgent', () => {
  it('creates brand and product stubs from source page frontmatter', async () => {
    const { root, sourcePath } = await createWikiFixture()
    const result = await runLinkerAgent({
      repoRoot: root,
      sourcePagePath: sourcePath,
      now: new Date('2026-05-01T21:30:00.000Z'),
    })
    expect(result.createdStubs).toHaveLength(2)
    const brandStub = await readFile(path.join(root, 'wiki', 'entities', 'brands', 'deckorators.md'), 'utf8')
    expect(brandStub).toContain('entity_kind: brand')
    const productStub = await readFile(path.join(root, 'wiki', 'entities', 'products', 'voyage.md'), 'utf8')
    expect(productStub).toContain('entity_kind: product-line')
  })

  it('consults wiki/_aliases.md before creating new entities', async () => {
    const { root, sourcePath } = await createWikiFixture()
    await writeFile(path.join(root, 'wiki', '_aliases.md'), '- timber-tech -> timbertech\n', 'utf8')
    const result = await runLinkerAgent({
      repoRoot: root,
      sourcePagePath: sourcePath,
      candidates: [
        { kind: 'brands', name: 'Timber Tech' },
        { kind: 'products', name: 'Legacy' },
      ],
      now: new Date('2026-05-01T21:30:00.000Z'),
    })
    expect(result.reusedAliases).toContain('brands:timber-tech->timbertech')
    const aliased = await readFile(path.join(root, 'wiki', 'entities', 'brands', 'timbertech.md'), 'utf8')
    expect(aliased).toContain('type: entity')
  })
})
