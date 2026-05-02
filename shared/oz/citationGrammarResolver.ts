/**
 * Shared citation grammar: six bracket/wiki forms + XML `<artifact/>` / `<panel/>`.
 * Spec: docs/wiki-kb/track-c-chat-integration.md §10, Q&A §3;
 * artifact/panel contract: docs/code-sandbox-and-artifact-generation.md §3, §12.2.2.
 * Imported by backend Oz chat tooling and frontend wiki agents (no cross-tier imports).
 */
export type CitationKind = 'doc' | 'call' | 'image' | 'catalog' | 'recs' | 'wiki'

export type ParsedCitation =
  | { kind: 'doc'; raw: string; chunkId: string }
  | { kind: 'call'; raw: string; chunkId: string }
  | { kind: 'image'; raw: string; path: string }
  | { kind: 'catalog'; raw: string; keyType: 'sku' | 'line' | 'sub'; key: string }
  | { kind: 'recs'; raw: string; recKind: string; key: string; index: number }
  | { kind: 'recs'; raw: string; method: string }
  | { kind: 'wiki'; raw: string; slug: string }
  | {
      kind: 'artifact'
      raw: string
      id: string
      artifactKind?: string
      title?: string
      sizeBytes?: string
    }
  | { kind: 'panel'; raw: string; id: string; panelKind?: string }

/** Alias for emphasis when mixing citations with XML nodes (same union as ParsedCitation). */
export type ParsedGrammarNode = ParsedCitation

export type CitationLookupTables = {
  docChunks?: Record<string, Record<string, unknown>>
  callChunks?: Record<string, Record<string, unknown>>
  images?: Record<string, Record<string, unknown>>
  catalog?: {
    sku?: Record<string, Record<string, unknown>>
    line?: Record<string, Record<string, unknown>>
    sub?: Record<string, Record<string, unknown>>
  }
  recommendations?: {
    byRule?: Record<string, Array<Record<string, unknown>>>
    byMethod?: Record<string, Record<string, unknown>>
  }
  wikiPages?: Record<string, Record<string, unknown>>
  /** Registry oracle for `<artifact id="…"/>` — ids returned from tool_result in the same turn. */
  artifacts?: Record<string, Record<string, unknown>>
  /** Registry oracle for `<panel id="…"/>` — ids returned from tool_result in the same turn. */
  panels?: Record<string, Record<string, unknown>>
}

export type ResolvedCitation =
  | { ok: true; citation: ParsedCitation; record: Record<string, unknown> }
  | {
      ok: false
      citation: ParsedCitation
      reason:
        | 'missing_record'
        | 'removed_chunk'
        | 'deprecated_sku'
        | 'archived_page'
        | 'invalid_recs_index'
        | 'invalid_artifact_id'
        | 'invalid_panel_id'
    }

const INLINE_PATTERN = /\[(doc|call|image|catalog|recs):([^[\]]+)\]/g
const WIKI_PATTERN = /\[\[wiki:([^[\]]+)\]\]/g

/** Shown when `<artifact id="…"/>` is not present in the registry oracle (docs §3). */
export const STALE_OR_INVALID_ARTIFACT_ID = 'Stale or invalid artifact id'

/** Shown when `<panel id="…"/>` is not present in the registry oracle (symmetric with artifact). */
export const STALE_OR_INVALID_PANEL_ID = 'Stale or invalid panel id'

/** Exported for split/render pipelines (chat UI, Obsidian HTML wrapper). */
export const OZ_CITATION_INLINE_PATTERN = INLINE_PATTERN
export const OZ_CITATION_WIKI_PATTERN = WIKI_PATTERN

function parseInlineCitation(raw: string): ParsedCitation | null {
  const body = raw.slice(1, -1).trim()
  const separator = body.indexOf(':')
  if (separator < 0) return null

  const head = body.slice(0, separator).trim().toLowerCase()
  const tail = body.slice(separator + 1).trim()
  if (tail.length === 0) return null

  if (head === 'doc') return { kind: 'doc', raw, chunkId: tail }
  if (head === 'call') return { kind: 'call', raw, chunkId: tail }
  if (head === 'image') return { kind: 'image', raw, path: tail }

  if (head === 'catalog') {
    const [keyTypeRaw, ...rest] = tail.split('=')
    const keyType = keyTypeRaw?.trim().toLowerCase()
    const key = rest.join('=').trim()
    if ((keyType !== 'sku' && keyType !== 'line' && keyType !== 'sub') || key.length === 0) return null
    return { kind: 'catalog', raw, keyType, key }
  }

  if (head === 'recs') {
    if (tail.toLowerCase().startsWith('method=')) {
      const method = tail.slice('method='.length).trim()
      if (method.length === 0) return null
      return { kind: 'recs', raw, method }
    }
    const hashIndex = tail.lastIndexOf('#')
    if (hashIndex < 0) return null
    const recPath = tail.slice(0, hashIndex).trim()
    const indexValue = Number.parseInt(tail.slice(hashIndex + 1), 10)
    if (!Number.isInteger(indexValue) || indexValue < 0) return null
    const colon = recPath.indexOf(':')
    if (colon < 0) return null
    const recKind = recPath.slice(0, colon).trim()
    const key = recPath.slice(colon + 1).trim()
    if (recKind.length === 0 || key.length === 0) return null
    return { kind: 'recs', raw, recKind, key, index: indexValue }
  }

  return null
}

function parseWikiCitation(raw: string): ParsedCitation | null {
  const body = raw.slice(2, -2).trim()
  const prefix = 'wiki:'
  if (!body.toLowerCase().startsWith(prefix)) return null
  const slug = body.slice(prefix.length).trim()
  if (slug.length === 0) return null
  return { kind: 'wiki', raw, slug }
}

/** Parse a single citation token (`[doc:…]` / `[[wiki:…]]`). */
export function parseOzCitationToken(raw: string): ParsedCitation | null {
  const t = raw.trim()
  if (t.startsWith('[[')) return parseWikiCitation(t)
  return parseInlineCitation(t)
}

function statusOf(record: Record<string, unknown> | undefined): string | null {
  if (record == null) return null
  const value = record.status
  if (typeof value !== 'string') return null
  return value.trim().toLowerCase()
}

function extractBracketCitationSpans(input: string): Array<{ index: number; node: ParsedCitation }> {
  const parsed: Array<{ index: number; node: ParsedCitation }> = []

  for (const match of input.matchAll(INLINE_PATTERN)) {
    const raw = match[0]
    const citation = parseInlineCitation(raw)
    if (citation != null && match.index !== undefined) parsed.push({ index: match.index, node: citation })
  }

  for (const match of input.matchAll(WIKI_PATTERN)) {
    const raw = match[0]
    const citation = parseWikiCitation(raw)
    if (citation != null && match.index !== undefined) parsed.push({ index: match.index, node: citation })
  }

  return parsed
}

/**
 * Index of the closing `>` for a tag starting at `from` (the `<` position), or -1 if incomplete.
 * Quote-aware so `title="a>b"` does not terminate early.
 */
export function findClosingAngleBracket(input: string, from: number): number {
  let i = from
  let quote: '"' | "'" | null = null
  while (i < input.length) {
    const c = input[i]
    if (quote) {
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      i++
      continue
    }
    if (c === '>') return i
    i++
  }
  return -1
}

function parseXmlAttributes(attrSection: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrSection)) != null) {
    const key = m[1]?.trim().toLowerCase() ?? ''
    const val = (m[3] ?? m[4] ?? '').trim()
    if (key.length > 0) attrs[key] = val
  }
  return attrs
}

function parseArtifactOrPanelTag(raw: string): ParsedGrammarNode | null {
  const open = raw.match(/^<\s*(artifact|panel)\b/i)
  if (open == null || open.index === undefined) return null
  const tag = open[1].toLowerCase() as 'artifact' | 'panel'
  const gt = findClosingAngleBracket(raw, 0)
  if (gt < 0) return null
  const inner = raw.slice(open.index + open[0].length, gt)
  const attrs = parseXmlAttributes(inner)
  const id = attrs.id?.trim() ?? ''
  if (id.length === 0) return null

  if (tag === 'artifact') {
    return {
      kind: 'artifact',
      raw,
      id,
      artifactKind: attrs.kind,
      title: attrs.title,
      sizeBytes: attrs.size_bytes,
    }
  }

  return {
    kind: 'panel',
    raw,
    id,
    panelKind: attrs.kind,
  }
}

function collectXmlGrammarNodes(input: string): Array<{ index: number; node: ParsedGrammarNode }> {
  const out: Array<{ index: number; node: ParsedGrammarNode }> = []
  let pos = 0
  while (pos < input.length) {
    const lt = input.indexOf('<', pos)
    if (lt < 0) break
    const tail = input.slice(lt, lt + 64)
    if (!/^<\s*(artifact|panel)\b/i.test(tail)) {
      pos = lt + 1
      continue
    }
    const close = findClosingAngleBracket(input, lt)
    if (close < 0) {
      pos = lt + 1
      continue
    }
    const raw = input.slice(lt, close + 1)
    const node = parseArtifactOrPanelTag(raw)
    if (node != null) out.push({ index: lt, node })
    pos = close + 1
  }
  return out
}

function isBracketCitation(n: ParsedGrammarNode): n is Exclude<ParsedGrammarNode, { kind: 'artifact' | 'panel' }> {
  return n.kind !== 'artifact' && n.kind !== 'panel'
}

/**
 * All citation brackets plus `<artifact/>` / `<panel/>` tags, in document order.
 */
export function extractGrammarNodes(input: string): ParsedGrammarNode[] {
  const spans = [...extractBracketCitationSpans(input), ...collectXmlGrammarNodes(input)]
  spans.sort((a, b) => a.index - b.index)
  return spans.map((s) => s.node)
}

/** Segments for assistant markdown inline pass (bracket cites + `<artifact/>` / `<panel/>`). */
export type OzAssistantInlineSegment =
  | { type: 'text'; text: string }
  | { type: 'cite'; raw: string }
  | { type: 'grammar'; raw: string; node: ParsedGrammarNode }

/**
 * Split a single line into plain text, bracket/wiki citation tokens, and XML artifact/panel tags
 * (document order; overlapping spans drop later hits — same spirit as bracket citation splitting).
 */
export function splitOzAssistantInlineLine(line: string): OzAssistantInlineSegment[] {
  type Span =
    | { start: number; end: number; t: 'cite'; raw: string }
    | { start: number; end: number; t: 'grammar'; raw: string; node: ParsedGrammarNode }

  const spans: Span[] = []

  const reInline = new RegExp(INLINE_PATTERN.source, 'g')
  let m: RegExpExecArray | null
  while ((m = reInline.exec(line)) !== null) {
    if (m.index !== undefined) {
      spans.push({ start: m.index, end: m.index + m[0].length, t: 'cite', raw: m[0] })
    }
  }
  const reWiki = new RegExp(WIKI_PATTERN.source, 'g')
  while ((m = reWiki.exec(line)) !== null) {
    if (m.index !== undefined) {
      spans.push({ start: m.index, end: m.index + m[0].length, t: 'cite', raw: m[0] })
    }
  }

  let pos = 0
  while (pos < line.length) {
    const lt = line.indexOf('<', pos)
    if (lt < 0) break
    const tail = line.slice(lt, lt + 64)
    if (!/^<\s*(artifact|panel)\b/i.test(tail)) {
      pos = lt + 1
      continue
    }
    const close = findClosingAngleBracket(line, lt)
    if (close < 0) break
    const raw = line.slice(lt, close + 1)
    const node = parseArtifactOrPanelTag(raw)
    if (node != null) {
      spans.push({ start: lt, end: close + 1, t: 'grammar', raw, node })
    }
    pos = close + 1
  }

  spans.sort((a, b) => a.start - b.start || a.end - b.end)
  const kept: Span[] = []
  let guard = -1
  for (const s of spans) {
    if (s.start < guard) continue
    kept.push(s)
    guard = s.end
  }

  const out: OzAssistantInlineSegment[] = []
  let cursor = 0
  for (const s of kept) {
    if (s.start > cursor) {
      out.push({ type: 'text', text: line.slice(cursor, s.start) })
    }
    if (s.t === 'cite') {
      out.push({ type: 'cite', raw: s.raw })
    } else {
      out.push({ type: 'grammar', raw: s.raw, node: s.node })
    }
    cursor = s.end
  }
  if (cursor < line.length) {
    out.push({ type: 'text', text: line.slice(cursor) })
  }
  return out
}

/** Panel-aware inline segments (tn4): citations + XML as unified grammar nodes. */
export type AssistantInlineSegment =
  | { type: 'text'; text: string }
  | { type: 'grammar'; node: ParsedGrammarNode }

/**
 * Split one assistant markdown line: bracket citations plus `<artifact/>` / `<panel/>`, as grammar nodes.
 */
export function splitAssistantInlineLine(input: string): AssistantInlineSegment[] {
  const bracketSpans = extractBracketCitationSpans(input).map((s) => ({
    start: s.index,
    end: s.index + s.node.raw.length,
    node: s.node as ParsedGrammarNode,
  }))
  const xmlSpans = collectXmlGrammarNodes(input).map((s) => ({
    start: s.index,
    end: s.index + s.node.raw.length,
    node: s.node,
  }))
  const spans = [...bracketSpans, ...xmlSpans].sort((a, b) => a.start - b.start || a.end - b.end)
  const filtered: typeof spans = []
  let guard = -1
  for (const s of spans) {
    if (s.start < guard) continue
    filtered.push(s)
    guard = s.end
  }
  const out: AssistantInlineSegment[] = []
  let cursor = 0
  for (const s of filtered) {
    if (s.start > cursor) out.push({ type: 'text', text: input.slice(cursor, s.start) })
    out.push({ type: 'grammar', node: s.node })
    cursor = s.end
  }
  if (cursor < input.length) out.push({ type: 'text', text: input.slice(cursor) })
  return out
}

export function extractCitations(input: string): Exclude<ParsedGrammarNode, { kind: 'artifact' | 'panel' }>[] {
  return extractGrammarNodes(input).filter(isBracketCitation)
}

/**
 * Incremental parser for SSE token streams: buffers from `<` until a closing `>` so
 * partial `<artifact …` is not flushed as visible text (docs §12.2.2 streaming notes).
 */
export function extractCommittedStreamingPrefix(buffer: string): { committed: string; rest: string } {
  let i = 0
  let committed = ''
  while (i < buffer.length) {
    const lt = buffer.indexOf('<', i)
    if (lt < 0) {
      committed += buffer.slice(i)
      return { committed, rest: '' }
    }
    committed += buffer.slice(i, lt)
    const close = findClosingAngleBracket(buffer, lt)
    if (close < 0) return { committed, rest: buffer.slice(lt) }
    committed += buffer.slice(lt, close + 1)
    i = close + 1
  }
  return { committed, rest: '' }
}

export class StreamingGrammarBuffer {
  private pending = ''

  append(chunk: string): { safeText: string } {
    this.pending += chunk
    const { committed, rest } = extractCommittedStreamingPrefix(this.pending)
    this.pending = rest
    return { safeText: committed }
  }

  /** Call when the SSE stream ends; emits any held suffix (including incomplete `<…`). */
  flush(): { safeText: string } {
    const tail = this.pending
    this.pending = ''
    return { safeText: tail }
  }
}

export function resolveCitation(citation: ParsedCitation, tables: CitationLookupTables): ResolvedCitation {
  if (citation.kind === 'artifact') {
    const record = tables.artifacts?.[citation.id]
    if (record == null) return { ok: false, citation, reason: 'invalid_artifact_id' }
    return { ok: true, citation, record }
  }

  if (citation.kind === 'panel') {
    const record = tables.panels?.[citation.id]
    if (record == null) return { ok: false, citation, reason: 'invalid_panel_id' }
    return { ok: true, citation, record }
  }

  if (citation.kind === 'doc') {
    const record = tables.docChunks?.[citation.chunkId]
    if (record == null) return { ok: false, citation, reason: 'missing_record' }
    if (statusOf(record) === 'removed') return { ok: false, citation, reason: 'removed_chunk' }
    return { ok: true, citation, record }
  }

  if (citation.kind === 'call') {
    const record = tables.callChunks?.[citation.chunkId]
    if (record == null) return { ok: false, citation, reason: 'missing_record' }
    if (statusOf(record) === 'removed') return { ok: false, citation, reason: 'removed_chunk' }
    return { ok: true, citation, record }
  }

  if (citation.kind === 'image') {
    const record = tables.images?.[citation.path]
    if (record == null) return { ok: false, citation, reason: 'missing_record' }
    if (statusOf(record) === 'removed') return { ok: false, citation, reason: 'removed_chunk' }
    return { ok: true, citation, record }
  }

  if (citation.kind === 'catalog') {
    const collection = tables.catalog?.[citation.keyType]
    const record = collection?.[citation.key]
    if (record == null) return { ok: false, citation, reason: 'missing_record' }
    if (citation.keyType === 'sku' && statusOf(record) === 'deprecated') {
      return { ok: false, citation, reason: 'deprecated_sku' }
    }
    return { ok: true, citation, record }
  }

  if (citation.kind === 'wiki') {
    const record = tables.wikiPages?.[citation.slug]
    if (record == null) return { ok: false, citation, reason: 'missing_record' }
    if (statusOf(record) === 'archived') return { ok: false, citation, reason: 'archived_page' }
    return { ok: true, citation, record }
  }

  if ('method' in citation) {
    const record = tables.recommendations?.byMethod?.[citation.method]
    if (record == null) return { ok: false, citation, reason: 'missing_record' }
    return { ok: true, citation, record }
  }

  const recKey = `${citation.recKind}:${citation.key}`
  const recordList = tables.recommendations?.byRule?.[recKey]
  if (recordList == null) return { ok: false, citation, reason: 'missing_record' }
  const record = recordList[citation.index]
  if (record == null) return { ok: false, citation, reason: 'invalid_recs_index' }
  return { ok: true, citation, record }
}

export function resolveCitations(input: string, tables: CitationLookupTables): ResolvedCitation[] {
  return extractCitations(input).map((citation) => resolveCitation(citation, tables))
}

export function resolveGrammarNodes(input: string, tables: CitationLookupTables): ResolvedCitation[] {
  return extractGrammarNodes(input).map((node) => resolveCitation(node, tables))
}

/** Maps resolve reasons to user-visible literal warnings for artifact/panel (docs §3). */
export function literalWarningForResolved(node: ResolvedCitation): string | null {
  if (node.ok) return null
  if (node.reason === 'invalid_artifact_id') return STALE_OR_INVALID_ARTIFACT_ID
  if (node.reason === 'invalid_panel_id') return STALE_OR_INVALID_PANEL_ID
  return null
}
