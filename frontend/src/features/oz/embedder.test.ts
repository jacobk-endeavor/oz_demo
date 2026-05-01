import { describe, expect, it } from 'vitest'
import { embedSourceChunks, EMBEDDING_DIM, EMBEDDING_MODEL } from './embedder'
import { SourceRegistry } from './sourceRegistry'

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function makeRegistry(status: 'extracting' | 'embedding' | 'ready' = 'extracting') {
  const registry = new SourceRegistry()
  const created = registry.register({
    path: 'raw/sample.txt',
    sha256: SHA,
    mime: 'text/plain',
    status: 'pending',
  })
  if (status === 'extracting') registry.setStatus(created.record.sourceId, 'extracting')
  if (status === 'embedding') {
    registry.setStatus(created.record.sourceId, 'extracting')
    registry.setStatus(created.record.sourceId, 'embedding')
  }
  if (status === 'ready') {
    registry.setStatus(created.record.sourceId, 'extracting')
    registry.setStatus(created.record.sourceId, 'embedding')
    registry.setStatus(created.record.sourceId, 'ready')
  }
  return { registry, sourceId: created.record.sourceId }
}

describe('embedSourceChunks', () => {
  it('embeds in batches and tracks model/dimension/cost metadata', async () => {
    const { registry, sourceId } = makeRegistry('extracting')
    const chunks = ['alpha', 'beta', 'gamma']
    const calls: string[][] = []

    const result = await embedSourceChunks({
      sourceId,
      chunks,
      registry,
      batchSize: 2,
      provider: async ({ model, inputs, dimensions }) => {
        expect(model).toBe(EMBEDDING_MODEL)
        expect(dimensions).toBe(EMBEDDING_DIM)
        calls.push(inputs)
        return {
          vectors: inputs.map((_, index) => Array.from({ length: EMBEDDING_DIM }, () => index + 1)),
          tokenCount: 50,
        }
      },
    })

    expect(calls).toEqual([['alpha', 'beta'], ['gamma']])
    expect(result.embeddedCount).toBe(3)
    expect(result.tokenCount).toBe(100)
    expect(result.estimatedCostUsd).toBe(0.000002)

    const source = registry.getBySourceId(sourceId)
    expect(source?.status).toBe('embedding')
    expect(source?.meta.embedding).toMatchObject({
      completed: 3,
      total: 3,
      batch_size: 2,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIM,
      token_count: 100,
      estimated_cost_usd: 0.000002,
    })
  })

  it('resumes from stored completed offset', async () => {
    const { registry, sourceId } = makeRegistry('embedding')
    registry.patchMeta(sourceId, { embedding: { completed: 2 } })
    const seen: string[][] = []
    const chunks = ['one', 'two', 'three', 'four']

    const result = await embedSourceChunks({
      sourceId,
      chunks,
      registry,
      provider: async ({ inputs }) => {
        seen.push(inputs)
        return {
          vectors: inputs.map(() => Array.from({ length: EMBEDDING_DIM }, () => 1)),
        }
      },
    })

    expect(seen).toEqual([['three', 'four']])
    expect(result.embeddedCount).toBe(2)
    const source = registry.getBySourceId(sourceId)
    expect(source?.meta.embedding).toMatchObject({
      completed: 4,
      total: 4,
    })
  })

  it('allows re-embed from ready status', async () => {
    const { registry, sourceId } = makeRegistry('ready')
    await embedSourceChunks({
      sourceId,
      chunks: ['reembed'],
      registry,
      provider: async ({ inputs }) => ({
        vectors: inputs.map(() => Array.from({ length: EMBEDDING_DIM }, () => 0.5)),
      }),
    })
    expect(registry.getBySourceId(sourceId)?.status).toBe('embedding')
  })
})
