import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ExtractManifest } from './extractArtifact'
import {
  buildLazySkuSection,
  buildNearDuplicateSection,
  buildPlaybookPlanSection,
  normalizeIngestManifest,
  runStructuredDataWikiBootstrap,
  tryReadFullExtractText,
  tryReadRepoJson,
} from './wikiIngestPlaybooks'

type SupportedEvent = 'kb.ingested' | 'kb.refreshed'

export type WikiIngestEvent = {
  event_version: 1
  event: SupportedEvent
  source_id: string
  replay?: boolean
  classify_confirm?: {
    doc_kind?: string
    brand?: string
    product_line?: string
    year?: number
  }
  /** Registry-derived near-duplicate candidates (source_ids); Curator review, no auto-merge. */
  near_duplicate_source_ids?: string[]
  /** When a newer ingested source supersedes an older wiki slug (frontmatter `supersedes`). */
  supersedes_slug?: string
}

export type RunIngestScaffoldInput = {
  repoRoot: string
  event: WikiIngestEvent
  now?: Date
}

export type RunIngestScaffoldResult = {
  sourcePagePath: string
  slug: string
  logEntry: string
  classificationMismatches: string[]
  bootstrappedWikiPaths: string[]
}

function toSlug(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'source'
}

function quoteYamlString(input: string): string {
  return `"${input.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function dayStamp(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function logStamp(now: Date): string {
  return now.toISOString().slice(0, 16).replace('T', ' ')
}

function buildClassificationMismatches(manifest: ExtractManifest, event: WikiIngestEvent): string[] {
  const expected = event.classify_confirm
  if (expected == null) return []
  const mismatches: string[] = []
  if (expected.doc_kind != null && expected.doc_kind !== manifest.doc_kind) {
    mismatches.push(`doc_kind expected=${expected.doc_kind} actual=${manifest.doc_kind}`)
  }
  if (expected.brand != null && expected.brand !== manifest.brand) {
    mismatches.push(`brand expected=${expected.brand} actual=${manifest.brand ?? 'unknown'}`)
  }
  if (expected.product_line != null && expected.product_line !== manifest.product_line) {
    mismatches.push(`product_line expected=${expected.product_line} actual=${manifest.product_line ?? 'unknown'}`)
  }
  if (expected.year != null && expected.year !== manifest.year) {
    mismatches.push(`year expected=${String(expected.year)} actual=${manifest.year == null ? 'unknown' : String(manifest.year)}`)
  }
  return mismatches
}

function buildSourcePage(input: {
  manifest: ExtractManifest
  slug: string
  now: Date
  mismatches: string[]
  playbookSection: string
  lazySkuSection: string
  nearDuplicateSection: string
  event: WikiIngestEvent
}): string {
  const { manifest, slug, now, mismatches, playbookSection, lazySkuSection, nearDuplicateSection, event } = input
  const created = dayStamp(now)
  const chunkIds = manifest.units.flatMap((unit) => unit.chunk_ids).filter((id) => id.trim().length > 0)
  const citation = chunkIds[0] != null ? `[doc:${chunkIds[0]}]` : ''
  const mismatchLine =
    mismatches.length === 0
      ? '- none'
      : mismatches.map((item) => `- ${item}`).join('\n')
  const supersedesLine =
    event.supersedes_slug != null && event.supersedes_slug.trim().length > 0
      ? `supersedes: ${quoteYamlString(event.supersedes_slug.trim())}\n`
      : ''
  return `---
type: source
slug: ${quoteYamlString(`sources/${slug}`)}
title: ${quoteYamlString(manifest.title)}
created: ${created}
updated: ${created}
source_count: 1
related: []
tags: []
confidence: medium
source_id: ${manifest.source_id}
doc_kind: ${manifest.doc_kind}
${manifest.brand != null ? `brand: ${quoteYamlString(manifest.brand)}\n` : ''}${manifest.product_line != null ? `product_line: ${quoteYamlString(manifest.product_line)}\n` : ''}${manifest.year != null ? `year: ${String(manifest.year)}\n` : ''}${manifest.distributor_branded != null ? `distributor_branded: ${String(manifest.distributor_branded)}\n` : ''}${supersedesLine}---

## Summary
- Playbook-guided ingest scaffold. Primary citation: ${citation || '(none yet)'}

${playbookSection}${manifest.doc_kind === 'structured-data' ? buildStructuredArtifactsSection() : ''}${lazySkuSection}${nearDuplicateSection}
## Classification Check
${mismatchLine}

## Candidate Links
- To be populated by Linker Agent based on this source draft.
`
}

function buildStructuredArtifactsSection(): string {
  return [
    '## Structured-data artifacts',
    '- Product line entities and recommendation concept stubs are created idempotently (skip when files already exist).',
    '- Refresh deltas are handled via `kb.refreshed` — Diff updates structured fields on existing pages.',
    '',
  ].join('\n')
}

function buildLogEntry(event: WikiIngestEvent, manifest: ExtractManifest, now: Date): string {
  const replayToken = event.replay ? ' replay=true' : ''
  return `## [${logStamp(now)}] ingest | event=${event.event} | doc_kind=${manifest.doc_kind} | brand=${manifest.brand ?? 'unknown'} | line=${manifest.product_line ?? 'unknown'} | year=${manifest.year == null ? 'unknown' : String(manifest.year)} | source_id=${manifest.source_id}${replayToken}\n`
}

export async function runIngestAgentScaffold(input: RunIngestScaffoldInput): Promise<RunIngestScaffoldResult> {
  const now = input.now ?? new Date()
  const manifestPath = path.join(input.repoRoot, 'kb_extracts', input.event.source_id, 'manifest.json')
  const manifestRaw = await readFile(manifestPath, 'utf8')
  const manifest = normalizeIngestManifest(JSON.parse(manifestRaw))
  const slug = `${toSlug(manifest.title)}-${manifest.source_id}`
  const sourcePagePath = path.join(input.repoRoot, 'wiki', 'sources', `${slug}.md`)
  const logPath = path.join(input.repoRoot, 'wiki', 'log.md')
  const mismatches = buildClassificationMismatches(manifest, input.event)

  const fullText = await tryReadFullExtractText(input.repoRoot, manifest)
  const catalogPayload =
    manifest.doc_kind === 'catalog' || manifest.doc_kind === 'structured-data'
      ? await tryReadRepoJson(input.repoRoot, 'product_catalog.json')
      : null

  let bootstrappedWikiPaths: string[] = []
  if (manifest.doc_kind === 'structured-data') {
    const boot = await runStructuredDataWikiBootstrap({ repoRoot: input.repoRoot, manifest, now })
    bootstrappedWikiPaths = boot.writtenPaths
  }

  const playbookSection = buildPlaybookPlanSection({ manifest, fullText, catalogPayload })
  const lazySkuSection = manifest.doc_kind === 'structured-data' ? buildLazySkuSection(manifest) : ''
  const nearDuplicateSection = buildNearDuplicateSection({
    nearDuplicateSourceIds: input.event.near_duplicate_source_ids ?? [],
    supersedesSlug: input.event.supersedes_slug,
    distributorBranded: manifest.distributor_branded,
  })

  const sourcePage = buildSourcePage({
    manifest,
    slug,
    now,
    mismatches,
    playbookSection,
    lazySkuSection,
    nearDuplicateSection,
    event: input.event,
  })
  const logEntry = buildLogEntry(input.event, manifest, now)

  await mkdir(path.dirname(sourcePagePath), { recursive: true })
  await mkdir(path.join(input.repoRoot, 'wiki', 'entities', 'products'), { recursive: true })
  await mkdir(path.join(input.repoRoot, 'wiki', 'concepts', 'recommendations'), { recursive: true })
  await writeFile(sourcePagePath, sourcePage, 'utf8')
  await appendFile(logPath, `\n${logEntry}`, 'utf8')

  return {
    sourcePagePath,
    slug,
    logEntry,
    classificationMismatches: mismatches,
    bootstrappedWikiPaths,
  }
}
