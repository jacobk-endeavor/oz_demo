import { describe, expect, it } from 'vitest'
import { EMBEDDING_DIM } from './embedder'
import { ensureKbRagHnswIndex, softRemoveSourceChunks, upsertKbRagChunks, type KbUpsertClient } from './upserter'

function makeVector(value: number): number[] {
  return Array.from({ length: EMBEDDING_DIM }, () => value)
}

describe('upserter', () => {
  it('upserts rows with ON CONFLICT and ready status', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const client: KbUpsertClient = {
      query: async (sql, params) => {
        calls.push({ sql, params })
        return { rowCount: 1 }
      },
    }
    const upserted = await upsertKbRagChunks(client, [
      {
        chunkId: 'abc_00001',
        sourceId: 'abcdef123456',
        chunkIndex: 0,
        locator: 'page=1',
        content: 'chunk one',
        embedding: makeVector(0.25),
      },
    ])
    expect(upserted).toBe(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.sql).toContain('ON CONFLICT (chunk_id) DO UPDATE')
    expect(calls[0]?.params?.[6]).toMatch(/^\[[0-9.,-]+\]$/)
  })

  it('fails before write when embedding dimensions mismatch', async () => {
    const client: KbUpsertClient = {
      query: async () => ({ rowCount: 1 }),
    }
    await expect(
      upsertKbRagChunks(client, [
        {
          chunkId: 'bad_dim',
          sourceId: 'abcdef123456',
          chunkIndex: 0,
          content: 'x',
          embedding: [1, 2, 3],
        },
      ]),
    ).rejects.toThrow('embedding dimension mismatch')
  })

  it('soft-removes chunks by source with removed_at metadata', async () => {
    let queryArgs: { sql: string; params?: unknown[] } | null = null
    const client: KbUpsertClient = {
      query: async (sql: string, params?: unknown[]) => {
        queryArgs = { sql, params }
        return { rowCount: 3 }
      },
    }
    const out = await softRemoveSourceChunks(client, 'abcdef123456', '2026-05-01T20:00:00Z')
    expect(out).toEqual({ updatedCount: 3, removedAt: '2026-05-01T20:00:00Z' })
    expect(queryArgs).not.toBeNull()
    expect(queryArgs!.sql).toContain("status = 'removed'")
    expect(queryArgs!.sql).toContain("jsonb_set(COALESCE(meta, '{}'::jsonb), '{removed_at}'")
  })

  it('warns non-fatally if HNSW index creation fails', async () => {
    const warnings: string[] = []
    const client: KbUpsertClient = {
      query: async () => {
        throw new Error('permission denied')
      },
    }
    await ensureKbRagHnswIndex(client, (message) => warnings.push(message))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('permission denied')
  })
})
