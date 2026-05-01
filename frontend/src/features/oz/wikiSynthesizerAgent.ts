import { appendFile, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  if (!markdown.startsWith('---\n')) return { frontmatter: '', body: markdown }
  const end = markdown.indexOf('\n---\n', 4)
  if (end < 0) return { frontmatter: '', body: markdown }
  return { frontmatter: markdown.slice(4, end), body: markdown.slice(end + 5) }
}

function readFrontmatterField(fm: string, key: string): string | null {
  const prefix = `${key}:`
  const line = fm.split('\n').find((l) => l.trimStart().startsWith(prefix))
  if (line == null) return null
  const rest = line.slice(line.indexOf(':') + 1).trim()
  return rest.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
}

async function walkMarkdownFiles(dir: string, acc: string[]): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('_')) continue
        await walkMarkdownFiles(full, acc)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        acc.push(full)
      }
    }
  } catch {
    /* missing dir */
  }
}

export type WikiPageMeta = {
  relativePath: string
  title: string
  updated: string | null
}

export async function collectWikiPageMeta(repoRoot: string): Promise<WikiPageMeta[]> {
  const wikiRoot = path.join(repoRoot, 'wiki')
  const files: string[] = []
  await walkMarkdownFiles(path.join(wikiRoot, 'entities'), files)
  await walkMarkdownFiles(path.join(wikiRoot, 'concepts'), files)

  const meta: WikiPageMeta[] = []
  for (const file of files) {
    const raw = await readFile(file, 'utf8')
    const { frontmatter } = splitFrontmatter(raw)
    const rel = path.relative(wikiRoot, file).replace(/\\/g, '/')
    meta.push({
      relativePath: rel,
      title: readFrontmatterField(frontmatter, 'title') ?? rel,
      updated: readFrontmatterField(frontmatter, 'updated'),
    })
  }
  return meta.sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''))
}

export function countIngestLikeEntries(logText: string): number {
  let n = 0
  for (const line of logText.split('\n')) {
    if (/\| ingest \|/i.test(line)) n += 1
    else if (/\bingest\b/i.test(line) && /source_id=/i.test(line)) n += 1
  }
  return n
}

export type RunWikiSynthesizerInput = {
  repoRoot: string
  now: Date
  minSources?: number
  force?: boolean
}

export type RunWikiSynthesizerResult = {
  updated: boolean
  synthesisPath: string
  skippedReason?: string
}

function bumpFrontmatter(fm: string, stamp: string): string {
  const lines = fm.split('\n')
  let sourceCount = 0
  const next = lines.map((line) => {
    const t = line.trimStart()
    if (t.startsWith('updated:')) return `updated: ${stamp}`
    if (t.startsWith('source_count:')) {
      const prior = Number.parseInt(line.split(':')[1]?.trim() ?? '', 10)
      sourceCount = Number.isFinite(prior) ? prior + 1 : 1
      return `source_count: ${sourceCount}`
    }
    return line
  })
  return next.join('\n')
}

export async function runWikiSynthesizer(input: RunWikiSynthesizerInput): Promise<RunWikiSynthesizerResult> {
  const minSources = input.minSources ?? 5
  const synthesisPath = path.join(input.repoRoot, 'wiki', 'synthesis.md')
  const logPath = path.join(input.repoRoot, 'wiki', 'log.md')

  const logText = await readFile(logPath, 'utf8').catch(() => '')
  const sourcesSeen = countIngestLikeEntries(logText)
  if (!input.force && sourcesSeen < minSources) {
    return {
      updated: false,
      synthesisPath,
      skippedReason: `only ${sourcesSeen} ingest-like log entries (need ${minSources})`,
    }
  }

  const pages = (await collectWikiPageMeta(input.repoRoot)).slice(0, 12)
  const topList = pages
    .map((p) => `- [[wiki:${p.relativePath.replace(/\.md$/i, '')}]] — ${p.title}`)
    .join('\n')

  const stamp = input.now.toISOString().slice(0, 10)
  const existing = await readFile(synthesisPath, 'utf8')
  const { frontmatter, body } = splitFrontmatter(existing)
  const mergedFm = bumpFrontmatter(frontmatter.length > 0 ? frontmatter : 'type: synthesis\nslug: synthesis', stamp)

  const nextBody = `${body.replace(/\n## Working Thesis[\s\S]*$/, '').trimEnd()}

## Working Thesis

Automated synthesis pass (${stamp}). Weight evidence by **recency × confidence × source_count**, not recency alone — cite at least one source older than 90 days when available (anti-recency-bias rule).

Top recently touched entity/concept pages:

${topList || '- (none yet)'}

## What Changed

- Rewritten from structured ingest signals in wiki/log.md (${sourcesSeen} ingest-like entries).

## Open Questions

- OQ-1: Which claims still lack multi-source corroboration?
- OQ-2: Where does structured catalog data contradict brochure prose?
`

  const next = `---\n${mergedFm}\n---\n${nextBody.trimStart()}\n`
  await writeFile(synthesisPath, next, 'utf8')

  const logEntry = `\n## [${input.now.toISOString().slice(0, 16).replace('T', ' ')}] synthesis | agent=wikiSynthesizer | sources_seen=${sourcesSeen}\n`
  await appendFile(logPath, logEntry, 'utf8')

  return { updated: true, synthesisPath }
}
