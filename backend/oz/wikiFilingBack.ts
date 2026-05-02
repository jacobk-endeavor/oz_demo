/**
 * Filing answers back — novelty gate + Curator Agent spawn + skipped-filing query logs.
 * Spec: docs/wiki-kb/track-c-chat-integration.md §7 (Q&A).
 */
import path from 'node:path'
import { mkdir, readFile, appendFile, writeFile, readdir } from 'node:fs/promises'
import { extractCitations, type ParsedCitation } from '../../shared/oz/citationGrammarResolver'
import type { KbSearchHit } from './kbSearchRag'
import type { WikiLookupResult } from './trackCToolScaffold'

export const MIN_FILING_EVIDENCE_SOURCES = 3

/** Strong wiki_lookup hit → existing synthesis likely covers this question (BM25-ish score scale). */
export const WIKI_LOOKUP_COVER_SCORE = 100

/** Curator merge suggestion when bag-of-words cosine ≥ this vs an existing concept body. */
export const FILING_CONCEPT_SIMILARITY_THRESHOLD = 0.8

export type FilingEvidenceContext = {
  kbHits?: KbSearchHit[]
  transcriptHits?: Array<{ call_id: string }>
}

export type FilingNoveltyResult = {
  offer_filing: boolean
  reasons: string[]
  distinct_source_count: number
  wiki_top_score?: number
  wiki_top_path?: string
}

export type FilingCuratorResult =
  | {
      action: 'merge_suggestion'
      target_relative_path: string
      similarity: number
      note: string
    }
  | {
      action: 'create'
      relative_path: string
      markdown: string
      wrote: boolean
    }

export function slugifyFilingSegment(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug.slice(0, 96) : 'concept'
}

export function isGeneralizableQuestion(question: string): boolean {
  const q = question.trim()
  if (q.length < 8) return false
  const lower = q.toLowerCase()

  if (/what did\b/.test(lower) && /\bsay\b/.test(lower) && /call|transcript/.test(lower)) return false
  if (/\bwhat did\b[\s\S]{0,120}\bsay\b[\s\S]{0,120}\b(in that call|on that call|in call)\b/i.test(q)) return false
  if (/\b(read_transcript|exact quote|verbatim)\b/i.test(lower) && /call|transcript/.test(lower)) return false
  if (/\bwhat did\b.*\bcustomer\b.*\bsay\b/i.test(lower)) return false

  return true
}

function substratePrefixFromChunkId(chunkId: string): string {
  const trimmed = chunkId.trim()
  const cut = trimmed.indexOf('_')
  if (cut > 0) return trimmed.slice(0, cut)
  return trimmed
}

function citationEvidenceKey(c: ParsedCitation): string | null {
  if (c.kind === 'doc') return `doc:${substratePrefixFromChunkId(c.chunkId)}`
  if (c.kind === 'call') return `call:${substratePrefixFromChunkId(c.chunkId)}`
  if (c.kind === 'image') return `image:${c.path}`
  if (c.kind === 'catalog') return `catalog:${c.keyType}:${c.key.toUpperCase()}`
  if (c.kind === 'wiki') return `wiki:${c.slug}`
  if ('method' in c) return `recs:method:${c.method}`
  return `recs:${c.recKind}:${c.key}`
}

export function collectDistinctEvidenceSources(
  assistantAnswer: string,
  evidence?: FilingEvidenceContext,
): { count: number; keys: Set<string> } {
  const keys = new Set<string>()
  for (const cite of extractCitations(assistantAnswer)) {
    const k = citationEvidenceKey(cite)
    if (k) keys.add(k)
  }
  for (const hit of evidence?.kbHits ?? []) {
    if (hit.surface === 'kb') keys.add(`doc:${hit.source_id}`)
    else keys.add(`call:${hit.source_id}`)
  }
  for (const hit of evidence?.transcriptHits ?? []) {
    const id = String(hit.call_id ?? '').trim()
    if (id) keys.add(`call:${id}`)
  }
  return { count: keys.size, keys }
}

export async function evaluateFilingNovelty(input: {
  userQuestion: string
  assistantAnswer: string
  scaffold: { wiki_lookup: (q: string, top_n?: number) => Promise<WikiLookupResult> }
  evidence?: FilingEvidenceContext
}): Promise<FilingNoveltyResult> {
  const reasons: string[] = []
  const { count, keys } = collectDistinctEvidenceSources(input.assistantAnswer, input.evidence)

  if (count < MIN_FILING_EVIDENCE_SOURCES) {
    reasons.push(`insufficient_distinct_sources_${count}_need_${MIN_FILING_EVIDENCE_SOURCES}`)
  }

  if (!isGeneralizableQuestion(input.userQuestion)) {
    reasons.push('question_not_generalizable')
  }

  let wiki_top_score: number | undefined
  let wiki_top_path: string | undefined
  const wiki = await input.scaffold.wiki_lookup(input.userQuestion, 4)
  const top = wiki.pages[0]
  if (top) {
    wiki_top_score = top.score
    wiki_top_path = top.path
    const norm = top.path.replace(/\\/g, '/').toLowerCase()
    const conceptish = norm.includes('/concepts/') || norm.startsWith('concepts/')
    if (conceptish && top.score >= WIKI_LOOKUP_COVER_SCORE) {
      reasons.push('wiki_lookup_covers_topic')
    }
  }

  const offer_filing = reasons.length === 0
  return {
    offer_filing,
    reasons,
    distinct_source_count: count,
    wiki_top_score,
    wiki_top_path,
  }
}

export type SkippedFilingLogPayload = {
  question: string
  reasons: string[]
  distinct_source_count: number
  citations_compact: string
  trace_id?: string
  conversation_id?: string
}

export async function appendSkippedFilingQueryEvent(repoRoot: string, payload: SkippedFilingLogPayload): Promise<void> {
  const logPath = path.join(repoRoot, 'wiki', 'log.md')
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const headerParts = [
    `event=track_c.filing_skipped`,
    `reasons=${payload.reasons.join('+')}`,
    `sources=${payload.distinct_source_count}`,
  ]
  if (payload.trace_id) headerParts.push(`trace=${payload.trace_id}`)
  if (payload.conversation_id) headerParts.push(`conversation=${payload.conversation_id}`)

  const safeQ = payload.question.replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, 300)
  const block = `
## [${stamp}] query | ${headerParts.join(' | ')}
- q: "${safeQ}"
- citations: ${payload.citations_compact.slice(0, 1200)}
`

  await mkdir(path.dirname(logPath), { recursive: true })
  let prefix = ''
  try {
    const prev = await readFile(logPath, 'utf8')
    if (prev.length > 0 && !prev.endsWith('\n')) prefix = '\n'
  } catch {
    prefix = ''
  }
  await appendFile(logPath, `${prefix}${block}`, 'utf8')
}

function stripOuterFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md
  const end = md.indexOf('\n---', 3)
  if (end < 0) return md
  return md.slice(end + 4).trimStart()
}

function tokenFrequency(text: string): Map<string, number> {
  const m = new Map<string, number>()
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((w) => w.length > 2)
  for (const w of words) {
    m.set(w, (m.get(w) ?? 0) + 1)
  }
  return m
}

function cosineSimilarityVectors(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (const [, v] of a) na += v * v
  for (const [, v] of b) nb += v * v
  for (const [k, v] of a) {
    const bv = b.get(k)
    if (bv != null) dot += v * bv
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

async function walkMarkdownFiles(root: string, acc: string[]): Promise<void> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(root, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue
        await walkMarkdownFiles(full, acc)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        acc.push(full)
      }
    }
  } catch {
    /* missing */
  }
}

/**
 * Curator Agent pass for filing-back: similarity scan vs `wiki/concepts/**`, then draft create.
 * Structural merges remain assisted — merge_suggestion does not edit files.
 */
export async function runFilingCuratorAgent(input: {
  repoRoot: string
  candidateBody: string
  suggestedSlug: string
  title: string
  nowIsoDate: string
  write?: boolean
}): Promise<FilingCuratorResult> {
  const conceptsRoot = path.join(input.repoRoot, 'wiki', 'concepts')
  const files: string[] = []
  await walkMarkdownFiles(conceptsRoot, files)

  const candVec = tokenFrequency(input.candidateBody)
  let best: { path: string; sim: number } | null = null
  for (const file of files) {
    const raw = await readFile(file, 'utf8').catch(() => '')
    const body = stripOuterFrontmatter(raw)
    const sim = cosineSimilarityVectors(candVec, tokenFrequency(body))
    if (!best || sim > best.sim) best = { path: file, sim }
  }

  const rel = (abs: string) => path.relative(path.join(input.repoRoot, 'wiki'), abs).replaceAll(path.sep, '/')

  if (best && best.sim >= FILING_CONCEPT_SIMILARITY_THRESHOLD) {
    return {
      action: 'merge_suggestion',
      target_relative_path: rel(best.path),
      similarity: best.sim,
      note: 'Candidate body is highly similar to an existing concept page — extend that page instead of creating a duplicate.',
    }
  }

  const slug = slugifyFilingSegment(input.suggestedSlug)
  const relative_path = `concepts/${slug}.md`
  const markdown = `---
title: "${input.title.replace(/"/g, '\\"')}"
updated: ${input.nowIsoDate}
source_count: 0
tags: ["chat-filing"]
---

## Summary

${input.candidateBody}

`

  let wrote = false
  if (input.write) {
    const outAbs = path.join(input.repoRoot, 'wiki', relative_path)
    await mkdir(path.dirname(outAbs), { recursive: true })
    await writeFile(outAbs, markdown, 'utf8')
    wrote = true
  }

  return { action: 'create', relative_path, markdown, wrote }
}

export function compactCitationList(answer: string, keys: Set<string>): string {
  const cites = extractCitations(answer)
  const inline = cites.slice(0, 24).map((c) => c.raw)
  const extra = [...keys].slice(0, 24)
  const merged = [...new Set([...inline, ...extra])]
  return merged.join(' ')
}
