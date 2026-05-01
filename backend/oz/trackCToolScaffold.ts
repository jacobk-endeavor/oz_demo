import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  embedOpenAiText,
  OZ_DEMO_CALL_REP_IDS,
  runKbSearch,
  type KbSearchHit,
  type KbSearchSurface,
} from './kbSearchRag'
import { extractCitations } from './citationGrammarResolver'
import { groupRecommendationsByRuleKey, recommendationCitation } from './recommendationsIndex'

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

export type WikiLookupResult = {
  query: string
  pages: Array<{
    path: string
    score: number
    title?: string
    tags?: string[]
    content: string
    citation: string
  }>
}

export type CatalogSearchRow = {
  sku: string
  score: number
  record: JsonRecord
  citation: string
}

export type ImageViewResult = {
  ok: boolean
  path: string
  error?: string
  media_type?: string
  byte_length?: number
  data_base64?: string
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
const DEFAULT_REPO_ROOT = path.resolve(process.cwd())

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
  private recommendationsByRuleKey: Record<string, JsonRecord[]> = {}
  private readonly repoRoot: string
  private readonly kbExtractsRoot: string

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
    this.repoRoot = normalizePath(env.OZ_REPO_ROOT, DEFAULT_REPO_ROOT)
    this.kbExtractsRoot = normalizePath(env.OZ_KB_EXTRACTS_ROOT, path.join(this.repoRoot, 'kb_extracts'))
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
    this.rebuildRecommendationsBuckets()
  }

  private async refreshIfChanged(): Promise<void> {
    this.catalogState = await this.reloadIfChanged(this.catalogState)
    this.recommendationsState = await this.reloadIfChanged(this.recommendationsState)
    this.rebuildCatalogIndex()
    this.rebuildRecommendationsBuckets()
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

  private rebuildRecommendationsBuckets(): void {
    this.recommendationsByRuleKey = groupRecommendationsByRuleKey(this.recommendationsState.records)
  }

  recommendations_for(
    skuOrSubcat: string,
    kind?: 'cross_sell' | 'upsell' | 'margin_substitution' | 'all',
  ): {
    target: string
    filter_kind: string
    rules: Array<{ record: JsonRecord; citation: string }>
  } {
    const target = String(skuOrSubcat ?? '').trim()
    const fk = (kind ?? 'all').toLowerCase()
    const filter_kind = fk === 'cross_sell' || fk === 'upsell' || fk === 'margin_substitution' || fk === 'all' ? fk : 'all'
    const rules: Array<{ record: JsonRecord; citation: string }> = []
    if (!target) return { target, filter_kind, rules }

    const want = (k: string) => filter_kind === 'all' || filter_kind === k

    if (want('cross_sell')) {
      const anchor = normalizedFilter(target) ?? ''
      const bucket = this.recommendationsByRuleKey[`cross_sell:${anchor}`] ?? []
      bucket.forEach((record, index) => {
        rules.push({ record, citation: recommendationCitation('cross_sell', anchor, index) })
      })
    }

    const skuKey = target.toUpperCase()
    for (const rk of ['upsell', 'margin_substitution'] as const) {
      if (!want(rk)) continue
      const bucket = this.recommendationsByRuleKey[`${rk}:${skuKey}`] ?? []
      bucket.forEach((record, index) => {
        rules.push({ record, citation: recommendationCitation(rk, skuKey, index) })
      })
    }

    return { target, filter_kind, rules }
  }

  async recommendations_explain(ruleCitation: string): Promise<{
    citation: string
    rule: JsonRecord | null
    methodology_text: string
    methodology_citation: string
    related_catalog: CatalogGetResult[]
  }> {
    const cite = String(ruleCitation ?? '').trim()
    const parsed = extractCitations(cite).find((c) => c.kind === 'recs' && 'recKind' in c && !('method' in c))
    let rule: JsonRecord | null = null
    if (parsed && parsed.kind === 'recs' && 'recKind' in parsed && 'key' in parsed && 'index' in parsed) {
      const key = `${parsed.recKind}:${parsed.key}`
      const list = this.recommendationsByRuleKey[key]
      rule = list?.[parsed.index] ?? null
    }

    const methodologyPath = 'concepts/recommendations/methodology'
    const methodologyRead = await this.wiki_read(methodologyPath)
    const methodologyText = methodologyRead.found ? methodologyRead.content.slice(0, 12_000) : ''
    const methodology_citation = methodologyRead.citation

    const related: CatalogGetResult[] = []
    if (rule) {
      const maybeSku = String(rule.target_sku ?? rule.to_sku ?? rule.target ?? '').trim().toUpperCase()
      if (maybeSku) related.push(this.catalog_get(maybeSku))
      const src = String(rule.from_sku ?? rule.source_sku ?? '').trim().toUpperCase()
      if (src) related.push(this.catalog_get(src))
    }

    return {
      citation: cite,
      rule,
      methodology_text: methodologyText,
      methodology_citation,
      related_catalog: related,
    }
  }

  recommendations_top(args: {
    kind?: 'cross_sell' | 'upsell' | 'margin_substitution' | 'all'
    by: 'confidence' | 'lift' | 'co_invoices' | 'price_uplift_pct' | 'gp_pct_uplift_pp'
    top_n?: number
    filter?: CatalogListArgs
  }): {
    by: string
    rows: Array<{ record: JsonRecord; citation: string; metric_value: number | null }>
  } {
    const topN = Math.max(1, Math.min(200, Math.trunc(Number(args.top_n) || 25)))
    const kindFilter = args.kind ?? 'all'
    const keyForMetric = metricFieldForTop(args.by)
    const filtered = this.filterCatalogLikeRecords(this.recommendationsState.records, args.filter).filter((record) => {
      const rk = String(record.rule_kind ?? record.kind ?? '').toLowerCase()
      if (kindFilter === 'all') return true
      return rk === kindFilter || rk === kindFilter.replaceAll('_', '-')
    })

    const decorated = filtered.map((record, index) => {
      const rk = String(record.rule_kind ?? record.kind ?? 'upsell').toLowerCase()
      const anchor =
        rk === 'cross_sell'
          ? normalizedFilter(record.sub_category ?? record.subCategory) ?? 'unknown'
          : String(record.from_sku ?? record.source_sku ?? record.sku ?? 'UNKNOWN').toUpperCase()
      const citation = recommendationCitation(rk, anchor, index)
      const metric_value = readNumber(record, [keyForMetric, args.by]) ?? null
      return { record, citation, metric_value, anchor, rk }
    })

    const sorted = [...decorated].sort((a, b) => {
      const av = a.metric_value
      const bv = b.metric_value
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av
    })

    return {
      by: args.by,
      rows: sorted.slice(0, topN).map(({ record, citation, metric_value }) => ({ record, citation, metric_value })),
    }
  }

  async catalog_search(query: string, k = 10): Promise<{ query: string; rows: CatalogSearchRow[] }> {
    const q = String(query ?? '').trim().toLowerCase()
    const limit = Math.max(1, Math.min(50, Math.trunc(k) || 10))
    if (!q) return { query: q, rows: [] }

    const tokens = tokenize(q)
    const lexical: CatalogSearchRow[] = []
    for (const record of this.catalogState.records) {
      const sku = String(readText(record, ['sku', 'item_sku', 'product_sku']) ?? '').trim().toUpperCase()
      if (!sku) continue
      const haystack = [
        sku,
        readText(record, ['description', 'name', 'title']),
        readText(record, ['product_line', 'productLine']),
        readText(record, ['sub_category', 'subCategory']),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      let score = 0
      for (const t of tokens) {
        if (!t) continue
        if (haystack.includes(t)) score += 3
        if (haystack.includes(` ${t}`)) score += 1
      }
      if (score > 0) lexical.push({ sku, score, record, citation: `[catalog:sku=${sku}]` })
    }
    lexical.sort((a, b) => b.score - a.score)

    const vectorHits = await this.catalogSearchVector(q, limit)
    const merged = new Map<string, CatalogSearchRow>()
    for (const row of lexical.slice(0, limit * 2)) merged.set(row.sku, row)
    for (const row of vectorHits) {
      const prev = merged.get(row.sku)
      if (!prev) merged.set(row.sku, row)
      else merged.set(row.sku, { ...row, score: prev.score + row.score })
    }

    const rows = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit)
    return { query: q, rows }
  }

  catalog_aggregate(args: {
    group_by: 'product_line' | 'product_line_code' | 'sub_category' | 'brand' | 'uom'
    metric: 'count' | 'sum_total_sales' | 'avg_unit_price' | 'avg_gp_pct' | 'sum_total_qty_sold'
    filter?: CatalogListArgs
  }): {
    group_by: string
    metric: string
    rows: Array<{ group_value: string; metric_value: number | null; sample_skus: string[] }>
  } {
    const filtered = this.filteredCatalogRecords(args.filter)
    const groupKey = groupByField(args.group_by)
    const buckets = new Map<string, JsonRecord[]>()
    for (const record of filtered) {
      const gv = groupKey(record)
      if (!gv) continue
      const list = buckets.get(gv) ?? []
      list.push(record)
      buckets.set(gv, list)
    }

    const rows = [...buckets.entries()].map(([group_value, recs]) => {
      const metric_value = aggregateMetric(recs, args.metric)
      const sample_skus = recs
        .map((r) => String(readText(r, ['sku', 'item_sku', 'product_sku']) ?? '').trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 5)
      return { group_value, metric_value, sample_skus }
    })

    rows.sort((a, b) => (b.metric_value ?? 0) - (a.metric_value ?? 0))

    return { group_by: args.group_by, metric: args.metric, rows }
  }

  catalog_compare(skus: string[]): {
    skus: string[]
    fields: string[]
    rows: Array<JsonRecord & { sku: string; citation: string }>
    deltas?: Record<string, { min: number; max: number; median: number }>
  } {
    const unique = [...new Set(skus.map((s) => String(s ?? '').trim().toUpperCase()).filter(Boolean))]
    const rows: Array<JsonRecord & { sku: string; citation: string }> = []
    for (const sku of unique) {
      const hit = this.catalog_get(sku)
      if (!hit.record) continue
      rows.push({ ...hit.record, sku, citation: hit.citation })
    }
    const numericFields = gatherNumericFields(rows)
    const deltas: Record<string, { min: number; max: number; median: number }> = {}
    for (const field of numericFields) {
      const nums = rows.map((r) => readNumber(r as JsonRecord, [field])).filter((n): n is number => n != null)
      if (nums.length === 0) continue
      nums.sort((a, b) => a - b)
      deltas[field] = {
        min: nums[0] ?? 0,
        max: nums[nums.length - 1] ?? 0,
        median: nums[Math.floor(nums.length / 2)] ?? 0,
      }
    }
    return { skus: unique, fields: numericFields, rows, deltas }
  }

  catalog_diff(sku_a: string, sku_b: string): {
    sku_a: CatalogGetResult
    sku_b: CatalogGetResult
    shared: JsonRecord
    only_a: JsonRecord
    only_b: JsonRecord
    numeric_deltas: Record<string, { a: number | null; b: number | null; abs_delta: number | null; pct_delta: number | null }>
  } {
    const a = this.catalog_get(sku_a)
    const b = this.catalog_get(sku_b)
    const shared: JsonRecord = {}
    const only_a: JsonRecord = {}
    const only_b: JsonRecord = {}
    if (!a.record || !b.record) {
      return {
        sku_a: a,
        sku_b: b,
        shared,
        only_a: (a.record ?? {}) as JsonRecord,
        only_b: (b.record ?? {}) as JsonRecord,
        numeric_deltas: {},
      }
    }
    const keys = new Set([...Object.keys(a.record), ...Object.keys(b.record)])
    for (const key of keys) {
      const av = a.record[key]
      const bv = b.record[key]
      if (JSON.stringify(av) === JSON.stringify(bv)) {
        shared[key] = av as unknown
      } else {
        only_a[key] = av as unknown
        only_b[key] = bv as unknown
      }
    }

    const numeric_deltas: Record<
      string,
      { a: number | null; b: number | null; abs_delta: number | null; pct_delta: number | null }
    > = {}
    for (const key of keys) {
      const na = readNumber(a.record as JsonRecord, [key])
      const nb = readNumber(b.record as JsonRecord, [key])
      if (na == null && nb == null) continue
      const abs_delta = na != null && nb != null ? Math.abs(na - nb) : null
      const pct_delta =
        na != null && nb != null && na !== 0 ? ((nb - na) / Math.abs(na)) * 100 : na === 0 && nb != null ? null : null
      numeric_deltas[key] = { a: na ?? null, b: nb ?? null, abs_delta, pct_delta }
    }

    return { sku_a: a, sku_b: b, shared, only_a, only_b, numeric_deltas }
  }

  async catalog_neighbors(
    sku: string,
    by: 'price' | 'margin' | 'sales' | 'description' = 'price',
    k = 10,
  ): Promise<{ sku: string; by: string; neighbors: Array<{ sku: string; score: number; record: JsonRecord; citation: string }> }> {
    const anchorSku = String(sku ?? '').trim().toUpperCase()
    const anchor = this.catalog_get(anchorSku).record
    const limit = Math.max(1, Math.min(50, Math.trunc(k) || 10))
    if (!anchor) return { sku: anchorSku, by, neighbors: [] }

    const sub = normalizedFilter(readText(anchor, ['sub_category', 'subCategory'])) ?? ''
    const peers = this.catalogState.records.filter((record) => {
      const s = String(readText(record, ['sku', 'item_sku', 'product_sku']) ?? '')
        .trim()
        .toUpperCase()
      if (!s || s === anchorSku) return false
      const peerSub = normalizedFilter(readText(record, ['sub_category', 'subCategory'])) ?? ''
      return peerSub === sub
    })

    const scoreRow = (record: JsonRecord): number => {
      if (by === 'price') {
        const pa = readNumber(anchor, ['unit_price_median', 'unit_price_avg', 'price'])
        const pb = readNumber(record, ['unit_price_median', 'unit_price_avg', 'price'])
        if (pa == null || pb == null) return Number.POSITIVE_INFINITY
        return Math.abs(pa - pb)
      }
      if (by === 'margin') {
        const pa = readNumber(anchor, ['gp_pct_median', 'margin'])
        const pb = readNumber(record, ['gp_pct_median', 'margin'])
        if (pa == null || pb == null) return Number.POSITIVE_INFINITY
        return Math.abs(pa - pb)
      }
      if (by === 'sales') {
        const pa = readNumber(anchor, ['total_sales', 'sales'])
        const pb = readNumber(record, ['total_sales', 'sales'])
        if (pa == null || pb == null) return Number.POSITIVE_INFINITY
        return Math.abs(pa - pb)
      }
      const da = String(readText(anchor, ['description']) ?? '').toLowerCase()
      const db = String(readText(record, ['description']) ?? '').toLowerCase()
      return 1 - jaccard(tokenize(da), tokenize(db))
    }

    const ranked = peers
      .map((record) => {
        const s = String(readText(record, ['sku', 'item_sku', 'product_sku']) ?? '')
          .trim()
          .toUpperCase()
        return {
          sku: s,
          score: scoreRow(record),
          record,
          citation: `[catalog:sku=${s}]`,
        }
      })
      .sort((a, b) => a.score - b.score)

    return { sku: anchorSku, by, neighbors: ranked.slice(0, limit) }
  }

  async wiki_lookup(query: string, top_n = 3): Promise<WikiLookupResult> {
    const q = String(query ?? '').trim()
    const limit = Math.max(1, Math.min(20, Math.trunc(top_n) || 3))
    if (!q) return { query: q, pages: [] }

    const tokens = tokenize(q.toLowerCase())
    const files = await listMarkdownFiles(this.wikiRoot)
    const bm25Path = path.join(this.wikiRoot, '.search', 'bm25.json')
    const bm25Raw = await this.readFile(bm25Path, 'utf8').catch(() => '')
    const bm25Index = bm25Raw ? (JSON.parse(bm25Raw) as Record<string, Record<string, number>>) : null

    const scored: WikiLookupResult['pages'] = []
    for (const filePath of files) {
      const rel = toRelativeWikiPath(this.wikiRoot, filePath)
      const baseSlug = rel.replace(/\.md$/i, '').replaceAll('\\', '/')
      const content = await this.readFile(filePath, 'utf8').catch(() => '')
      const fm = parseSimpleFrontmatter(content)
      let score = 0
      if (baseSlug.endsWith(q.toLowerCase()) || baseSlug.split('/').pop() === q.toLowerCase()) score += 120
      const slug = baseSlug.toLowerCase()
      if (slug === q.toLowerCase()) score += 200
      for (const tag of fm.tags ?? []) {
        if (tokens.some((t) => t.length > 2 && tag.toLowerCase().includes(t))) score += 60
      }
      const titleTokens = tokenize((fm.title ?? '').toLowerCase())
      score += overlapCount(tokens, titleTokens) * 15
      const body = stripFrontmatter(content).toLowerCase()
      score += overlapCount(tokens, tokenize(body)) * 2
      if (bm25Index?.[rel]) {
        for (const t of tokens) score += (bm25Index[rel][t] ?? 0) * 5
      }
      if (score <= 0) continue
      scored.push({
        path: rel,
        score,
        title: fm.title,
        tags: fm.tags,
        content: stripFrontmatter(content).slice(0, 12_000),
        citation: `[wiki:${rel}]`,
      })
    }

    scored.sort((a, b) => b.score - a.score)
    return { query: q, pages: scored.slice(0, limit) }
  }

  async image_view(relPath: string): Promise<ImageViewResult> {
    const normalized = String(relPath ?? '').replaceAll('\\', '/').trim()
    if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
      return { ok: false, path: normalized, error: 'invalid_path' }
    }
    if (!normalized.toLowerCase().startsWith('kb_extracts/')) {
      return { ok: false, path: normalized, error: 'path_must_start_with_kb_extracts/' }
    }

    const abs = path.resolve(this.repoRoot, normalized)
    const rootResolved = path.resolve(this.kbExtractsRoot)
    if (!abs.toLowerCase().startsWith(rootResolved.toLowerCase() + path.sep) && abs !== rootResolved) {
      return { ok: false, path: normalized, error: 'outside_kb_extracts_root' }
    }

    try {
      const buf = await this.readFile(abs)
      const byte_length = buf.length
      if (byte_length > 2_500_000) {
        return { ok: false, path: normalized, error: 'file_too_large', byte_length }
      }
      const lower = normalized.toLowerCase()
      const media_type = lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
          ? 'image/jpeg'
          : lower.endsWith('.webp')
            ? 'image/webp'
            : 'application/octet-stream'
      return {
        ok: true,
        path: normalized,
        media_type,
        byte_length,
        data_base64: buf.toString('base64'),
      }
    } catch {
      return { ok: false, path: normalized, error: 'not_found' }
    }
  }

  private async catalogSearchVector(query: string, limit: number): Promise<CatalogSearchRow[]> {
    const dbQuery = this.readOnlyDbQuery()
    const env = this.readEnv()
    const apiKey = (process.env.OPENAI_API_KEY || env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()
    const embeddingModel = (env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small').trim()
    if (!dbQuery || !apiKey) return []

    const embedding = await embedOpenAiText({
      apiKey,
      model: embeddingModel,
      text: query,
      fetchImpl: this.fetchImpl,
    })
    const vecLiteral = `[${embedding.join(',')}]`
    const sql = `SELECT chunk_id, source_id, COALESCE(meta->>'sku','') AS sku, content,
                        (embedding <=> $1::vector)::float8 AS dist
                   FROM kb_rag_chunks
                   WHERE status = 'ready'
                     AND lower(COALESCE(meta->>'doc_kind','')) = 'structured-data'
                     AND COALESCE(meta->>'sku','') <> ''
                   ORDER BY embedding <=> $1::vector
                   LIMIT $2`
    type Row = { sku: string; dist: number; content: string }
    const rows = (await dbQuery<Row>(sql, [vecLiteral, limit])).rows
    const out: CatalogSearchRow[] = []
    for (const row of rows) {
      const sku = String(row.sku ?? '').trim().toUpperCase()
      if (!sku) continue
      const record = this.catalogBySku.get(sku) ?? { sku, snippet: row.content }
      const score = Math.max(0, 1 - row.dist)
      out.push({ sku, score, record, citation: `[catalog:sku=${sku}]` })
    }
    return out
  }

  private filteredCatalogRecords(filter?: CatalogListArgs): JsonRecord[] {
    const list = this.catalog_list(filter ?? {})
    const skus = new Set(list.rows.map((row) => String(readText(row.record, ['sku', 'item_sku', 'product_sku']) ?? '').toUpperCase()))
    return this.catalogState.records.filter((record) =>
      skus.has(String(readText(record, ['sku', 'item_sku', 'product_sku']) ?? '').toUpperCase()),
    )
  }

  private filterCatalogLikeRecords(records: JsonRecord[], filter?: CatalogListArgs): JsonRecord[] {
    if (!filter) return records
    const productLine = normalizedFilter(filter.product_line)
    const subCategory = normalizedFilter(filter.sub_category)
    const brand = normalizedFilter(filter.brand)
    const minSales = Number.isFinite(Number(filter.min_sales)) ? Number(filter.min_sales) : undefined
    return records.filter((record) => {
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
  }

  private safeWikiPath(input: string): string | null {
    const trimmed = String(input ?? '').trim()
    if (!trimmed || trimmed.includes('..') || path.isAbsolute(trimmed)) return null
    const candidate = path.resolve(this.wikiRoot, trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`)
    if (!candidate.startsWith(`${this.wikiRoot}${path.sep}`)) return null
    return candidate
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
}

function overlapCount(a: string[], b: string[]): number {
  const bs = new Set(b)
  let n = 0
  for (const x of a) if (bs.has(x)) n += 1
  return n
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a)
  const B = new Set(b)
  let inter = 0
  for (const x of A) if (B.has(x)) inter += 1
  const union = A.size + B.size - inter
  return union === 0 ? 0 : inter / union
}

function parseSimpleFrontmatter(md: string): { title?: string; tags?: string[] } {
  if (!md.startsWith('---')) return {}
  const end = md.indexOf('\n---', 3)
  if (end < 0) return {}
  const block = md.slice(3, end)
  const title = /^title:\s*(.+)$/im.exec(block)?.[1]?.trim().replace(/^["']|["']$/g, '')
  const tagsLine = /^tags:\s*(.+)$/im.exec(block)?.[1]?.trim()
  let tags: string[] | undefined
  if (tagsLine?.startsWith('[')) {
    try {
      tags = JSON.parse(tagsLine.replace(/'/g, '"')) as string[]
    } catch {
      tags = tagsLine.split(',').map((t) => t.trim())
    }
  } else if (tagsLine) {
    tags = tagsLine.split(',').map((t) => t.trim())
  }
  return { title, tags }
}

function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md
  const end = md.indexOf('\n---', 3)
  if (end < 0) return md
  return md.slice(end + 4).trimStart()
}

function metricFieldForTop(by: string): string {
  const map: Record<string, string> = {
    confidence: 'confidence',
    lift: 'lift',
    co_invoices: 'co_invoices',
    price_uplift_pct: 'price_uplift_pct',
    gp_pct_uplift_pp: 'gp_pct_uplift_pp',
  }
  return map[by] ?? by
}

function groupByField(
  groupBy: 'product_line' | 'product_line_code' | 'sub_category' | 'brand' | 'uom',
): (record: JsonRecord) => string | undefined {
  switch (groupBy) {
    case 'product_line':
      return (record) => normalizedFilter(readText(record, ['product_line', 'productLine']))
    case 'product_line_code':
      return (record) => normalizedFilter(readText(record, ['product_line_code', 'line_code', 'product_line_code']))
    case 'sub_category':
      return (record) => normalizedFilter(readText(record, ['sub_category', 'subCategory']))
    case 'brand':
      return (record) => normalizedFilter(readText(record, ['brand']))
    case 'uom':
      return (record) => normalizedFilter(readText(record, ['uom', 'unit']))
    default:
      return () => undefined
  }
}

function aggregateMetric(records: JsonRecord[], metric: string): number | null {
  if (records.length === 0) return null
  if (metric === 'count') return records.length
  if (metric === 'sum_total_sales') {
    let sum = 0
    for (const r of records) {
      const v = readNumber(r, ['total_sales', 'sales'])
      if (v != null) sum += v
    }
    return sum
  }
  if (metric === 'avg_unit_price') {
    const vals = records
      .map((r) => readNumber(r, ['unit_price_median', 'unit_price_avg', 'price']))
      .filter((v): v is number => v != null)
    if (!vals.length) return null
    return vals.reduce((acc, v) => acc + v, 0) / vals.length
  }
  if (metric === 'avg_gp_pct') {
    const vals = records.map((r) => readNumber(r, ['gp_pct_median', 'margin'])).filter((v): v is number => v != null)
    if (!vals.length) return null
    return vals.reduce((acc, v) => acc + v, 0) / vals.length
  }
  if (metric === 'sum_total_qty_sold') {
    let sum = 0
    for (const r of records) {
      const v = readNumber(r, ['total_qty_sold', 'qty'])
      if (v != null) sum += v
    }
    return sum
  }
  return null
}

function gatherNumericFields(rows: JsonRecord[]): string[] {
  if (rows.length === 0) return []
  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === 'sku' || key === 'citation') continue
      if (readNumber(row, [key]) != null) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()].filter(([, c]) => c === rows.length).map(([k]) => k)
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
