/**
 * Postgres registry for chat artifacts: `oz_artifacts` metadata + read/repair behavior
 * (§6.1, §11.4, §12.2.4). Write order: upload to Spaces first, then insert a row here.
 */
import pg from 'pg'
import type { SpacesArtifactClient } from './artifactStorage'

type DbQuery = (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>

export type OzArtifactStatus = 'active' | 'lost' | 'tombstone'

export type OzArtifactRow = {
  id: string
  tenant: string
  kind: string
  title: string
  key: string
  sha256: string
  bytes: number
  status: OzArtifactStatus
  created_at: string
  ttl_at: string | null
}

export type InsertOzArtifactInput = {
  id: string
  tenant: string
  kind: string
  title: string
  key: string
  sha256: string
  bytes: number
  ttlAt?: Date | null
}

export type ResolveOzArtifactReadOutcome =
  | { outcome: 'not_found' }
  | { outcome: 'gone'; row: OzArtifactRow }
  | { outcome: 'ok'; row: OzArtifactRow }

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

export function resetOzArtifactsPoolForTests(): void {
  pooledClient = null
}

/** Lazily opens a pool against DATABASE_URL (required for inserts / updates / repair). */
export function getOzArtifactsDb(readEnv: () => Record<string, string>): { query: DbQuery } | null {
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
    application_name: 'oz-artifacts',
    ssl: buildPoolSsl(url),
  })

  const query: DbQuery = (sql, params) => pool.query(sql, params)
  pooledClient = { pool, query }
  return pooledClient
}

function mapRow(row: Record<string, unknown>): OzArtifactRow {
  const bytes = row.bytes
  const createdAt = row.created_at
  const ttlAt = row.ttl_at
  return {
    id: String(row.id ?? ''),
    tenant: String(row.tenant ?? ''),
    kind: String(row.kind ?? ''),
    title: String(row.title ?? ''),
    key: String(row.key ?? ''),
    sha256: String(row.sha256 ?? ''),
    bytes: typeof bytes === 'bigint' ? Number(bytes) : Number(bytes ?? 0),
    status: row.status as OzArtifactStatus,
    created_at: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt ?? ''),
    ttl_at: ttlAt instanceof Date ? ttlAt.toISOString() : ttlAt == null ? null : String(ttlAt),
  }
}

/** Insert after a successful Spaces PutObject (write order: storage then DB). */
export async function insertOzArtifactRow(db: { query: DbQuery }, input: InsertOzArtifactInput): Promise<OzArtifactRow> {
  const res = await db.query(
    `INSERT INTO oz_artifacts (id, tenant, kind, title, key, sha256, bytes, status, ttl_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'active', $8)
     RETURNING id, tenant, kind, title, key, sha256, bytes, status, created_at, ttl_at`,
    [
      input.id,
      input.tenant,
      input.kind,
      input.title,
      input.key,
      input.sha256,
      input.bytes,
      input.ttlAt ?? null,
    ],
  )
  return mapRow(res.rows[0] as Record<string, unknown>)
}

export async function fetchOzArtifactById(
  db: { query: DbQuery },
  id: string,
  tenant: string,
): Promise<OzArtifactRow | null> {
  const res = await db.query(
    `SELECT id, tenant, kind, title, key, sha256, bytes, status, created_at, ttl_at
       FROM oz_artifacts
      WHERE id = $1::uuid AND tenant = $2
      LIMIT 1`,
    [id, tenant],
  )
  if (!res.rows.length) return null
  return mapRow(res.rows[0] as Record<string, unknown>)
}

export async function markOzArtifactLost(db: { query: DbQuery }, id: string, tenant: string): Promise<void> {
  await db.query(
    `UPDATE oz_artifacts
        SET status = 'lost'
      WHERE id = $1::uuid AND tenant = $2 AND status = 'active'`,
    [id, tenant],
  )
}

/**
 * Read path: DB miss → not_found; DB hit with lost/tombstone → gone; active + Spaces miss → mark lost + gone;
 * active + Spaces hit → ok.
 */
export async function resolveOzArtifactRead(
  db: { query: DbQuery },
  spaces: Pick<SpacesArtifactClient, 'headObjectExists'>,
  id: string,
  tenant: string,
): Promise<ResolveOzArtifactReadOutcome> {
  const row = await fetchOzArtifactById(db, id, tenant)
  if (!row) return { outcome: 'not_found' }
  if (row.status === 'lost' || row.status === 'tombstone') return { outcome: 'gone', row }

  const exists = await spaces.headObjectExists(row.key)
  if (!exists) {
    await markOzArtifactLost(db, id, tenant)
    const updated = await fetchOzArtifactById(db, id, tenant)
    return { outcome: 'gone', row: updated ?? { ...row, status: 'lost' } }
  }
  return { outcome: 'ok', row }
}

export type OzArtifactRepairResult = {
  scanned: number
  tombstoned: number
}

/**
 * Maintenance: HEAD Spaces for artifacts created in the last `lookbackDays` that are still active or lost;
 * missing objects → status tombstone (no retroactive recovery).
 */
export async function runOzArtifactRepairJob(
  db: { query: DbQuery },
  spaces: Pick<SpacesArtifactClient, 'headObjectExists'>,
  options?: { lookbackDays?: number },
): Promise<OzArtifactRepairResult> {
  const days = options?.lookbackDays ?? 7
  const list = await db.query(
    `SELECT id, key, status
       FROM oz_artifacts
      WHERE created_at >= now() - ($1::int * interval '1 day')
        AND status IN ('active', 'lost')`,
    [days],
  )

  let tombstoned = 0
  for (const raw of list.rows) {
    const row = raw as Record<string, unknown>
    const id = String(row.id ?? '')
    const key = String(row.key ?? '')
    const exists = await spaces.headObjectExists(key)
    if (exists) continue

    const upd = await db.query(
      `UPDATE oz_artifacts
          SET status = 'tombstone'
        WHERE id = $1::uuid
          AND status IN ('active', 'lost')
        RETURNING id`,
      [id],
    )
    if (upd.rows.length) tombstoned += 1
  }

  return { scanned: list.rows.length, tombstoned }
}
