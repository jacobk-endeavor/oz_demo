import path from 'node:path'
import { promises as fs } from 'node:fs'

type JsonRecord = Record<string, unknown>

type JsonRuntimeState<T extends JsonRecord> = {
  path: string
  records: T[]
  mtimeMs: number
  loadedAt: string
}

type TrackCScaffoldDeps = {
  readEnv?: () => Record<string, string>
  stat?: typeof fs.stat
  readFile?: typeof fs.readFile
  poolFactory?: (connectionString: string) => QueryPool
}

type ScopedDbQuery = <T>(sql: string, params: unknown[]) => Promise<{ rows: T[] }>
type QueryPool = { query: ScopedDbQuery }

export type TrackCScaffoldSnapshot = {
  loaded_at: string
  catalog: {
    path: string
    records: number
    mtime_ms: number
  }
  recommendations: {
    path: string
    records: number
    mtime_ms: number
  }
}

const DEFAULT_CATALOG_PATH = path.resolve(process.cwd(), 'calls/product_catalog.json')
const DEFAULT_RECOMMENDATIONS_PATH = path.resolve(process.cwd(), 'calls/recommendations.json')

function normalizePath(value: string | undefined, fallback: string): string {
  const trimmed = String(value ?? '').trim()
  return trimmed ? path.resolve(trimmed) : fallback
}

function emptyJsonState<T extends JsonRecord>(filePath: string): JsonRuntimeState<T> {
  return {
    path: filePath,
    records: [],
    mtimeMs: 0,
    loadedAt: new Date(0).toISOString(),
  }
}

function parseJsonArray<T extends JsonRecord>(raw: string): T[] {
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) return []
  return parsed.filter((item): item is T => item != null && typeof item === 'object')
}

function assertReadOnlySelect(sql: string): void {
  const normalized = sql.trim().toLowerCase()
  if (!normalized.startsWith('select ')) {
    throw new Error('Track C scaffold only permits SELECT statements for read-only Postgres access.')
  }
}

export class TrackCToolScaffold {
  private readonly readEnv: () => Record<string, string>
  private readonly stat: typeof fs.stat
  private readonly readFile: typeof fs.readFile
  private readonly poolFactory?: (connectionString: string) => QueryPool
  private readonly initializedAt = new Date().toISOString()
  private readonly catalogPath: string
  private readonly recommendationsPath: string
  private catalogState: JsonRuntimeState<JsonRecord>
  private recommendationsState: JsonRuntimeState<JsonRecord>
  private pool: QueryPool | null = null
  private inFlightRefresh: Promise<void> | null = null

  constructor(deps: TrackCScaffoldDeps = {}) {
    this.readEnv = deps.readEnv ?? (() => process.env as unknown as Record<string, string>)
    this.stat = deps.stat ?? fs.stat
    this.readFile = deps.readFile ?? fs.readFile
    this.poolFactory = deps.poolFactory

    const env = this.readEnv()
    this.catalogPath = normalizePath(env.OZ_PRODUCT_CATALOG_PATH, DEFAULT_CATALOG_PATH)
    this.recommendationsPath = normalizePath(env.OZ_RECOMMENDATIONS_PATH, DEFAULT_RECOMMENDATIONS_PATH)
    this.catalogState = emptyJsonState(this.catalogPath)
    this.recommendationsState = emptyJsonState(this.recommendationsPath)
  }

  async initialize(): Promise<void> {
    await this.refreshAll()
  }

  async refreshBetweenTurns(): Promise<void> {
    if (this.inFlightRefresh) return this.inFlightRefresh
    this.inFlightRefresh = this.refreshIfChanged().finally(() => {
      this.inFlightRefresh = null
    })
    return this.inFlightRefresh
  }

  getSnapshot(): TrackCScaffoldSnapshot {
    return {
      loaded_at: this.initializedAt,
      catalog: {
        path: this.catalogState.path,
        records: this.catalogState.records.length,
        mtime_ms: this.catalogState.mtimeMs,
      },
      recommendations: {
        path: this.recommendationsState.path,
        records: this.recommendationsState.records.length,
        mtime_ms: this.recommendationsState.mtimeMs,
      },
    }
  }

  readOnlyDbQuery(): ScopedDbQuery | undefined {
    const env = this.readEnv()
    const url = String(env.DATABASE_READONLY_URL || env.DATABASE_URL || '').trim()
    if (!url || !this.poolFactory) return undefined
    const pool = this.getOrCreatePool(url)
    return async <T>(sql: string, params: unknown[]) => {
      assertReadOnlySelect(sql)
      return pool.query<T>(sql, params)
    }
  }

  private getOrCreatePool(connectionString: string): QueryPool {
    if (this.pool) return this.pool
    this.pool = this.poolFactory?.(connectionString) ?? null
    if (!this.pool) throw new Error('Track C scaffold pool factory is required when read-only database URL is set.')
    return this.pool
  }

  private async refreshAll(): Promise<void> {
    this.catalogState = await this.loadJsonState(this.catalogPath, this.catalogState)
    this.recommendationsState = await this.loadJsonState(this.recommendationsPath, this.recommendationsState)
  }

  private async refreshIfChanged(): Promise<void> {
    this.catalogState = await this.reloadIfChanged(this.catalogState)
    this.recommendationsState = await this.reloadIfChanged(this.recommendationsState)
  }

  private async reloadIfChanged<T extends JsonRecord>(current: JsonRuntimeState<T>): Promise<JsonRuntimeState<T>> {
    try {
      const stats = await this.stat(current.path)
      if (!stats.isFile()) return current
      if (stats.mtimeMs <= current.mtimeMs) return current
      return this.loadJsonState(current.path, current)
    } catch {
      return current
    }
  }

  private async loadJsonState<T extends JsonRecord>(
    filePath: string,
    fallback: JsonRuntimeState<T>,
  ): Promise<JsonRuntimeState<T>> {
    try {
      const stats = await this.stat(filePath)
      if (!stats.isFile()) return fallback
      const raw = await this.readFile(filePath, 'utf8')
      const records = parseJsonArray<T>(raw)
      return {
        path: filePath,
        records,
        mtimeMs: stats.mtimeMs,
        loadedAt: new Date().toISOString(),
      }
    } catch {
      return fallback
    }
  }
}
