type TranscriptChunkHit = {
  chunk_id: string
  call_id: string
  owner_user_id: string
  chunk_index: number
  content: string
  dist?: number
}

export type TranscriptCitation = {
  kind: 'transcript_chunk' | 'transcript_call'
  id: string
  label?: string
}

export type TranscriptSearchResult = {
  query: string
  scope: string
  hits: TranscriptChunkHit[]
  provenance: {
    source: 'postgres_call_rag_chunks' | 'stub'
    retrieval: 'semantic_vector' | 'none'
    top_k: number
  }
  citations: TranscriptCitation[]
}

export type TranscriptReadResult = {
  call_id: string
  scope: string
  chunks: Array<{
    chunk_id: string
    chunk_index: number
    owner_user_id: string
    content: string
  }>
  provenance: {
    source: 'postgres_call_rag_chunks' | 'stub'
    retrieval: 'call_lookup'
  }
  citations: TranscriptCitation[]
}

export type TranscriptToolRegistry = {
  search_transcripts: (args: { query: string; scope?: string; top_k?: number }) => Promise<TranscriptSearchResult>
  read_transcript: (args: { call_id: string; scope?: string; max_chunks?: number }) => Promise<TranscriptReadResult>
}

type TranscriptToolDeps = {
  fetchImpl?: typeof fetch
  dbQuery?: <T>(sql: string, params: unknown[]) => Promise<{ rows: T[] }>
  openAiApiKey?: string
  embeddingModel?: string
}

const OPENAI_EMBED = 'https://api.openai.com/v1/embeddings'

function toScope(value: string | undefined): string {
  const scope = String(value ?? '').trim()
  return scope || 'admin'
}

function topK(value: number | undefined): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 8
  return Math.min(24, Math.max(1, Math.trunc(n)))
}

function toCitations(hits: TranscriptChunkHit[]): TranscriptCitation[] {
  return hits.map((hit) => ({
    kind: 'transcript_chunk',
    id: hit.chunk_id,
    label: `${hit.call_id}#${hit.chunk_index}`,
  }))
}

function scopeWhereClause(scope: string): { sql: string; params: unknown[] } {
  if (!scope || scope === 'admin') return { sql: '', params: [] }
  return { sql: 'WHERE owner_user_id = $2', params: [scope] }
}

async function buildEmbedding(
  fetchImpl: typeof fetch,
  openAiApiKey: string,
  embeddingModel: string,
  query: string,
): Promise<number[]> {
  const response = await fetchImpl(OPENAI_EMBED, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: embeddingModel,
      input: query,
    }),
  })
  if (!response.ok) {
    throw new Error(`Embedding request failed (${response.status})`)
  }
  const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> }
  const vector = payload.data?.[0]?.embedding
  if (!vector?.length) throw new Error('No embedding returned')
  return vector
}

export function createTranscriptToolRegistry(deps: TranscriptToolDeps): TranscriptToolRegistry {
  const fetchImpl = deps.fetchImpl ?? fetch
  const dbQuery = deps.dbQuery
  const embeddingModel = deps.embeddingModel ?? 'text-embedding-3-small'

  return {
    async search_transcripts(args) {
      const query = String(args.query ?? '').trim()
      if (!query) {
        return {
          query,
          scope: toScope(args.scope),
          hits: [],
          provenance: { source: 'stub', retrieval: 'none', top_k: 0 },
          citations: [],
        }
      }

      if (!dbQuery || !deps.openAiApiKey) {
        return {
          query,
          scope: toScope(args.scope),
          hits: [],
          provenance: { source: 'stub', retrieval: 'none', top_k: topK(args.top_k) },
          citations: [],
        }
      }

      const scope = toScope(args.scope)
      const limit = topK(args.top_k)
      const embedding = await buildEmbedding(fetchImpl, deps.openAiApiKey, embeddingModel, query)
      const vecLiteral = `[${embedding.join(',')}]`
      const where = scopeWhereClause(scope)
      const limitParam = where.params.length === 0 ? '$2' : '$3'
      const sql = `SELECT chunk_id, call_id, owner_user_id, chunk_index, content,
        (embedding <=> $1::vector)::float8 AS dist
      FROM call_rag_chunks
      ${where.sql}
      ORDER BY embedding <=> $1::vector
      LIMIT ${limitParam}`
      const params = where.params.length === 0 ? [vecLiteral, limit] : [vecLiteral, ...where.params, limit]
      const rows = (await dbQuery<TranscriptChunkHit>(sql, params)).rows
      return {
        query,
        scope,
        hits: rows,
        provenance: { source: 'postgres_call_rag_chunks', retrieval: 'semantic_vector', top_k: limit },
        citations: toCitations(rows),
      }
    },

    async read_transcript(args) {
      const call_id = String(args.call_id ?? '').trim()
      const scope = toScope(args.scope)
      const max_chunks = Math.min(40, Math.max(1, Number(args.max_chunks) || 16))

      if (!call_id || !dbQuery) {
        return {
          call_id,
          scope,
          chunks: [],
          provenance: { source: 'stub', retrieval: 'call_lookup' },
          citations: [],
        }
      }

      const scopeWhere = scope === 'admin' ? '' : 'AND owner_user_id = $2'
      const limitParam = scope === 'admin' ? '$2' : '$3'
      const sql = `SELECT chunk_id, call_id, owner_user_id, chunk_index, content
      FROM call_rag_chunks
      WHERE call_id = $1 ${scopeWhere}
      ORDER BY chunk_index ASC
      LIMIT ${limitParam}`
      const params = scope === 'admin' ? [call_id, max_chunks] : [call_id, scope, max_chunks]
      const chunks = (await dbQuery<TranscriptChunkHit>(sql, params)).rows.map((row) => ({
        chunk_id: row.chunk_id,
        chunk_index: row.chunk_index,
        owner_user_id: row.owner_user_id,
        content: row.content,
      }))

      return {
        call_id,
        scope,
        chunks,
        provenance: { source: 'postgres_call_rag_chunks', retrieval: 'call_lookup' },
        citations: chunks.map((row) => ({
          kind: 'transcript_chunk',
          id: row.chunk_id,
          label: `${call_id}#${row.chunk_index}`,
        })),
      }
    },
  }
}
