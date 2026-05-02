/**
 * Pure citation hover titles + click payloads for Oz chat / previews.
 * Spec: docs/wiki-kb/track-c-chat-integration.md §10.
 */
import type { ParsedCitation } from '../../../../shared/oz/citationGrammarResolver'
import {
  OZ_CITATION_INLINE_PATTERN,
  OZ_CITATION_WIKI_PATTERN,
  parseOzCitationToken,
  resolveCitation,
  type CitationLookupTables,
  type ResolvedCitation,
} from '../../../../shared/oz/citationGrammarResolver'

const HOVER_MAX = 900

export type OzCitationClickDetail =
  | { kind: 'doc'; chunkId: string; raw: string }
  | { kind: 'call'; chunkId: string; raw: string }
  | { kind: 'image'; path: string; raw: string }
  | { kind: 'catalog'; keyType: 'sku' | 'line' | 'sub'; key: string; raw: string }
  | {
      kind: 'recs'
      raw: string
      variant: 'rule'
      recKind: string
      key: string
      index: number
    }
  | { kind: 'recs'; raw: string; variant: 'method'; method: string }
  | { kind: 'wiki'; slug: string; raw: string }

function strField(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1))}…`
}

function summarizeRecord(record: Record<string, unknown>, preferKeys: string[]): string {
  const lines: string[] = []
  const primary = strField(record, preferKeys)
  if (primary) lines.push(primary)
  const jsonish = ['sku', 'code', 'line', 'name', 'description', 'title', 'method', 'rep', 'call_id'].filter(
    (k) => record[k] != null && typeof record[k] !== 'object',
  )
  for (const k of jsonish) {
    const v = record[k]
    if (typeof v === 'string' || typeof v === 'number') {
      const s = String(v).trim()
      if (s && !lines.some((l) => l.includes(s))) lines.push(`${k}: ${s}`)
    }
  }
  return truncate(lines.join('\n'), HOVER_MAX)
}

/** Deterministic hover text for native `title=` tooltips (and Obsidian HTML export). */
export function citationHoverTitle(
  parsed: ParsedCitation | null,
  resolved: ResolvedCitation | null,
): string {
  if (parsed == null) return 'Citation (unrecognized token)'

  if (!resolved || !resolved.ok) {
    const reason =
      resolved && !resolved.ok ? ` (${resolved.reason.replace(/_/g, ' ')})` : ' (not in lookup tables)'
    return truncate(`${parsed.raw}${reason}`, HOVER_MAX)
  }

  const { citation, record } = resolved

  if (citation.kind === 'doc') {
    const chunk = strField(record, ['content', 'text', 'chunk_text', 'snippet', 'body'])
    const src = strField(record, ['source_title', 'title', 'source_id', 'path', 'file'])
    const body = [chunk && `Chunk: ${chunk}`, src && `Source: ${src}`].filter(Boolean).join('\n\n')
    return truncate(body || parsed.raw, HOVER_MAX)
  }

  if (citation.kind === 'call') {
    const chunk = strField(record, ['content', 'text', 'chunk_text', 'snippet'])
    const callId = strField(record, ['call_id', 'id'])
    const rep = strField(record, ['rep', 'representative', 'sales_rep', 'owner'])
    return truncate(
      [chunk && `Chunk: ${chunk}`, callId && `Call: ${callId}`, rep && `Rep: ${rep}`]
        .filter(Boolean)
        .join('\n'),
      HOVER_MAX,
    )
  }

  if (citation.kind === 'image') {
    const path = citation.path
    const alt = strField(record, ['alt', 'caption', 'label'])
    return truncate(`Image · ${path}${alt ? `\n${alt}` : ''}\n(Click: open full size)`, HOVER_MAX)
  }

  if (citation.kind === 'catalog') {
    if (citation.keyType === 'sku') {
      return truncate(
        summarizeRecord(record, ['description', 'name', 'title']) ||
          `SKU ${citation.key}\n${summarizeRecord(record, ['line', 'category'])}`,
        HOVER_MAX,
      )
    }
    if (citation.keyType === 'line') {
      return truncate(
        summarizeRecord(record, ['summary', 'description', 'name', 'title']) ||
          `Product line ${citation.key}`,
        HOVER_MAX,
      )
    }
    return truncate(summarizeRecord(record, ['description', 'name', 'title']) || `Subcategory ${citation.key}`, HOVER_MAX)
  }

  if (citation.kind === 'recs') {
    if ('method' in citation) {
      return truncate(
        summarizeRecord(record, ['description', 'summary', 'snippet', 'method']) ||
          `Recommendations method · ${citation.method}`,
        HOVER_MAX,
      )
    }
    return truncate(
      summarizeRecord(record, ['rule', 'description', 'summary', 'snippet']) ||
        `Rule ${citation.recKind}:${citation.key} · row #${citation.index}`,
      HOVER_MAX,
    )
  }

  if (citation.kind === 'wiki') {
    const para =
      strField(record, ['summary', 'first_paragraph', 'preview', 'excerpt']) ||
      strField(record, ['body', 'content'])
    return truncate(
      para ? `Wiki · ${citation.slug}\n\n${para}` : `Wiki page · ${citation.slug}`,
      HOVER_MAX,
    )
  }

  return parsed.raw
}

export function citationClickDetail(
  parsed: ParsedCitation | null,
  resolved: ResolvedCitation | null,
): OzCitationClickDetail | null {
  if (parsed == null) return null

  if (parsed.kind === 'doc') {
    return { kind: 'doc', chunkId: parsed.chunkId, raw: parsed.raw }
  }
  if (parsed.kind === 'call') {
    return { kind: 'call', chunkId: parsed.chunkId, raw: parsed.raw }
  }
  if (parsed.kind === 'image') {
    return { kind: 'image', path: parsed.path, raw: parsed.raw }
  }
  if (parsed.kind === 'catalog') {
    return {
      kind: 'catalog',
      keyType: parsed.keyType,
      key: parsed.key,
      raw: parsed.raw,
    }
  }
  if (parsed.kind === 'recs') {
    if ('method' in parsed) {
      return { kind: 'recs', variant: 'method', method: parsed.method, raw: parsed.raw }
    }
    return {
      kind: 'recs',
      variant: 'rule',
      recKind: parsed.recKind,
      key: parsed.key,
      index: parsed.index,
      raw: parsed.raw,
    }
  }
  if (parsed.kind === 'wiki') {
    return { kind: 'wiki', slug: parsed.slug, raw: parsed.raw }
  }
  return null
}

export type CitationLineSegment =
  | { type: 'text'; text: string }
  | { type: 'cite'; raw: string }

/** Split a single markdown line into alternating plain text and citation tokens (non-overlapping). */
export function splitLineAtOzCitations(line: string): CitationLineSegment[] {
  const spans: { start: number; end: number; raw: string }[] = []
  // Fresh RegExp instances — the exported patterns are shared `/g` regexes whose lastIndex must not leak state here.
  const reInline = new RegExp(OZ_CITATION_INLINE_PATTERN.source, 'g')
  let m: RegExpExecArray | null
  while ((m = reInline.exec(line)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, raw: m[0] })
  }
  const reWiki = new RegExp(OZ_CITATION_WIKI_PATTERN.source, 'g')
  while ((m = reWiki.exec(line)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, raw: m[0] })
  }
  spans.sort((a, b) => a.start - b.start || a.end - b.end)
  const filtered: typeof spans = []
  let guard = -1
  for (const s of spans) {
    if (s.start < guard) continue
    filtered.push(s)
    guard = s.end
  }

  const out: CitationLineSegment[] = []
  let cursor = 0
  for (const s of filtered) {
    if (s.start > cursor) out.push({ type: 'text', text: line.slice(cursor, s.start) })
    out.push({ type: 'cite', raw: s.raw })
    cursor = s.end
  }
  if (cursor < line.length) out.push({ type: 'text', text: line.slice(cursor) })
  return out
}

/** Escape text for inclusion in a double-quoted HTML attribute. */
export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function citeCssKind(parsed: ParsedCitation | null): string {
  if (parsed == null) return 'unknown'
  return parsed.kind
}

function wrapOzCitationLineForObsidianHtml(line: string, tbl: CitationLookupTables): string {
  const segments = splitLineAtOzCitations(line)
  if (segments.every((s) => s.type === 'text')) return line
  let out = ''
  for (const seg of segments) {
    if (seg.type === 'text') {
      out += seg.text
      continue
    }
    const parsed = parseOzCitationToken(seg.raw)
    const resolved = parsed ? resolveCitation(parsed, tbl) : null
    const title = escapeHtmlAttr(citationHoverTitle(parsed, resolved))
    const kind = citeCssKind(parsed)
    out += `<span class="oz-cite oz-cite-${kind}" title="${title}">${escapeHtmlText(seg.raw)}</span>`
  }
  return out
}

/**
 * Wrap citation tokens in `<span class="oz-cite oz-cite-<kind>" title="…">…</span>` for Obsidian Reading view (HTML allowed in Markdown).
 * Pure string transform; run on vault exports when you want native browser tooltips in Obsidian preview.
 */
export function wrapOzCitationsForObsidianHtml(body: string, tables: CitationLookupTables | undefined): string {
  const tbl = tables ?? {}
  return body.split('\n').map((line) => wrapOzCitationLineForObsidianHtml(line, tbl)).join('\n')
}
