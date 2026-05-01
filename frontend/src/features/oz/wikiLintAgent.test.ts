import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runWikiStructuralLint } from './wikiLintAgent'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })))
})

describe('runWikiStructuralLint', () => {
  it('finds structural issues and writes lint report', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wiki-lint-agent-'))
    tempRoots.push(root)
    await mkdir(path.join(root, 'wiki', 'sources'), { recursive: true })
    await mkdir(path.join(root, 'wiki', 'entities', 'products'), { recursive: true })
    await writeFile(
      path.join(root, 'wiki', 'sources', 'source-a.md'),
      `---
type: source
slug: sources/source-a
title: Source A
created: 2026-05-01
updated: 2026-05-01
source_count: 1
related: []
tags: []
confidence: medium
---
See [[wiki:entities/products/voyage]] and [doc:missing_chunk].
`,
      'utf8',
    )
    await writeFile(
      path.join(root, 'wiki', 'entities', 'products', 'voyage.md'),
      `---
type: entity
slug: entities/products/voyage
title: Voyage
created: 2026-05-01
updated: 2026-05-01
source_count: 1
related: []
tags: []
confidence: low
---
No links out.
`,
      'utf8',
    )

    const result = await runWikiStructuralLint(
      root,
      {
        docChunks: {},
      },
      new Date('2026-05-01T00:00:00.000Z'),
    )
    expect(result.findings.some((finding) => finding.kind === 'broken_citation')).toBe(true)
    expect(result.findings.some((finding) => finding.kind === 'orphan_page')).toBe(true)
    const report = await readFile(result.reportPath, 'utf8')
    expect(report).toContain('Broken citations')
    expect(report).toContain('Orphan pages')
  })
})
