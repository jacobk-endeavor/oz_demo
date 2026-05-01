import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runCuratorAnalysis } from './wikiCuratorAgent'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })))
})

describe('runCuratorAnalysis', () => {
  it('proposes split for oversized pages', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wiki-curator-'))
    roots.push(root)
    await mkdir(path.join(root, 'wiki', 'entities', 'products'), { recursive: true })
    const filler = Array.from({ length: 402 }, (_, i) => `line ${i}`).join('\n')
    await writeFile(
      path.join(root, 'wiki', 'entities', 'products', 'huge.md'),
      `---
type: entity
slug: products/huge
title: Huge
updated: 2026-05-01
source_count: 5
---

## Summary
${filler}
`,
      'utf8',
    )

    const proposals = await runCuratorAnalysis({ repoRoot: root, nowIsoDate: '2026-05-10' })
    expect(proposals.some((p) => p.kind === 'split' && p.path.includes('huge.md'))).toBe(true)
  })

  it('proposes archive for stale low-evidence pages', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wiki-curator-'))
    roots.push(root)
    await mkdir(path.join(root, 'wiki', 'concepts'), { recursive: true })
    await writeFile(
      path.join(root, 'wiki', 'concepts', 'stale.md'),
      `---
type: concept
slug: concepts/stale
title: Stale
updated: 2025-01-01
source_count: 1
---

## Summary
ok
`,
      'utf8',
    )

    const proposals = await runCuratorAnalysis({ repoRoot: root, nowIsoDate: '2026-07-01' })
    expect(proposals.some((p) => p.kind === 'archive')).toBe(true)
  })
})
