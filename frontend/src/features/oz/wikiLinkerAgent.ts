import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
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

const WIKI_LINK_RE = /\[\[wiki:([^\]]+)\]\]/g

async function listMarkdownFilesRecursive(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_')) continue
      files.push(...(await listMarkdownFilesRecursive(absolute)))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(absolute)
    }
  }
  return files
}

function splitWikiBody(markdown: string): { frontmatter: string; body: string } {
  if (!markdown.startsWith('---\n')) return { frontmatter: '', body: markdown }
  const end = markdown.indexOf('\n---\n', 4)
  if (end < 0) return { frontmatter: '', body: markdown }
  return { frontmatter: markdown.slice(4, end), body: markdown.slice(end + 5) }
}

function mergeFrontmatterPage(frontmatter: string, body: string): string {
  if (frontmatter.length === 0) return body
  return `---\n${frontmatter}\n---\n${body}`
}

function upsertSection(body: string, sectionTitle: string, inner: string): string {
  const header = `## ${sectionTitle}`
  const idx = body.indexOf(header)
  const innerTrim = inner.trim()
  if (idx < 0) {
    const base = body.trimEnd()
    return `${base}\n\n${header}\n\n${innerTrim}\n`
  }
  const afterHeader = idx + header.length
  const rest = body.slice(afterHeader)
  const nextSection = rest.search(/^##\s+/m)
  const before = body.slice(0, idx)
  const tail = nextSection >= 0 ? body.slice(afterHeader + nextSection) : ''
  return `${before}${header}\n\n${innerTrim}\n${tail}`
}

export type RunLinkerBacklinkInput = {
  repoRoot: string
  /** Defaults to 50 — spill long lists into `<page>.backlinks.md`. */
  collapseThreshold?: number
}

export type RunLinkerBacklinkResult = {
  updatedPages: string[]
  companionPages: string[]
}

export async function runLinkerBacklinkMaintenance(input: RunLinkerBacklinkInput): Promise<RunLinkerBacklinkResult> {
  const wikiRoot = path.join(input.repoRoot, 'wiki')
  const threshold = input.collapseThreshold ?? 50
  const files = await listMarkdownFilesRecursive(wikiRoot)
  const inbound = new Map<string, Set<string>>()

  for (const file of files) {
    const rel = path.relative(wikiRoot, file).replaceAll('\\', '/')
    if (rel.startsWith('_drafts/') || rel.startsWith('_lint/')) continue
    const text = await readFile(file, 'utf8')
    WIKI_LINK_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WIKI_LINK_RE.exec(text)) != null) {
      const targetSlug = match[1]?.trim()
      if (targetSlug == null || targetSlug.length === 0) continue
      const slugPath = targetSlug.replace(/^\//, '')
      const withoutMd = slugPath.endsWith('.md') ? slugPath.slice(0, -3) : slugPath
      const set = inbound.get(withoutMd) ?? new Set<string>()
      const fromSlug = rel.replace(/\.md$/i, '')
      set.add(fromSlug)
      inbound.set(withoutMd, set)
    }
  }

  const updatedPages: string[] = []
  const companionPages: string[] = []

  for (const [slugKey, sources] of inbound.entries()) {
    const targetPath = path.join(wikiRoot, `${slugKey}.md`)
    if (!(await exists(targetPath))) continue

    const sorted = [...sources].sort((a, b) => a.localeCompare(b))
    const bullets = sorted.map((s) => `- [[wiki:${s}]]`)

    let mentionedInner: string
    if (sorted.length > threshold) {
      const companionPath = targetPath.replace(/\.md$/i, '.backlinks.md')
      const companionBody = [`# Backlinks for [[wiki:${slugKey}]]`, '', ...bullets].join('\n')
      await mkdir(path.dirname(companionPath), { recursive: true })
      await writeFile(companionPath, `${companionBody}\n`, 'utf8')
      companionPages.push(companionPath)
      const preview = sorted.slice(0, 10).map((s) => `- [[wiki:${s}]]`).join('\n')
      const companionRel = path.relative(wikiRoot, companionPath).replaceAll('\\', '/').replace(/\.md$/i, '')
      mentionedInner = [
        `High backlink volume (${sorted.length} inbound pages). Full list: [[wiki:${companionRel}]].`,
        '',
        '### Recent inbound (sample)',
        preview,
      ].join('\n')
    } else {
      mentionedInner = bullets.join('\n')
    }

    const original = await readFile(targetPath, 'utf8')
    const { frontmatter, body } = splitWikiBody(original)
    const nextBody = upsertSection(body, 'Mentioned in', mentionedInner)
    await writeFile(targetPath, mergeFrontmatterPage(frontmatter, nextBody), 'utf8')
    updatedPages.push(targetPath)
  }

  return { updatedPages, companionPages }
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
