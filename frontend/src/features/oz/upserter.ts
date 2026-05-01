import { EMBEDDING_DIM } from './embedder'

export type KbUpsertClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rowCount?: number }>
}

export type KbChunkRow = {
  chunkId: string
  sourceId: string
  scope?: string
  locator?: string
  chunkIndex: number
  content: string
  embedding: number[]
  meta?: Record<string, unknown>
}

export type SoftRemoveResult = {
  updatedCount: number
  removedAt: string
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`
}

function assertEmbeddingSchema(rows: KbChunkRow[]): void {
  for (const row of rows) {
    if (row.embedding.length !== EMBEDDING_DIM) {
      throw new Error(`embedding dimension mismatch for ${row.chunkId}: ${row.embedding.length} != ${EMBEDDING_DIM}`)
    }
    if (row.embedding.some((value) => !Number.isFinite(value))) {
      throw new Error(`embedding has non-finite values for ${row.chunkId}`)
    }
  }
}

function assertUniqueChunkIds(rows: KbChunkRow[]): void {
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.chunkId)) throw new Error(`duplicate chunk_id in batch: ${row.chunkId}`)
    seen.add(row.chunkId)
  }
}

export async function ensureKbRagHnswIndex(
  client: KbUpsertClient,
  warn: (message: string) => void = console.warn,
): Promise<void> {
  try {
    await client.query(
      `CREATE INDEX IF NOT EXISTS kb_rag_chunks_embedding_hnsw_cosine
       ON kb_rag_chunks USING hnsw (embedding vector_cosine_ops)`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warn(`kb_rag_chunks HNSW index ensure skipped: ${message}`)
  }
}

export async function upsertKbRagChunks(client: KbUpsertClient, rows: KbChunkRow[]): Promise<number> {
  if (rows.length === 0) return 0
  assertUniqueChunkIds(rows)
  assertEmbeddingSchema(rows)

  let upserted = 0
  for (const row of rows) {
    const result = await client.query(
      `INSERT INTO kb_rag_chunks
         (chunk_id, source_id, scope, locator, chunk_index, content, embedding, status, meta)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7::vector, 'ready', $8::jsonb)
       ON CONFLICT (chunk_id) DO UPDATE SET
         source_id = EXCLUDED.source_id,
         scope = EXCLUDED.scope,
         locator = EXCLUDED.locator,
         chunk_index = EXCLUDED.chunk_index,
         content = EXCLUDED.content,
         embedding = EXCLUDED.embedding,
         status = 'ready',
         meta = EXCLUDED.meta`,
      [
        row.chunkId,
        row.sourceId,
        row.scope ?? 'global',
        row.locator ?? '',
        row.chunkIndex,
        row.content,
        toVectorLiteral(row.embedding),
        JSON.stringify(row.meta ?? {}),
      ],
    )
    upserted += result.rowCount ?? 1
  }

  return upserted
}

export async function softRemoveSourceChunks(
  client: KbUpsertClient,
  sourceId: string,
  removedAt: string = new Date().toISOString(),
): Promise<SoftRemoveResult> {
  const result = await client.query(
    `UPDATE kb_rag_chunks
     SET status = 'removed',
         meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{removed_at}', to_jsonb($2::text), true)
     WHERE source_id = $1`,
    [sourceId, removedAt],
  )
  return {
    updatedCount: result.rowCount ?? 0,
    removedAt,
  }
}
