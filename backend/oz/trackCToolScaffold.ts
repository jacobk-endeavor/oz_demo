import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  embedOpenAiText,
  OZ_DEMO_CALL_REP_IDS,
  runKbSearch,
  type KbSearchHit,
  type KbSearchSurface,
} from './kbSearchRag'

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
  fetchImpl?: typeof fetch
}

type ScopedDbQuery = <T>(sql: string, params: unknown[]) => Promise<{ rows: T[] }>
type QueryPool = { query: ScopedDbQuery }

export type CatalogGetResult = {
  sku: string
  found: boolean
  record: JsonRecord | null
  citation: string
}

export type CatalogListArgs = {
  product_line?: string
  sub_category?: string
  brand?: string
  min_sales?: number
  sort_by?: string
  top_n?: number
}

export type CatalogListResult = {
  filters: {
    product_line?: string
    sub_category?: string
    brand?: string
    min_sales?: number
    sort_by?: string
    top_n: number
  }
  total: number
  rows: Array<{ record: JsonRecord; citation: string }>
}

export type WikiReadResult = {
  path: string
  found: boolean
  content: string
  citation: string
}

export type WikiGrepResult = {
  query: string
  total: number
  hits: Array<{
    path: string
    snippet: string
    citation: string
  }>
}

export type KbSearchToolResult = {
  query: string
  surface: KbSearchSurface
  chunks: KbSearchHit[]
  provenance: { source: 'postgres' | 'stub'; retrieval: 'semantic_vector' | 'none' }
}

export type WikiLogResult = {
  filters: {
    kind?: string
    since?: string
    until?: string
    top_n: number
  }
  total: number
  entries: Array<{
    timestamp: string
    kind: string
    line: string
    citation: string
  }>
}

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
const DEFAULT_WIKI_ROOT = path.resolve(process.cwd(), 'wiki')

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
  private readonly fetchImpl: typeof fetch
  private readonly initializedAt = new Date().toISOString()
  private readonly catalogPath: string
  private readonly recommendationsPath: string
  private readonly wikiRoot: string
  private catalogState: JsonRuntimeState<JsonRecord>
  private recommendationsState: JsonRuntimeState<JsonRecord>
  private pool: QueryPool | null = null
  private inFlightRefresh: Promise<void> | null = null
  private catalogBySku: Map<string, JsonRecord> = new Map()

  constructor(deps: TrackCScaffoldDeps = {}) {
    this.readEnv = deps.readEnv ?? (() => process.env as unknown as Record<string, string>)
    this.stat = deps.stat ?? fs.stat
    this.readFile = deps.readFile ?? fs.readFile
    this.poolFactory = deps.poolFactory
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch

    const env = this.readEnv()
    this.catalogPath = normalizePath(env.OZ_PRODUCT_CATALOG_PATH, DEFAULT_CATALOG_PATH)
    this.recommendationsPath = normalizePath(env.OZ_RECOMMENDATIONS_PATH, DEFAULT_RECOMMENDATIONS_PATH)
    this.wikiRoot = normalizePath(env.OZ_WIKI_ROOT_PATH, DEFAULT_WIKI_ROOT)
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

  catalog_get(sku: string): CatalogGetResult {
    const normalizedSku = String(sku ?? '').trim().toUpperCase()
    if (!normalizedSku) {
      return { sku: normalizedSku, found: false, record: null, citation: '[catalog:sku=]' }
    }
    const record = this.catalogBySku.get(normalizedSku) ?? null
    return {
      sku: normalizedSku,
      found: Boolean(record),
      record,
      citation: `[catalog:sku=${normalizedSku}]`,
    }
  }

  catalog_list(args: CatalogListArgs = {}): CatalogListResult {
    const productLine = normalizedFilter(args.product_line)
    const subCategory = normalizedFilter(args.sub_category)
    const brand = normalizedFilter(args.brand)
    const minSales = Number.isFinite(Number(args.min_sales)) ? Number(args.min_sales) : undefined
    const sortBy = normalizedFilter(args.sort_by)
    const topN = Math.max(1, Math.min(200, Math.trunc(Number(args.top_n) || 25)))

    const filtered = this.catalogState.records.filter((record) => {
      if (productLine && normalizedFilter(readText(record, ['product_line', 'productLine', 'line_code'])) !== productLine) {
        return false
      }
      if (subCategory && normalizedFilter(readText(record, ['sub_category', 'subCategory'])) !== subCategory) {
        return false
      }
      if (brand && normalizedFilter(readText(record, ['brand'])) !== brand) {
        return false
      }
      if (minSales != null) {
        const sales = readNumber(record, ['sales', 'sales_total', 'total_sales'])
        if (sales == null || sales < minSales) return false
      }
      return true
    })

    const sorted = [...filtered]
    if (sortBy) {
      sorted.sort((a, b) => {
        const av = readNumber(a, [sortBy])
        const bv = readNumber(b, [sortBy])
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        return bv - av
      })
    }

    return {
      filters: {
        product_line: productLine,
        sub_category: subCategory,
        brand,
        min_sales: minSales,
        sort_by: sortBy,
        top_n: topN,
      },
      total: sorted.length,
      rows: sorted.slice(0, topN).map((record) => {
        const sku = String(readText(record, ['sku', 'item_sku', 'product_sku']) ?? '').trim().toUpperCase()
        return {
          record,
          citation: sku ? `[catalog:sku=${sku}]` : '[catalog:row]',
        }
      }),
    }
  }

  async wiki_read(pagePath: string): Promise<WikiReadResult> {
    const safePath = this.safeWikiPath(pagePath)
    if (!safePath) return { path: String(pagePath ?? ''), found: false, content: '', citation: '[wiki:invalid-path]' }
    try {
      const content = await this.readFile(safePath, 'utf8')
      return {
        path: toRelativeWikiPath(this.wikiRoot, safePath),
        found: true,
        content,
        citation: `[wiki:${toRelativeWikiPath(this.wikiRoot, safePath)}]`,
      }
    } catch {
      return {
        path: toRelativeWikiPath(this.wikiRoot, safePath),
        found: false,
        content: '',
        citation: `[wiki:${toRelativeWikiPath(this.wikiRoot, safePath)}]`,
      }
    }
  }

  async wiki_grep(query: string, topN = 8): Promise<WikiGrepResult> {
    const trimmed = String(query ?? '').trim()
    if (!trimmed) return { query: trimmed, total: 0, hits: [] }
    const files = await listMarkdownFiles(this.wikiRoot)
    const lowered = trimmed.toLowerCase()
    const hits: WikiGrepResult['hits'] = []
    for (const filePath of files) {
      const content = await this.readFile(filePath, 'utf8').catch(() => '')
      const lines = content.split('\n')
      const line = lines.find((item) => item.toLowerCase().includes(lowered))
      if (!line) continue
      const rel = toRelativeWikiPath(this.wikiRoot, filePath)
      hits.push({
        path: rel,
        snippet: line.trim(),
        citation: `[wiki:${rel}]`,
      })
      if (hits.length >= Math.max(1, Math.min(50, Math.trunc(topN) || 8))) break
    }
    return { query: trimmed, total: hits.length, hits }
  }

  async wiki_log(args: { kind?: string; since?: string; until?: string; top_n?: number } = {}): Promise<WikiLogResult> {
    const topN = Math.max(1, Math.min(100, Math.trunc(Number(args.top_n) || 25)))
    const kind = normalizedFilter(args.kind)
    const sinceMs = args.since ? Date.parse(args.since) : NaN
    const untilMs = args.until ? Date.parse(args.until) : NaN
    const logPath = path.join(this.wikiRoot, 'log.md')
    const content = await this.readFile(logPath, 'utf8').catch(() => '')
    const entries = content
      .split('\n')
      .filter((line) => line.startsWith('## ['))
      .map((line) => parseWikiLogHeading(line))
      .filter((entry): entry is { timestamp: string; kind: string; line: string } => Boolean(entry))
      .filter((entry) => {
        if (kind && entry.kind !== kind) return false
        const ts = Date.parse(entry.timestamp)
        if (Number.isFinite(sinceMs) && Number.isFinite(ts) && ts < sinceMs) return false
        if (Number.isFinite(untilMs) && Number.isFinite(ts) && ts > untilMs) return false
        return true
      })
      .slice(0, topN)
      .map((entry) => ({ ...entry, citation: '[wiki:log.md]' }))
    return {
      filters: { kind, since: args.since, until: args.until, top_n: topN },
      total: entries.length,
      entries,
    }
  }

  async kb_search(args: {
    query: string
    surface?: KbSearchSurface
    k?: number
    kind?: string
    call_scope?: string
  }): Promise<KbSearchToolResult> {
    const query = String(args.query ?? '').trim()
    const surface: KbSearchSurface =
      args.surface === 'kb' || args.surface === 'call' || args.surface === 'global' ? args.surface : 'global'
    if (!query) {
      return {
        query,
        surface,
        chunks: [],
        provenance: { source: 'stub', retrieval: 'none' },
      }
    }

    const dbQuery = this.readOnlyDbQuery()
    const env = this.readEnv()
    const apiKey = (
      process.env.OPENAI_API_KEY ||
      env.OPENAI_API_KEY ||
      env.VITE_OPENAI_API_KEY ||
      ''
    ).trim()
    const embeddingModel = (env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small').trim()

    if (!dbQuery || !apiKey) {
      return {
        query,
        surface,
        chunks: [],
        provenance: { source: 'stub', retrieval: 'none' },
      }
    }

    const chunks = await runKbSearch(
      {
        dbQuery,
        embedQuery: (text) =>
          embedOpenAiText({
            apiKey,
            model: embeddingModel,
            text,
            fetchImpl: this.fetchImpl,
          }),
      },
      {
        query,
        surface,
        k: args.k,
        kind: args.kind,
        call_scope: args.call_scope,
        validRepIds: OZ_DEMO_CALL_REP_IDS,
      },
    )

    return {
      query,
      surface,
      chunks,
      provenance: { source: 'postgres', retrieval: 'semantic_vector' },
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
    this.rebuildCatalogIndex()
  }

  private async refreshIfChanged(): Promise<void> {
    this.catalogState = await this.reloadIfChanged(this.catalogState)
    this.recommendationsState = await this.reloadIfChanged(this.recommendationsState)
    this.rebuildCatalogIndex()
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

  private rebuildCatalogIndex(): void {
    this.catalogBySku = new Map()
    for (const record of this.catalogState.records) {
      const sku = String(readText(record, ['sku', 'item_sku', 'product_sku']) ?? '').trim().toUpperCase()
      if (!sku) continue
      this.catalogBySku.set(sku, record)
    }
  }

  private safeWikiPath(input: string): string | null {
    const trimmed = String(input ?? '').trim()
    if (!trimmed || trimmed.includes('..') || path.isAbsolute(trimmed)) return null
    const candidate = path.resolve(this.wikiRoot, trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`)
    if (!candidate.startsWith(`${this.wikiRoot}${path.sep}`)) return null
    return candidate
  }
}

function readText(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

function readNumber(record: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = Number(record[key])
    if (Number.isFinite(value)) return value
  }
  return undefined
}

function normalizedFilter(value: unknown): string | undefined {
  const text = String(value ?? '').trim().toLowerCase()
  return text || undefined
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = []
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(fullPath)
      }
    }
  }
  return out
}

function toRelativeWikiPath(root: string, filePath: string): string {
  return path.relative(root, filePath).replaceAll(path.sep, '/')
}

function parseWikiLogHeading(line: string): { timestamp: string; kind: string; line: string } | null {
  const match = line.match(/^## \[(.+?)\]\s+([a-zA-Z0-9_-]+)/)
  if (!match) return null
  return { timestamp: match[1], kind: match[2].toLowerCase(), line }
}
