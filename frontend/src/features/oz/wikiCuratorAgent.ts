import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

export type CuratorProposal =
  | { kind: 'split'; path: string; reason: string }
  | { kind: 'merge'; paths: [string, string]; reason: string }
  | { kind: 'archive'; path: string; reason: string }

function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  if (!markdown.startsWith('---\n')) return { frontmatter: '', body: markdown }
  const end = markdown.indexOf('\n---\n', 4)
  if (end < 0) return { frontmatter: '', body: markdown }
  return { frontmatter: markdown.slice(4, end), body: markdown.slice(end + 5) }
}

function readFrontmatterField(fm: string, key: string): string | null {
  const prefix = `${key}:`
  const line = fm.split('\n').find((l) => l.trimStart().startsWith(prefix))
  if (line == null) return null
  return line.slice(line.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1')
}

function countOpenSectionTopics(body: string): number {
  const openIdx = body.search(/^##\s+Open\b/im)
  if (openIdx < 0) return 0
  const slice = body.slice(openIdx)
  const sub = slice.match(/^###\s+/gm)
  return sub?.length ?? 0
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
    /* missing */
  }
}

export type RunCuratorAnalysisInput = {
  repoRoot: string
  /** ISO date string for age comparisons (tests pin time). */
  nowIsoDate: string
}

/** Deterministic structural proposals — Curator remains assisted; nothing is auto-applied. */
export async function runCuratorAnalysis(input: RunCuratorAnalysisInput): Promise<CuratorProposal[]> {
  const wikiRoot = path.join(input.repoRoot, 'wiki')
  const files: string[] = []
  await walkMarkdownFiles(path.join(wikiRoot, 'entities'), files)
  await walkMarkdownFiles(path.join(wikiRoot, 'concepts'), files)

  const proposals: CuratorProposal[] = []
  const today = new Date(input.nowIsoDate)

  for (const file of files) {
    const raw = await readFile(file, 'utf8')
    const rel = path.relative(wikiRoot, file).replace(/\\/g, '/')
    const { frontmatter, body } = splitFrontmatter(raw)
    const lines = raw.split('\n').length
    const sourceCount = Number.parseInt(readFrontmatterField(frontmatter, 'source_count') ?? '', 10)
    const updatedStr = readFrontmatterField(frontmatter, 'updated')
    const updated = updatedStr != null ? new Date(updatedStr) : null

    if (lines > 400) {
      proposals.push({
        kind: 'split',
        path: rel,
        reason: `page exceeds 400 lines (${lines}); split by sub-topic`,
      })
    }

    const openTopics = countOpenSectionTopics(body)
    if (openTopics > 3) {
      proposals.push({
        kind: 'split',
        path: rel,
        reason: `more than three distinct topics under "## Open" (${openTopics})`,
      })
    }

    const ageDays =
      updated != null && !Number.isNaN(updated.getTime()) ? (today.getTime() - updated.getTime()) / 86400000 : null
    if (ageDays != null && ageDays >= 180 && Number.isFinite(sourceCount) && sourceCount < 2) {
      proposals.push({
        kind: 'archive',
        path: rel,
        reason: `unchanged for ~${Math.floor(ageDays)} days with source_count=${sourceCount} — candidate archive pending inbound-link scan`,
      })
    }
  }

  return proposals
}
