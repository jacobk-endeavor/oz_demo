/**
 * kb_search — pgvector retrieval over `kb_rag_chunks` and/or `call_rag_chunks`.
 * Spec: docs/wiki-kb/track-c-chat-integration.md §1 (kb_search), Q&A §5.
 */

/** Matches ingest `rep_name` / `owner_user_id` values in demo call transcripts (see vite.ozRagCallsApi). */
export const OZ_DEMO_CALL_REP_IDS = ['Jacob', 'Sami', 'Ryan', 'Joanna'] as const

export type KbSearchSurface = 'kb' | 'call' | 'global'

export type KbSearchHit = {
  chunk_id: string
  content: string
  source_id: string
  locator: string
  score: number
  surface: 'kb' | 'call'
}

type ScopedDbQuery = <T>(sql: string, params: unknown[]) => Promise<{ rows: T[] }>

export type KbSearchDeps = {
  dbQuery: ScopedDbQuery
  embedQuery: (text: string) => Promise<number[]>
}

export type KbSearchArgs = {
  query: string
  /** Which substrate to search (defaults to `global`). */
  surface?: KbSearchSurface
  /** Max hits (default 8, clamped 1–24). */
  k?: number
  /** Filters kb chunks where `meta->>'doc_kind'` matches (case-insensitive). Ignored for call-only surface. */
  kind?: string
  /**
   * Rep scope for call chunks: `admin` searches all reps; otherwise must match `owner_user_id`.
   */
  call_scope?: string
  /** Valid rep IDs when enforcing single-rep scope (same demo contract as transcript RAG). */
  validRepIds?: readonly string[]
}

const OPENAI_EMBED = 'https://api.openai.com/v1/embeddings'

export async function embedOpenAiText(input: {
  fetchImpl?: typeof fetch
  apiKey: string
  model: string
  text: string
}): Promise<number[]> {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(OPENAI_EMBED, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      input: input.text,
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Embedding request failed (${response.status}): ${detail.slice(0, 200)}`)
  }
  const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> }
  const vector = payload.data?.[0]?.embedding
  if (!vector?.length) throw new Error('No embedding returned')
  return vector
}

function clampK(k: number | undefined): number {
  const n = Number(k)
  if (!Number.isFinite(n)) return 8
  return Math.min(24, Math.max(1, Math.trunc(n)))
}

function distanceToScore(dist: number): number {
  if (!Number.isFinite(dist)) return 0
  return Math.max(0, Math.min(1, 1 - dist))
}

function normalizeCallScope(
  raw: string | undefined,
  validRepIds: readonly string[] | undefined,
): { mode: 'admin' } | { mode: 'rep'; rep: string } | { mode: 'invalid'; message: string } {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed || trimmed.toLowerCase() === 'admin') return { mode: 'admin' }
  const reps = validRepIds ?? []
  if (reps.length > 0 && !reps.includes(trimmed)) {
    return { mode: 'invalid', message: `call_scope must be "admin" or one of: ${reps.join(', ')}` }
  }
  return { mode: 'rep', rep: trimmed }
}

type KbRow = {
  chunk_id: string
  source_id: string
  locator: string
  content: string
  dist: number
}

type CallRow = {
  chunk_id: string
  call_id: string
  chunk_index: number
  content: string
  dist: number
}

export async function runKbSearch(deps: KbSearchDeps, args: KbSearchArgs): Promise<KbSearchHit[]> {
  const q = String(args.query ?? '').trim()
  if (!q) return []

  const surface: KbSearchSurface = args.surface ?? 'global'
  const k = clampK(args.k)
  const kind = String(args.kind ?? '').trim().toLowerCase()
  const docKindFilter = kind.length > 0 ? kind : null

  const scopeInfo = normalizeCallScope(args.call_scope, args.validRepIds)
  if (scopeInfo.mode === 'invalid') {
    throw new Error(scopeInfo.message)
  }

  const embedding = await deps.embedQuery(q)
  const vecLiteral = `[${embedding.join(',')}]`

  const kbSql = docKindFilter
    ? `SELECT chunk_id, source_id, COALESCE(locator, '') AS locator, content,
              (embedding <=> $1::vector)::float8 AS dist
         FROM kb_rag_chunks
         WHERE status = 'ready'
           AND lower(COALESCE(meta->>'doc_kind','')) = $3
         ORDER BY embedding <=> $1::vector
         LIMIT $2`
    : `SELECT chunk_id, source_id, COALESCE(locator, '') AS locator, content,
              (embedding <=> $1::vector)::float8 AS dist
         FROM kb_rag_chunks
         WHERE status = 'ready'
         ORDER BY embedding <=> $1::vector
         LIMIT $2`

  const kbParams = docKindFilter ? [vecLiteral, k, docKindFilter] : [vecLiteral, k]

  let callSql: string
  let callParams: unknown[]
  if (scopeInfo.mode === 'admin') {
    callSql = `SELECT chunk_id, call_id, chunk_index, content,
                      (embedding <=> $1::vector)::float8 AS dist
                 FROM call_rag_chunks
                 ORDER BY embedding <=> $1::vector
                 LIMIT $2`
    callParams = [vecLiteral, k]
  } else {
    callSql = `SELECT chunk_id, call_id, chunk_index, content,
                      (embedding <=> $1::vector)::float8 AS dist
                 FROM call_rag_chunks
                 WHERE owner_user_id = $3
                 ORDER BY embedding <=> $1::vector
                 LIMIT $2`
    callParams = [vecLiteral, k, scopeInfo.rep]
  }

  if (surface === 'kb') {
    const rows = (await deps.dbQuery<KbRow>(kbSql, kbParams)).rows
    return rows.map((row) => ({
      chunk_id: row.chunk_id,
      content: row.content,
      source_id: row.source_id,
      locator: row.locator,
      score: distanceToScore(row.dist),
      surface: 'kb' as const,
    }))
  }

  if (surface === 'call') {
    const rows = (await deps.dbQuery<CallRow>(callSql, callParams)).rows
    return rows.map((row) => ({
      chunk_id: row.chunk_id,
      content: row.content,
      source_id: row.call_id,
      locator: String(row.chunk_index),
      score: distanceToScore(row.dist),
      surface: 'call' as const,
    }))
  }

  // global — merge both lists by distance (fetch up to k from each, then merge).
  const kbRows = (await deps.dbQuery<KbRow>(kbSql, kbParams)).rows
  const callRows = (await deps.dbQuery<CallRow>(callSql, callParams)).rows

  type Tagged =
    | { t: 'kb'; dist: number; hit: KbSearchHit }
    | { t: 'call'; dist: number; hit: KbSearchHit }
  const merged: Tagged[] = [
    ...kbRows.map((row) => ({
      t: 'kb' as const,
      dist: row.dist,
      hit: {
        chunk_id: row.chunk_id,
        content: row.content,
        source_id: row.source_id,
        locator: row.locator,
        score: distanceToScore(row.dist),
        surface: 'kb' as const,
      },
    })),
    ...callRows.map((row) => ({
      t: 'call' as const,
      dist: row.dist,
      hit: {
        chunk_id: row.chunk_id,
        content: row.content,
        source_id: row.call_id,
        locator: String(row.chunk_index),
        score: distanceToScore(row.dist),
        surface: 'call' as const,
      },
    })),
  ]
  merged.sort((a, b) => a.dist - b.dist)
  return merged.slice(0, k).map((m) => m.hit)
}
