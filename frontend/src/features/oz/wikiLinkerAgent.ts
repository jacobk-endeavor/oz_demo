import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type LinkerCandidate = {
  kind: 'brands' | 'products'
  name: string
}

export type RunLinkerInput = {
  repoRoot: string
  sourcePagePath: string
  candidates?: LinkerCandidate[]
  now?: Date
}

export type RunLinkerResult = {
  createdStubs: string[]
  reusedAliases: string[]
}

function dayStamp(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function toSlug(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'unknown'
}

export function normalizeAliasSlug(input: string, aliases: Record<string, string>): string {
  const normalized = toSlug(input)
  return aliases[normalized] ?? normalized
}

function parseAliases(content: string): Record<string, string> {
  const aliases: Record<string, string> = {}
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('- ')) continue
    const arrowIndex = line.indexOf('->')
    if (arrowIndex < 0) continue
    const left = toSlug(line.slice(2, arrowIndex).trim())
    const right = toSlug(line.slice(arrowIndex + 2).trim())
    if (left.length === 0 || right.length === 0) continue
    aliases[left] = right
  }
  return aliases
}

async function readAliases(repoRoot: string): Promise<Record<string, string>> {
  const aliasesPath = path.join(repoRoot, 'wiki', '_aliases.md')
  try {
    const text = await readFile(aliasesPath, 'utf8')
    return parseAliases(text)
  } catch {
    return {}
  }
}

function extractCandidatesFromSourcePage(markdown: string): LinkerCandidate[] {
  const brandMatch = markdown.match(/^brand:\s*"?([^"\n]+)"?$/m)
  const productLineMatch = markdown.match(/^product_line:\s*"?([^"\n]+)"?$/m)
  const candidates: LinkerCandidate[] = []
  if (brandMatch?.[1] != null) candidates.push({ kind: 'brands', name: brandMatch[1].trim() })
  if (productLineMatch?.[1] != null) candidates.push({ kind: 'products', name: productLineMatch[1].trim() })
  return candidates
}

function buildStubMarkdown(input: { kind: 'brands' | 'products'; slug: string; title: string; now: Date }): string {
  const entityKind = input.kind === 'brands' ? 'brand' : 'product-line'
  const date = dayStamp(input.now)
  const pageSlug = `entities/${input.kind}/${input.slug}`
  return `---
type: entity
slug: ${pageSlug}
title: ${input.title}
created: ${date}
updated: ${date}
source_count: 1
related: []
tags: []
confidence: low
entity_kind: ${entityKind}
---

## Summary
- Stub page created by Linker Agent after source mention.

## Evidence
- Pending first diff pass.

## Open Questions
- What source-backed claims should be promoted here first?

## Mentioned in
- Pending backlink refresh.
`
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

export async function runLinkerAgent(input: RunLinkerInput): Promise<RunLinkerResult> {
  const aliases = await readAliases(input.repoRoot)
  const now = input.now ?? new Date()
  const sourceContent = await readFile(input.sourcePagePath, 'utf8')
  const candidates = input.candidates ?? extractCandidatesFromSourcePage(sourceContent)
  const createdStubs: string[] = []
  const reusedAliases: string[] = []

  for (const candidate of candidates) {
    const normalized = toSlug(candidate.name)
    const resolved = normalizeAliasSlug(candidate.name, aliases)
    if (resolved !== normalized) {
      reusedAliases.push(`${candidate.kind}:${normalized}->${resolved}`)
    }
    const target = path.join(input.repoRoot, 'wiki', 'entities', candidate.kind, `${resolved}.md`)
    if (await exists(target)) continue

    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(
      target,
      buildStubMarkdown({
        kind: candidate.kind,
        slug: resolved,
        title: candidate.name.trim(),
        now,
      }),
      'utf8',
    )
    createdStubs.push(target)
  }

  return { createdStubs, reusedAliases }
}
