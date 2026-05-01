/**
 * Shared citation grammar: six forms + resolution against lookup tables.
 * Spec: docs/wiki-kb/track-c-chat-integration.md §10, Q&A §3.
 * Consumed by the wiki lint agent (frontend re-export) and available to chat tooling.
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
    }

const INLINE_PATTERN = /\[(doc|call|image|catalog|recs):([^[\]]+)\]/g
const WIKI_PATTERN = /\[\[wiki:([^[\]]+)\]\]/g

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

function statusOf(record: Record<string, unknown> | undefined): string | null {
  if (record == null) return null
  const value = record.status
  if (typeof value !== 'string') return null
  return value.trim().toLowerCase()
}

export function extractCitations(input: string): ParsedCitation[] {
  const parsed: ParsedCitation[] = []

  for (const match of input.matchAll(INLINE_PATTERN)) {
    const raw = match[0]
    const citation = parseInlineCitation(raw)
    if (citation != null) parsed.push(citation)
  }

  for (const match of input.matchAll(WIKI_PATTERN)) {
    const raw = match[0]
    const citation = parseWikiCitation(raw)
    if (citation != null) parsed.push(citation)
  }

  return parsed
}

export function resolveCitation(citation: ParsedCitation, tables: CitationLookupTables): ResolvedCitation {
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
