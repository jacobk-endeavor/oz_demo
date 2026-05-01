import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Filesystem-safe slug for `wiki/_drafts/diff-queue/<queueSlug>.json` */
export function wikiPageToQueueSlug(wikiRelativePath: string): string {
  const trimmed = wikiRelativePath.trim().replace(/^wiki\//, '').replace(/\.md$/i, '')
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page'
}

export type DiffQueueJob = {
  job_id: string
  source_id: string
  section_name: string
  proposed_change: string
  enqueued_at: string
}

export type DiffQueueFile = {
  queue_version: 1
  page_slug: string
  jobs: DiffQueueJob[]
  updated_at: string
}

function isoNow(now: Date): string {
  return now.toISOString()
}

export async function readDiffQueue(repoRoot: string, queueSlug: string): Promise<DiffQueueFile | null> {
  const filePath = path.join(repoRoot, 'wiki', '_drafts', 'diff-queue', `${queueSlug}.json`)
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as DiffQueueFile
  } catch {
    return null
  }
}

export async function writeDiffQueue(repoRoot: string, payload: DiffQueueFile): Promise<string> {
  const dir = path.join(repoRoot, 'wiki', '_drafts', 'diff-queue')
  await mkdir(dir, { recursive: true })
  const slug = wikiPageToQueueSlug(payload.page_slug)
  const filePath = path.join(dir, `${slug}.json`)
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return filePath
}

export async function enqueueDiffJob(input: {
  repoRoot: string
  /** e.g. `entities/products/voyage.md` */
  wikiRelativePath: string
  job: Omit<DiffQueueJob, 'job_id' | 'enqueued_at'>
  now?: Date
  jobId?: string
}): Promise<{ filePath: string; queue: DiffQueueFile }> {
  const now = input.now ?? new Date()
  const slug = wikiPageToQueueSlug(input.wikiRelativePath)
  const existing = await readDiffQueue(input.repoRoot, slug)
  const base: DiffQueueFile =
    existing != null && existing.queue_version === 1
      ? existing
      : {
          queue_version: 1,
          page_slug: input.wikiRelativePath.replace(/^wiki\//, ''),
          jobs: [],
          updated_at: isoNow(now),
        }

  const job: DiffQueueJob = {
    job_id: input.jobId ?? `job_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    enqueued_at: isoNow(now),
    source_id: input.job.source_id,
    section_name: input.job.section_name,
    proposed_change: input.job.proposed_change,
  }

  const next: DiffQueueFile = {
    ...base,
    jobs: [...base.jobs, job],
    updated_at: isoNow(now),
  }

  const filePath = await writeDiffQueue(input.repoRoot, next)
  return { filePath, queue: next }
}

/** FIFO: returns next job and persisted queue with that job removed. */
export async function popNextDiffJob(input: {
  repoRoot: string
  wikiRelativePath: string
  now?: Date
}): Promise<{ job: DiffQueueJob | null; queue: DiffQueueFile | null }> {
  const now = input.now ?? new Date()
  const slug = wikiPageToQueueSlug(input.wikiRelativePath)
  const q = await readDiffQueue(input.repoRoot, slug)
  if (q == null || q.jobs.length === 0) return { job: null, queue: q }

  const [next, ...rest] = q.jobs
  const updated: DiffQueueFile = {
    ...q,
    jobs: rest,
    updated_at: now.toISOString(),
  }
  await writeDiffQueue(input.repoRoot, updated)
  return { job: next ?? null, queue: updated }
}

export async function listQueuedPages(repoRoot: string): Promise<string[]> {
  const dir = path.join(repoRoot, 'wiki', '_drafts', 'diff-queue')
  try {
    const names = await readdir(dir)
    return names.filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/i, ''))
  } catch {
    return []
  }
}
