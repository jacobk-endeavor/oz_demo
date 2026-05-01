import type { SourceRegistry } from './sourceRegistry'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIM = 1536
export const DEFAULT_EMBED_BATCH_SIZE = 64
export const EMBEDDING_PRICE_USD_PER_1K_TOKENS = 0.00002

export type EmbeddingVector = number[]

export type EmbedBatchResult = {
  vectors: EmbeddingVector[]
  tokenCount?: number
}

export type EmbedBatchProvider = (input: {
  model: string
  inputs: string[]
  dimensions: number
}) => Promise<EmbedBatchResult>

export type EmbedSourceChunksInput = {
  sourceId: string
  chunks: string[]
  registry: SourceRegistry
  provider: EmbedBatchProvider
  batchSize?: number
}

export type EmbedSourceChunksResult = {
  model: string
  dimensions: number
  batchSize: number
  vectors: EmbeddingVector[]
  embeddedCount: number
  tokenCount: number
  estimatedCostUsd: number
}

function estimateTokensFromText(text: string): number {
  // Lightweight fallback estimate when provider does not return usage.
  return Math.max(1, Math.ceil(text.length / 4))
}

function asEmbeddingMeta(value: unknown): { completed?: number } {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as { completed?: number }
}

export async function embedSourceChunks(input: EmbedSourceChunksInput): Promise<EmbedSourceChunksResult> {
  const batchSize = input.batchSize ?? DEFAULT_EMBED_BATCH_SIZE
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('batchSize must be a positive integer')
  }

  const source = input.registry.getBySourceId(input.sourceId)
  if (source == null) throw new Error(`source not found: ${input.sourceId}`)
  if (source.status === 'extracting' || source.status === 'ready') {
    input.registry.setStatus(input.sourceId, 'embedding')
  } else if (source.status !== 'embedding') {
    throw new Error(`cannot start embedding from status: ${source.status}`)
  }

  const embeddingMeta = asEmbeddingMeta(source.meta.embedding)
  const resumeOffset = Math.max(0, Math.min(input.chunks.length, embeddingMeta.completed ?? 0))
  const vectors: EmbeddingVector[] = []
  let tokenCount = 0
  let completed = resumeOffset

  for (let start = resumeOffset; start < input.chunks.length; start += batchSize) {
    const batch = input.chunks.slice(start, start + batchSize)
    const result = await input.provider({
      model: EMBEDDING_MODEL,
      inputs: batch,
      dimensions: EMBEDDING_DIM,
    })
    if (result.vectors.length !== batch.length) {
      throw new Error(`embedding provider returned ${result.vectors.length} vectors for ${batch.length} inputs`)
    }
    vectors.push(...result.vectors)
    tokenCount += result.tokenCount ?? batch.reduce((sum, chunk) => sum + estimateTokensFromText(chunk), 0)
    completed += batch.length
    input.registry.patchMeta(input.sourceId, {
      embedding: {
        completed,
        total: input.chunks.length,
        batch_size: batchSize,
      },
    })
  }

  const estimatedCostUsd = Number(((tokenCount / 1000) * EMBEDDING_PRICE_USD_PER_1K_TOKENS).toFixed(6))
  input.registry.patchMeta(input.sourceId, {
    embedding: {
      completed: input.chunks.length,
      total: input.chunks.length,
      batch_size: batchSize,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIM,
      token_count: tokenCount,
      estimated_cost_usd: estimatedCostUsd,
    },
  })

  return {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIM,
    batchSize,
    vectors,
    embeddedCount: vectors.length,
    tokenCount,
    estimatedCostUsd,
  }
}
