import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FREQUENT_NOVEL_KEY_THRESHOLD, runWikiSchemaReview } from './wikiSchemaAgent'

const fm = (fields: Record<string, string>) =>
  `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\n`

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('wikiSchemaAgent', () => {
  it('reports novel frontmatter keys and matches Lint threshold for frequent drift', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'wiki-schema-agent-'))
    roots.push(repoRoot)
    const wiki = path.join(repoRoot, 'wiki')
    await mkdir(path.join(wiki, 'entities'), { recursive: true })

    const base = {
      type: 'entity',
      slug: 'entities/x',
      title: 'X',
      created: '2026-05-01',
      updated: '2026-05-01',
      source_count: '1',
      related: '[]',
      tags: '[]',
      confidence: 'low',
      entity_kind: 'brand',
    }

    const writePage = async (name: string, extra: Record<string, string>) => {
      await writeFile(
        path.join(wiki, name),
        `${fm({ ...base, slug: `entities/${name.replace('.md', '')}`, ...extra })}\n## Summary\n`,
        'utf8',
      )
    }

    await writePage('a.md', { provenance: 'imported' })
    await writePage('b.md', { provenance: 'manual' })
    await writePage('c.md', { provenance: 'imported' })

    const rareKeyPages = 3
    expect(rareKeyPages).toBeLessThan(FREQUENT_NOVEL_KEY_THRESHOLD)

    const result = await runWikiSchemaReview(repoRoot, new Date('2026-05-15'))
    expect(result.novelKeys.map((r) => r.key)).toContain('provenance')
    expect(result.frequentNovelKeys).toEqual([])

    const report = await readFile(result.reportPath, 'utf8')
    expect(report).toContain('provenance')
    expect(report).toContain('Frequent novel keys')
  })

  it('classifies novel keys as frequent when page count crosses threshold', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'wiki-schema-frequent-'))
    roots.push(repoRoot)
    const wiki = path.join(repoRoot, 'wiki')
    await mkdir(path.join(wiki, 'entities'), { recursive: true })

    const base = {
      type: 'entity',
      title: 'X',
      created: '2026-05-01',
      updated: '2026-05-01',
      source_count: '1',
      related: '[]',
      tags: '[]',
      confidence: 'low',
      entity_kind: 'brand',
    }

    for (let i = 0; i < FREQUENT_NOVEL_KEY_THRESHOLD; i++) {
      const slug = `entities/drift-${i}`
      await writeFile(
        path.join(wiki, `entities/drift-${i}.md`),
        `${fm({ ...base, slug, custom_field: String(i) })}\n## Summary\n`,
        'utf8',
      )
    }

    const result = await runWikiSchemaReview(repoRoot, new Date('2026-05-15'))
    expect(result.frequentNovelKeys.some((r) => r.key === 'custom_field')).toBe(true)
  })
})
