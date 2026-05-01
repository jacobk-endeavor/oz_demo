import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { rebuildWikiIndex } from './wikiIndexAgent'

const tempRoots: string[] = []

async function writePage(root: string, rel: string, title: string, updated: string, sourceCount = 1) {
  const target = path.join(root, 'wiki', rel)
  await mkdir(path.dirname(target), { recursive: true })
  const slug = rel.replace(/\.md$/, '').replaceAll('\\', '/')
  await writeFile(
    target,
    `---
type: entity
slug: ${slug}
title: ${title}
updated: ${updated}
source_count: ${sourceCount}
---
## Summary
- content
`,
    'utf8',
  )
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })))
})

describe('rebuildWikiIndex', () => {
  it('rebuilds index.md sections sorted by updated descending', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wiki-index-agent-'))
    tempRoots.push(root)
    await writePage(root, 'entities/products/voyage.md', 'Voyage', '2026-05-02', 3)
    await writePage(root, 'entities/brands/deckorators.md', 'Deckorators', '2026-05-01', 5)
    await writePage(root, 'sources/voyage-source.md', 'Voyage Source', '2026-05-03', 1)
    await writePage(root, 'synthesis.md', 'Synthesis', '2026-05-04', 0)
    await writePage(root, 'concepts/install/voyage.md', 'Voyage Install', '2026-05-01', 2)

    const result = await rebuildWikiIndex(root)
    expect(result.split).toBe(false)
    const index = await readFile(path.join(root, 'wiki', 'index.md'), 'utf8')
    expect(index).toContain('## Entities')
    expect(index).toContain('[[entities/products/voyage]] - Voyage')
    expect(index).toContain('## Sources')
  })
})
