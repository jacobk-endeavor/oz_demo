import { describe, expect, it, vi } from 'vitest'
import { runKbSearch } from '../../../../backend/oz/kbSearchRag'

describe('runKbSearch', () => {
  it('queries kb_rag_chunks only when surface is kb', async () => {
    const dbQuery = vi.fn(async (sql: string) => {
      if (sql.includes('FROM kb_rag_chunks')) {
        return {
          rows: [
            {
              chunk_id: 'ckb1',
              source_id: 'src1',
              locator: 'p1',
              content: 'kb content',
              dist: 0.12,
            },
          ],
        }
      }
      throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`)
    })

    const hits = await runKbSearch(
      {
        dbQuery: dbQuery as never,
        embedQuery: async () => new Array(3).fill(0),
      },
      { query: 'decking', surface: 'kb', k: 4 },
    )

    expect(hits).toHaveLength(1)
    expect(hits[0]?.chunk_id).toBe('ckb1')
    expect(hits[0]?.surface).toBe('kb')
    expect(dbQuery).toHaveBeenCalledTimes(1)
  })

  it('merges global results sorted by distance', async () => {
    const dbQuery = vi.fn(async (sql: string) => {
      if (sql.includes('FROM kb_rag_chunks')) {
        return {
          rows: [{ chunk_id: 'k1', source_id: 's', locator: '', content: 'a', dist: 0.5 }],
        }
      }
      if (sql.includes('FROM call_rag_chunks')) {
        return {
          rows: [{ chunk_id: 'c1', call_id: 'call_1', chunk_index: 2, content: 'b', dist: 0.2 }],
        }
      }
      return { rows: [] }
    })

    const hits = await runKbSearch(
      {
        dbQuery: dbQuery as never,
        embedQuery: async () => new Array(3).fill(0),
      },
      { query: 'x', surface: 'global', k: 2 },
    )

    expect(hits.map((h) => h.chunk_id)).toEqual(['c1', 'k1'])
    expect(hits[0]?.surface).toBe('call')
  })

  it('rejects invalid call_scope when whitelist is enforced', async () => {
    await expect(
      runKbSearch(
        {
          dbQuery: vi.fn(async () => ({ rows: [] })) as never,
          embedQuery: async () => [0],
        },
        {
          query: 'x',
          surface: 'call',
          call_scope: 'NotARep',
          validRepIds: ['Jacob'],
        },
      ),
    ).rejects.toThrow(/call_scope/)
  })
})
