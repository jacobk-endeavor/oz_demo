import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { enqueueDiffJob, listQueuedPages, popNextDiffJob, wikiPageToQueueSlug } from './wikiDiffQueue'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })))
})

describe('wikiDiffQueue', () => {
  it('maps wiki paths to stable queue slugs', () => {
    expect(wikiPageToQueueSlug('wiki/entities/products/voyage.md')).toBe('entities-products-voyage')
    expect(wikiPageToQueueSlug('entities/products/voyage.md')).toBe('entities-products-voyage')
  })

  it('enqueues FIFO jobs per page and pops in order', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'wiki-diff-queue-'))
    roots.push(repoRoot)

    await enqueueDiffJob({
      repoRoot,
      wikiRelativePath: 'entities/products/voyage.md',
      job: {
        source_id: 's1',
        section_name: 'Pricing',
        proposed_change: 'add tier note',
      },
      now: new Date('2026-05-01T12:00:00.000Z'),
      jobId: 'j1',
    })

    await enqueueDiffJob({
      repoRoot,
      wikiRelativePath: 'entities/products/voyage.md',
      job: {
        source_id: 's2',
        section_name: 'Colors',
        proposed_change: 'add swatch',
      },
      now: new Date('2026-05-01T12:01:00.000Z'),
      jobId: 'j2',
    })

    const listed = await listQueuedPages(repoRoot)
    expect(listed).toContain('entities-products-voyage')

    const first = await popNextDiffJob({
      repoRoot,
      wikiRelativePath: 'entities/products/voyage.md',
      now: new Date('2026-05-01T12:02:00.000Z'),
    })
    expect(first.job?.job_id).toBe('j1')

    const second = await popNextDiffJob({
      repoRoot,
      wikiRelativePath: 'entities/products/voyage.md',
      now: new Date('2026-05-01T12:03:00.000Z'),
    })
    expect(second.job?.job_id).toBe('j2')

    const emptyPath = path.join(repoRoot, 'wiki', '_drafts', 'diff-queue', 'entities-products-voyage.json')
    const tail = await readFile(emptyPath, 'utf8')
    expect(JSON.parse(tail).jobs).toEqual([])
  })
})
