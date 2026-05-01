import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type SupportedEvent = 'kb.ingested' | 'kb.refreshed'

type ManifestUnit = {
  locator: string
  chunk_ids: string[]
}

type ExtractManifest = {
  source_id: string
  title: string
  doc_kind: string
  brand?: string
  product_line?: string
  year?: number
  distributor_branded?: boolean
  units: ManifestUnit[]
}

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

function buildSourcePage(manifest: ExtractManifest, slug: string, now: Date, mismatches: string[]): string {
  const created = dayStamp(now)
  const chunkIds = manifest.units.flatMap((unit) => unit.chunk_ids).filter((id) => id.trim().length > 0)
  const citation = chunkIds[0] != null ? `[doc:${chunkIds[0]}]` : ''
  const mismatchLine =
    mismatches.length === 0
      ? '- none'
      : mismatches.map((item) => `- ${item}`).join('\n')
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
${manifest.brand != null ? `brand: ${quoteYamlString(manifest.brand)}\n` : ''}${manifest.product_line != null ? `product_line: ${quoteYamlString(manifest.product_line)}\n` : ''}${manifest.year != null ? `year: ${String(manifest.year)}\n` : ''}${manifest.distributor_branded != null ? `distributor_branded: ${String(manifest.distributor_branded)}\n` : ''}---

## Summary
- Initial ingest scaffold for this source. Playbook-specific enrichment follows in downstream tasks. ${citation}

## Classification Check
${mismatchLine}

## Candidate Links
- To be populated by Linker Agent based on this source draft.
`
}

function buildLogEntry(event: WikiIngestEvent, manifest: ExtractManifest, now: Date): string {
  const replayToken = event.replay ? ' replay=true' : ''
  return `## [${logStamp(now)}] ingest | event=${event.event} | doc_kind=${manifest.doc_kind} | brand=${manifest.brand ?? 'unknown'} | line=${manifest.product_line ?? 'unknown'} | year=${manifest.year == null ? 'unknown' : String(manifest.year)} | source_id=${manifest.source_id}${replayToken}\n`
}

export async function runIngestAgentScaffold(input: RunIngestScaffoldInput): Promise<RunIngestScaffoldResult> {
  const now = input.now ?? new Date()
  const manifestPath = path.join(input.repoRoot, 'kb_extracts', input.event.source_id, 'manifest.json')
  const manifestRaw = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(manifestRaw) as ExtractManifest
  const slug = `${toSlug(manifest.title)}-${manifest.source_id}`
  const sourcePagePath = path.join(input.repoRoot, 'wiki', 'sources', `${slug}.md`)
  const logPath = path.join(input.repoRoot, 'wiki', 'log.md')
  const mismatches = buildClassificationMismatches(manifest, input.event)
  const sourcePage = buildSourcePage(manifest, slug, now, mismatches)
  const logEntry = buildLogEntry(input.event, manifest, now)

  await mkdir(path.dirname(sourcePagePath), { recursive: true })
  await writeFile(sourcePagePath, sourcePage, 'utf8')
  await appendFile(logPath, `\n${logEntry}`, 'utf8')

  return {
    sourcePagePath,
    slug,
    logEntry,
    classificationMismatches: mismatches,
  }
}
