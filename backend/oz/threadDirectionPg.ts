import pg from 'pg'

import type { OzThreadDirectionRow, SanitizedOzThreadDirectionPut } from './threadDirectionNormalize'

type DbQuery = (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>

function mapRow(row: Record<string, unknown>): OzThreadDirectionRow {
  const setAt = row.set_at
  return {
    thread_id: String(row.thread_id ?? ''),
    tenant: String(row.tenant ?? ''),
    direction_text: String(row.direction_text ?? ''),
    structured_refs: row.structured_refs,
    set_at: setAt instanceof Date ? setAt.toISOString() : String(setAt ?? ''),
    set_by: row.set_by == null ? null : String(row.set_by),
  }
}

function buildPoolSsl(connectionString: string): undefined | { rejectUnauthorized: boolean } {
  const wantsTls = /sslmode=(require|verify-ca|verify-full)/i.test(connectionString)
  if (!wantsTls) return undefined
  if (process.env.PGSSL_REJECT_UNAUTHORIZED === '1') return { rejectUnauthorized: true }
  return { rejectUnauthorized: false }
}

function resolveWriteDatabaseUrl(readEnv: () => Record<string, string>): string | undefined {
  const env = readEnv()
  const url = String(process.env.DATABASE_URL || env.DATABASE_URL || '').trim()
  return url || undefined
}

let pooledClient: { pool: pg.Pool; query: DbQuery } | null | 'missing' = null

export function resetOzThreadDirectionPoolForTests(): void {
  pooledClient = null
}

/** Lazily opens a pool against DATABASE_URL (primary — required for upserts). */
export function getOzThreadDirectionDb(
  readEnv: () => Record<string, string>,
): { query: DbQuery } | null {
  if (pooledClient === 'missing') return null
  if (pooledClient) return pooledClient

  const url = resolveWriteDatabaseUrl(readEnv)
  if (!url) {
    pooledClient = 'missing'
    return null
  }

  const pool = new pg.Pool({
    connectionString: url,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    application_name: 'oz-thread-direction',
    ssl: buildPoolSsl(url),
  })

  const query: DbQuery = (sql, params) => pool.query(sql, params)
  pooledClient = { pool, query }
  return pooledClient
}

export async function fetchOzThreadDirection(
  db: { query: DbQuery },
  threadId: string,
  tenant: string,
): Promise<OzThreadDirectionRow | null> {
  const res = await db.query(
    `SELECT thread_id, tenant, direction_text, structured_refs, set_at, set_by
       FROM oz_thread_direction
      WHERE thread_id = $1 AND tenant = $2
      LIMIT 1`,
    [threadId, tenant],
  )
  if (!res.rows.length) return null
  return mapRow(res.rows[0] as Record<string, unknown>)
}

export async function upsertOzThreadDirection(
  db: { query: DbQuery },
  threadId: string,
  tenant: string,
  sanitized: SanitizedOzThreadDirectionPut,
): Promise<OzThreadDirectionRow> {
  const structuredJson = JSON.stringify(sanitized.structured_refs)
  const res = await db.query(
    `INSERT INTO oz_thread_direction (thread_id, tenant, direction_text, structured_refs, set_at, set_by)
     VALUES ($1, $2, $3, $4::jsonb, now(), $5)
     ON CONFLICT (thread_id, tenant) DO UPDATE SET
       direction_text = EXCLUDED.direction_text,
       structured_refs = EXCLUDED.structured_refs,
       set_at = now(),
       set_by = EXCLUDED.set_by
     RETURNING thread_id, tenant, direction_text, structured_refs, set_at, set_by`,
    [threadId, tenant, sanitized.direction_text, structuredJson, sanitized.set_by],
  )
  return mapRow(res.rows[0] as Record<string, unknown>)
}
