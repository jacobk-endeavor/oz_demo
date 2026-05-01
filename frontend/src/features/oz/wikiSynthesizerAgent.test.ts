import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { countIngestLikeEntries, runWikiSynthesizer } from './wikiSynthesizerAgent'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })))
})

async function seedWiki(root: string) {
  await mkdir(path.join(root, 'wiki', 'entities', 'brands'), { recursive: true })
  await writeFile(path.join(root, 'wiki', 'log.md'), '# Wiki Log\n', 'utf8')
  await writeFile(
    path.join(root, 'wiki', 'synthesis.md'),
    `---
type: synthesis
slug: synthesis
title: Test
created: 2026-05-01
updated: 2026-05-01
source_count: 0
---

## Working Thesis

Hold.

## What Changed

- Nothing.

## Open Questions

- Q?
`,
    'utf8',
  )
  await writeFile(
    path.join(root, 'wiki', 'entities', 'brands', 'acme.md'),
    `---
type: entity
slug: brands/acme
title: Acme
updated: 2026-05-02
---

## Summary
x
`,
    'utf8',
  )
}

describe('runWikiSynthesizer', () => {
  it('counts ingest-like log lines', () => {
    const text = ['| ingest | a |', '| ingest | b |', 'noise', '| ingest | c |'].join('\n')
    expect(countIngestLikeEntries(text)).toBe(3)
  })

  it('skips until enough ingest signals unless forced', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wiki-synth-'))
    roots.push(root)
    await seedWiki(root)
    await writeFile(path.join(root, 'wiki', 'log.md'), '| ingest | x |\n', 'utf8')

    const skipped = await runWikiSynthesizer({ repoRoot: root, now: new Date('2026-05-10T12:00:00Z') })
    expect(skipped.updated).toBe(false)
    expect(skipped.skippedReason).toContain('only 1')

    const forced = await runWikiSynthesizer({
      repoRoot: root,
      now: new Date('2026-05-10T12:05:00Z'),
      force: true,
    })
    expect(forced.updated).toBe(true)
    const synth = await readFile(path.join(root, 'wiki', 'synthesis.md'), 'utf8')
    expect(synth).toContain('anti-recency')
    expect(synth).toContain('[[wiki:entities/brands/acme]]')
  })
})
