import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  insertOzArtifactRow,
  resolveOzArtifactRead,
  runOzArtifactRepairJob,
  fetchOzArtifactById,
} from '../../../../backend/oz/artifactRegistry'

type DbQuery = (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>

function makeDb(calls: DbQuery): { query: DbQuery } {
  return { query: calls }
}

describe('artifactRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('insertOzArtifactRow inserts active row', async () => {
    const query = vi.fn(async (_sql: string, params: unknown[]) => ({
      rows: [
        {
          id: params[0],
          tenant: params[1],
          kind: params[2],
          title: params[3],
          key: params[4],
          sha256: params[5],
          bytes: params[6],
          status: 'active',
          created_at: new Date('2026-05-01T00:00:00.000Z'),
          ttl_at: params[7],
        },
      ],
    }))
    const row = await insertOzArtifactRow(makeDb(query), {
      id: '550e8400-e29b-41d4-a716-446655440000',
      tenant: 'acme',
      kind: 'png',
      title: 'Chart',
      key: 'acme/20260501/550e8400-e29b-41d4-a716-446655440000.png',
      sha256: 'abc',
      bytes: 12,
    })
    expect(row.status).toBe('active')
    expect(row.key).toContain('550e8400')
    expect(query).toHaveBeenCalled()
  })

  it('resolveOzArtifactRead returns not_found when row missing', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const spaces = { headObjectExists: vi.fn() }
    const r = await resolveOzArtifactRead(makeDb(query), spaces, '550e8400-e29b-41d4-a716-446655440000', 'acme')
    expect(r.outcome).toBe('not_found')
    expect(spaces.headObjectExists).not.toHaveBeenCalled()
  })

  it('resolveOzArtifactRead returns gone for tombstone without HEAD', async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          tenant: 'acme',
          kind: 'png',
          title: '',
          key: 'k',
          sha256: 'x',
          bytes: 1,
          status: 'tombstone',
          created_at: new Date(),
          ttl_at: null,
        },
      ],
    }))
    const spaces = { headObjectExists: vi.fn() }
    const r = await resolveOzArtifactRead(makeDb(query), spaces, '550e8400-e29b-41d4-a716-446655440000', 'acme')
    expect(r.outcome).toBe('gone')
    expect(spaces.headObjectExists).not.toHaveBeenCalled()
  })

  it('resolveOzArtifactRead marks lost and returns gone when Spaces misses', async () => {
    let selectPass = 0
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('UPDATE') && sql.includes("SET status = 'lost'")) {
        return { rows: [] }
      }
      if (sql.includes('SELECT') && sql.includes('FROM oz_artifacts')) {
        selectPass += 1
        const status = selectPass === 1 ? 'active' : 'lost'
        return {
          rows: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              tenant: 'acme',
              kind: 'png',
              title: '',
              key: 'acme/20260501/x.png',
              sha256: 'x',
              bytes: 1,
              status,
              created_at: new Date(),
              ttl_at: null,
            },
          ],
        }
      }
      return { rows: [] }
    })
    const spaces = { headObjectExists: vi.fn().mockResolvedValue(false) }
    const r = await resolveOzArtifactRead(makeDb(query), spaces, '550e8400-e29b-41d4-a716-446655440000', 'acme')
    expect(r.outcome).toBe('gone')
    if (r.outcome === 'gone') expect(r.row.status).toBe('lost')
    expect(spaces.headObjectExists).toHaveBeenCalledWith('acme/20260501/x.png')
  })

  it('runOzArtifactRepairJob tombstones when HEAD fails', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id, key')) {
        return {
          rows: [{ id: '550e8400-e29b-41d4-a716-446655440000', key: 'miss', status: 'active' }],
        }
      }
      if (sql.includes("SET status = 'tombstone'")) {
        return { rows: [{ id: '550e8400-e29b-41d4-a716-446655440000' }] }
      }
      return { rows: [] }
    })
    const spaces = { headObjectExists: vi.fn().mockResolvedValue(false) }
    const r = await runOzArtifactRepairJob(makeDb(query), spaces, { lookbackDays: 7 })
    expect(r.scanned).toBe(1)
    expect(r.tombstoned).toBe(1)
    expect(spaces.headObjectExists).toHaveBeenCalledWith('miss')
  })

  it('fetchOzArtifactById maps bigint bytes', async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          tenant: 'acme',
          kind: 'pdf',
          title: 't',
          key: 'k',
          sha256: 's',
          bytes: BigInt(9007199254740993),
          status: 'active',
          created_at: new Date('2026-05-01T00:00:00.000Z'),
          ttl_at: null,
        },
      ],
    }))
    const row = await fetchOzArtifactById(makeDb(query), '550e8400-e29b-41d4-a716-446655440000', 'acme')
    expect(row?.bytes).toBe(9007199254740993)
  })
})
