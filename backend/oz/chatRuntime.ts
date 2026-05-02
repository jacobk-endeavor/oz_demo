import {
  applyGraphNeighborLimits,
  applyGraphSearchLimits,
  createGraphNeighborsStubAdapter,
  createGraphSearchStubAdapter,
  resolveGraphTraversalLimits,
  type EnforcedGraphNeighborRequest,
  type EnforcedGraphSearchRequest,
  type GraphNeighborResult,
  type GraphNeighborsAdapter,
  type GraphSearchAdapter,
  type GraphSearchResult,
  type GraphTraversalLimits,
} from './graphAdapters'
import {
  DEFAULT_MEMORY_TTL_SECONDS,
  evaluateMemoryWritePolicy,
  noopMemoryRecall,
  noopMemoryWrite,
  sanitizeMemoryItem,
  sanitizeMemoryWrite,
  type MemoryRecallAdapter,
  type MemoryWriteAdapter,
} from './memoryAdapters'
import type {
  CatalogGetResult,
  CatalogListResult,
  CatalogSearchRow,
  ImageViewResult,
  KbSearchToolResult,
  TrackCToolScaffold,
  WikiGrepResult,
  WikiLogResult,
  WikiLookupResult,
  WikiReadResult,
} from './trackCToolScaffold'
import { createTranscriptToolRegistry, type TranscriptReadResult, type TranscriptSearchResult } from './transcriptRagTools'
import { randomUUID } from 'node:crypto'
import {
  LocalDockerBackend,
  resolveSandboxImage,
  runPythonSandbox,
  type DataRef,
  type PythonSandboxResult,
} from './pythonSandbox'
import { getOzChatSandboxTraceDetails, isOzSandboxToolsUnavailable, ozSandboxStartupHealth } from './ozSandboxAvailability'
import { parseOzChatRoutePrefix } from './ozChatRoutePrefixes'
import { OZ_CHAT_SYSTEM_PROMPT_VERSION, ozChatOpenAiToolDefinitions } from './ozChatToolRegistry'
import {
  appendSkippedFilingQueryEvent,
  collectDistinctEvidenceSources,
  compactCitationList,
  evaluateFilingNovelty,
  runFilingCuratorAgent,
  slugifyFilingSegment,
} from './wikiFilingBack'

export const OZ_CHAT_CONTRACT_VERSION = '2026-04-oz-chat-v1' as const

export type OzPolicyPath = 'hardcoded' | 'agent'

export type OzChatRequest = {
  contract_version?: string
  message?: string
  trace_id?: string
  conversation_id?: string
  stream?: boolean
  context?: unknown
  ragScope?: string
  /** Per-request override of config/oz.yaml's chat.runtime. UI toggle sets this. */
  mode?: 'scaffold' | 'agentic'
  /**
   * Server-only: appended to agentic system prompts after loading `oz_thread_direction`.
   * Stripped from inbound JSON; never trust client-supplied values.
   */
  thread_direction_summary?: string
}

type OzChatBaseEvent = {
  contract_version: string
  sequence: number
  timestamp: string
  trace_id?: string
  conversation_id?: string
}

export type OzChatStreamEvent =
  | (OzChatBaseEvent & { type: 'trace'; stage: string; decision: string; details?: Record<string, unknown> })
  | (OzChatBaseEvent & { type: 'token'; delta: string })
  | (OzChatBaseEvent & { type: 'tool_call'; tool_call_id: string; name: string; arguments: Record<string, unknown> })
  | (OzChatBaseEvent & {
      type: 'tool_result'
      tool_call_id: string
      name: string
      ok: boolean
      summary?: string
      result_meta?: Record<string, unknown>
    })
  | (OzChatBaseEvent & {
      type: 'done'
      message: string
      finish_reason: string
      citations?: Array<{ kind: string; id: string; label?: string }>
    })

export type RuntimeDependencies = {
  now?: () => Date
  graph?: {
    limits?: Partial<GraphTraversalLimits>
    searchAdapter?: GraphSearchAdapter
    neighborsAdapter?: GraphNeighborsAdapter
  }
  memory?: {
    recallAdapter?: MemoryRecallAdapter
    writeAdapter?: MemoryWriteAdapter
  }
  transcripts?: {
    registry?: {
      search_transcripts: (request: { query: string; scope?: string; top_k?: number }) => Promise<TranscriptSearchResult>
      read_transcript: (request: { call_id: string; scope?: string; max_chunks?: number }) => Promise<TranscriptReadResult>
    }
    dbQuery?: <T>(sql: string, params: unknown[]) => Promise<{ rows: T[] }>
    openAiApiKey?: string
    embeddingModel?: string
  }
  catalog?: {
    registry?: {
      catalog_get: (request: { sku: string }) => Promise<CatalogGetResult>
      catalog_list: (request: {
        product_line?: string
        sub_category?: string
        brand?: string
        min_sales?: number
        sort_by?: string
        top_n?: number
      }) => Promise<CatalogListResult>
    }
  }
  wiki?: {
    registry?: {
      wiki_read: (request: { path: string }) => Promise<WikiReadResult>
      wiki_grep: (request: { query: string; top_n?: number }) => Promise<WikiGrepResult>
      wiki_log: (request: { kind?: string; since?: string; until?: string; top_n?: number }) => Promise<WikiLogResult>
    }
  }
  kb?: {
    kb_search?: (request: {
      query: string
      surface?: 'kb' | 'call' | 'global'
      k?: number
      kind?: string
      call_scope?: string
    }) => Promise<KbSearchToolResult>
  }
  /** Optional Track C scaffold instance — wires Layer 1–2 catalog/rec/wiki tools when provided. */
  trackC?: {
    scaffold?: TrackCToolScaffold
  }
  /** Optional audit sink for tool latency / summaries (PII-redacted args). Spec: Q&A §9. */
  audit?: {
    onComplete?: (payload: OzToolAuditOnCompletePayload) => void
  }
}

/** Payload for {@link RuntimeDependencies.audit} when `OZ_TOOL_AUDIT=1` (console JSON lines). */
export type OzToolAuditOnCompletePayload = {
  tool: string
  ok: boolean
  latency_ms: number
  args_summary: string
  result_summary: string
  sandbox?: {
    exit_code: number | null
    /** Resolved image ref (`repo:tag`, `repo@sha256:…`) from startup smoke or {@link resolveSandboxImage}. */
    container_image_sha?: string
    sandbox_egress_bytes: number
    artifacts_emitted: number
  }
}

/** Layer 3 bundled helpers — when TrackCToolScaffold is wired, composites run as parallel primitive fan-out. */
export type OzBundledLayer3StubResult = {
  status: 'stub'
  bundled_tool: 'product_dossier' | 'compare' | 'wiki_compare' | 'drift_check'
  message: string
  tracking_issue: string
  substrates_consulted: Record<'catalog' | 'wiki' | 'kb' | 'recommendations' | 'calls', 'skipped'>
  target?: string
  targets?: string[]
  slugs?: string[]
}

export type OzBundledLayer3OkResult = {
  status: 'ok'
  bundled_tool: 'product_dossier' | 'compare' | 'wiki_compare' | 'drift_check'
  substrates_consulted: Partial<Record<'catalog' | 'wiki' | 'kb' | 'recommendations' | 'calls', 'queried' | 'skipped'>>
  [key: string]: unknown
}

export type OzBundledLayer3Result = OzBundledLayer3StubResult | OzBundledLayer3OkResult

export type OzToolSurface = {
  graph_search: (request: { query: string; depth?: number; size?: number; scope?: string }) => Promise<GraphSearchResult>
  graph_neighbors: (request: {
    nodeId: string
    depth?: number
    size?: number
    scope?: string
  }) => Promise<GraphNeighborResult>
  search_transcripts: (request: { query: string; scope?: string; top_k?: number }) => Promise<TranscriptSearchResult>
  read_transcript: (request: { call_id: string; scope?: string; max_chunks?: number }) => Promise<TranscriptReadResult>
  catalog_get: (request: { sku: string }) => Promise<CatalogGetResult>
  catalog_list: (request: {
    product_line?: string
    sub_category?: string
    brand?: string
    min_sales?: number
    sort_by?: string
    top_n?: number
  }) => Promise<CatalogListResult>
  wiki_read: (request: { path: string }) => Promise<WikiReadResult>
  wiki_grep: (request: { query: string; top_n?: number }) => Promise<WikiGrepResult>
  wiki_log: (request: { kind?: string; since?: string; until?: string; top_n?: number }) => Promise<WikiLogResult>
  kb_search: (request: {
    query: string
    surface?: 'kb' | 'call' | 'global'
    k?: number
    kind?: string
    call_scope?: string
  }) => Promise<KbSearchToolResult>
  recommendations_for: (request: {
    sku_or_subcat: string
    kind?: 'cross_sell' | 'upsell' | 'margin_substitution' | 'all'
  }) => Promise<ReturnType<TrackCToolScaffold['recommendations_for']>>
  recommendations_explain: (request: { citation: string }) => Promise<Awaited<ReturnType<TrackCToolScaffold['recommendations_explain']>>>
  recommendations_top: (
    request: Parameters<TrackCToolScaffold['recommendations_top']>[0],
  ) => Promise<ReturnType<TrackCToolScaffold['recommendations_top']>>
  catalog_search: (request: { query: string; k?: number }) => Promise<{ query: string; rows: CatalogSearchRow[] }>
  catalog_aggregate: (
    request: Parameters<TrackCToolScaffold['catalog_aggregate']>[0],
  ) => Promise<ReturnType<TrackCToolScaffold['catalog_aggregate']>>
  catalog_compare: (request: { skus: string[] }) => Promise<ReturnType<TrackCToolScaffold['catalog_compare']>>
  catalog_diff: (request: { sku_a: string; sku_b: string }) => Promise<ReturnType<TrackCToolScaffold['catalog_diff']>>
  catalog_neighbors: (request: {
    sku: string
    by?: 'price' | 'margin' | 'sales' | 'description'
    k?: number
  }) => Promise<Awaited<ReturnType<TrackCToolScaffold['catalog_neighbors']>>>
  wiki_lookup: (request: { query: string; top_n?: number }) => Promise<WikiLookupResult>
  image_view: (request: { path: string }) => Promise<ImageViewResult>
  product_dossier: (request: { target: string }) => Promise<OzBundledLayer3Result>
  compare: (request: { targets: string[]; dimensions?: string[] }) => Promise<OzBundledLayer3Result>
  wiki_compare: (request: { slugs: string[] }) => Promise<OzBundledLayer3Result>
  drift_check: (request: { target: string }) => Promise<OzBundledLayer3Result>
  /** Isolated Python runner (Docker); see docs/code-sandbox-and-artifact-generation.md §2.1. */
  run_python: (request: {
    code: string
    data_refs?: DataRef[]
    upload_ids?: string[]
    timeout_s?: number
  }) => Promise<PythonSandboxResult>
  /** Model-callable slide-out: tabular rows + stable ids (see docs/oz-chat-contract-schema.md). */
  display_table: (request: {
    title: string
    columns: unknown
    rows: unknown
    scope?: string
  }) => Promise<Record<string, unknown>>
  /** Model-callable slide-out: registered rich panels (`invoice_preview`, …). */
  display_panel: (request: { kind: string; props?: Record<string, unknown> }) => Promise<Record<string, unknown>>
}

function nowMs(now: () => Date): number {
  return now().getTime()
}

function defaultScopeFor(request: OzChatRequest): string | undefined {
  return request.ragScope?.trim() || undefined
}

const LAYER3_STUB_SUBSTRATES: OzBundledLayer3StubResult['substrates_consulted'] = {
  catalog: 'skipped',
  wiki: 'skipped',
  kb: 'skipped',
  recommendations: 'skipped',
  calls: 'skipped',
}

function layer3BundledStub(
  bundled_tool: OzBundledLayer3StubResult['bundled_tool'],
  tracking_issue: string,
  message: string,
  fields?: { target?: string; targets?: string[]; slugs?: string[] },
): OzBundledLayer3StubResult {
  return {
    status: 'stub',
    bundled_tool,
    tracking_issue,
    message,
    substrates_consulted: LAYER3_STUB_SUBSTRATES,
    ...fields,
  }
}

function redactToolArgs(args: unknown): string {
  const text = JSON.stringify(args)
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[phone]')
    .slice(0, 500)
}

function summarizeToolResult(result: unknown): string {
  try {
    return JSON.stringify(result).slice(0, 500)
  } catch {
    return String(result).slice(0, 500)
  }
}

function resolveSandboxImageRefForAudit(): string | undefined {
  const fromSmoke = ozSandboxStartupHealth().image?.trim()
  if (fromSmoke) return fromSmoke
  return resolveSandboxImage()
}

function sandboxAuditFromRunPythonResult(out: unknown): OzToolAuditOnCompletePayload['sandbox'] | undefined {
  if (!out || typeof out !== 'object') return undefined
  const r = out as Record<string, unknown>
  if (typeof r.ok !== 'boolean') return undefined
  if (typeof r.stdout !== 'string' || typeof r.stderr !== 'string') return undefined
  if (typeof r.runtime_ms !== 'number') return undefined
  const ec = r.exit_code
  if (typeof ec !== 'number' && ec !== null) return undefined

  const artifactsLen = Array.isArray(r.artifacts) ? r.artifacts.length : 0
  const inlineLen = Array.isArray(r.inline_figures) ? r.inline_figures.length : 0
  const imageRef = resolveSandboxImageRefForAudit()

  return {
    exit_code: ec,
    ...(imageRef ? { container_image_sha: imageRef } : {}),
    sandbox_egress_bytes: 0,
    artifacts_emitted: artifactsLen + inlineLen,
  }
}

function wrapOzToolSurface(surface: OzToolSurface, audit: RuntimeDependencies['audit']): OzToolSurface {
  if (!audit?.onComplete) return surface
  return new Proxy(surface, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function' || typeof prop === 'symbol') return value
      return async (...args: unknown[]) => {
        const t0 = Date.now()
        const name = String(prop)
        try {
          const out = await value.apply(target, args)
          const sandbox = name === 'run_python' ? sandboxAuditFromRunPythonResult(out) : undefined
          audit.onComplete?.({
            tool: name,
            ok: true,
            latency_ms: Date.now() - t0,
            args_summary: redactToolArgs(args),
            result_summary: summarizeToolResult(out),
            ...(sandbox ? { sandbox } : {}),
          })
          return out
        } catch (error) {
          audit.onComplete?.({
            tool: name,
            ok: false,
            latency_ms: Date.now() - t0,
            args_summary: redactToolArgs(args),
            result_summary: error instanceof Error ? error.message : String(error),
          })
          throw error
        }
      }
    },
  }) as OzToolSurface
}

export function createOzToolSurface(request: OzChatRequest, deps: RuntimeDependencies = {}): OzToolSurface {
  const limits = resolveGraphTraversalLimits(deps.graph?.limits)
  const searchAdapter = deps.graph?.searchAdapter ?? createGraphSearchStubAdapter()
  const neighborsAdapter = deps.graph?.neighborsAdapter ?? createGraphNeighborsStubAdapter()
  const transcriptRegistry =
    deps.transcripts?.registry ??
    createTranscriptToolRegistry({
      dbQuery: deps.transcripts?.dbQuery,
      openAiApiKey: deps.transcripts?.openAiApiKey,
      embeddingModel: deps.transcripts?.embeddingModel,
    })
  const requestScope = defaultScopeFor(request)
  const tc = deps.trackC?.scaffold

  const catalogRegistry =
    deps.catalog?.registry ??
    (tc
      ? {
          async catalog_get(payload: { sku: string }) {
            return tc.catalog_get(payload.sku)
          },
          async catalog_list(payload: {
            product_line?: string
            sub_category?: string
            brand?: string
            min_sales?: number
            sort_by?: string
            top_n?: number
          }) {
            return tc.catalog_list(payload)
          },
        }
      : {
          async catalog_get(payload: { sku: string }) {
            const sku = String(payload.sku ?? '').trim().toUpperCase()
            return { sku, found: false, record: null, citation: `[catalog:sku=${sku}]` }
          },
          async catalog_list(payload: {
            product_line?: string
            sub_category?: string
            brand?: string
            min_sales?: number
            sort_by?: string
            top_n?: number
          }) {
            return {
              filters: {
                product_line: payload.product_line,
                sub_category: payload.sub_category,
                brand: payload.brand,
                min_sales: payload.min_sales,
                sort_by: payload.sort_by,
                top_n: Math.max(1, Math.min(200, Math.trunc(Number(payload.top_n) || 25))),
              },
              total: 0,
              rows: [],
            }
          },
        })
  const wikiRegistry =
    deps.wiki?.registry ??
    (tc
      ? {
          async wiki_read(payload: { path: string }) {
            return tc.wiki_read(payload.path)
          },
          async wiki_grep(payload: { query: string; top_n?: number }) {
            return tc.wiki_grep(payload.query, payload.top_n ?? 8)
          },
          async wiki_log(payload: { kind?: string; since?: string; until?: string; top_n?: number }) {
            return tc.wiki_log(payload)
          },
        }
      : {
          async wiki_read(payload: { path: string }) {
            return { path: payload.path, found: false, content: '', citation: `[wiki:${payload.path}]` }
          },
          async wiki_grep(payload: { query: string }) {
            return { query: String(payload.query ?? ''), total: 0, hits: [] }
          },
          async wiki_log(payload: { kind?: string; since?: string; until?: string; top_n?: number }) {
            return {
              filters: { kind: payload.kind, since: payload.since, until: payload.until, top_n: payload.top_n ?? 25 },
              total: 0,
              entries: [],
            }
          },
        })

  const kbSearch =
    deps.kb?.kb_search ??
    (deps.trackC?.scaffold
      ? (payload) => deps.trackC!.scaffold!.kb_search(payload)
      : async (payload: {
          query: string
          surface?: 'kb' | 'call' | 'global'
          k?: number
          kind?: string
          call_scope?: string
        }): Promise<KbSearchToolResult> => {
          const query = String(payload.query ?? '').trim()
          const surface =
            payload.surface === 'kb' || payload.surface === 'call' || payload.surface === 'global'
              ? payload.surface
              : 'global'
          return {
            query,
            surface,
            chunks: [],
            provenance: { source: 'stub', retrieval: 'none' },
          }
        })

  const surface: OzToolSurface = {
    async graph_search(payload): Promise<GraphSearchResult> {
      const bounded: EnforcedGraphSearchRequest = applyGraphSearchLimits(
        { ...payload, scope: payload.scope ?? requestScope },
        limits,
      )
      return searchAdapter.search(bounded)
    },
    async graph_neighbors(payload): Promise<GraphNeighborResult> {
      const bounded: EnforcedGraphNeighborRequest = applyGraphNeighborLimits(
        { ...payload, scope: payload.scope ?? requestScope },
        limits,
      )
      return neighborsAdapter.neighbors(bounded)
    },
    async search_transcripts(payload): Promise<TranscriptSearchResult> {
      return transcriptRegistry.search_transcripts({ ...payload, scope: payload.scope ?? requestScope })
    },
    async read_transcript(payload): Promise<TranscriptReadResult> {
      return transcriptRegistry.read_transcript({ ...payload, scope: payload.scope ?? requestScope })
    },
    async catalog_get(payload): Promise<CatalogGetResult> {
      return catalogRegistry.catalog_get(payload)
    },
    async catalog_list(payload): Promise<CatalogListResult> {
      return catalogRegistry.catalog_list(payload)
    },
    async wiki_read(payload): Promise<WikiReadResult> {
      return wikiRegistry.wiki_read(payload)
    },
    async wiki_grep(payload): Promise<WikiGrepResult> {
      return wikiRegistry.wiki_grep(payload)
    },
    async wiki_log(payload): Promise<WikiLogResult> {
      return wikiRegistry.wiki_log(payload)
    },
    async kb_search(payload): Promise<KbSearchToolResult> {
      return kbSearch(payload)
    },
    async recommendations_for(payload) {
      if (!tc) return { target: '', filter_kind: 'all', rules: [] }
      return tc.recommendations_for(payload.sku_or_subcat, payload.kind)
    },
    async recommendations_explain(payload) {
      if (!tc) {
        return {
          citation: payload.citation,
          rule: null,
          methodology_text: '',
          methodology_citation: '[wiki:concepts/recommendations/methodology.md]',
          related_catalog: [],
        }
      }
      return tc.recommendations_explain(payload.citation)
    },
    async recommendations_top(payload) {
      if (!tc) return { by: payload.by ?? 'confidence', rows: [] }
      return tc.recommendations_top(payload)
    },
    async catalog_search(payload) {
      if (!tc) return { query: String(payload.query ?? ''), rows: [] }
      return tc.catalog_search(payload.query, payload.k)
    },
    async catalog_aggregate(payload) {
      if (!tc) {
        return { group_by: payload.group_by, metric: payload.metric, rows: [] }
      }
      return tc.catalog_aggregate(payload)
    },
    async catalog_compare(payload) {
      if (!tc) return { skus: [], fields: [], rows: [] }
      return tc.catalog_compare(payload.skus)
    },
    async catalog_diff(payload) {
      if (!tc) {
        return {
          sku_a: { sku: payload.sku_a, found: false, record: null, citation: `[catalog:sku=${payload.sku_a}]` },
          sku_b: { sku: payload.sku_b, found: false, record: null, citation: `[catalog:sku=${payload.sku_b}]` },
          shared: {},
          only_a: {},
          only_b: {},
          numeric_deltas: {},
        }
      }
      return tc.catalog_diff(payload.sku_a, payload.sku_b)
    },
    async catalog_neighbors(payload) {
      if (!tc) return { sku: payload.sku, by: payload.by ?? 'price', neighbors: [] }
      return tc.catalog_neighbors(payload.sku, payload.by, payload.k)
    },
    async wiki_lookup(payload) {
      if (!tc) return { query: String(payload.query ?? ''), pages: [] }
      return tc.wiki_lookup(payload.query, payload.top_n)
    },
    async image_view(payload) {
      if (!tc) return { ok: false, path: String(payload.path ?? ''), error: 'stub' }
      return tc.image_view(payload.path)
    },
    async product_dossier(payload) {
      if (tc) {
        return (await tc.layer3ProductDossier(String(payload.target ?? ''))) as OzBundledLayer3OkResult
      }
      return layer3BundledStub(
        'product_dossier',
        'Oz-Demo-rx1',
        'Bundled product_dossier requires TrackCToolScaffold (OZ_PRODUCT_CATALOG_PATH / wiki / DB); compose primitives manually.',
        { target: String(payload.target ?? '') },
      )
    },
    async compare(payload) {
      const targets = Array.isArray(payload.targets) ? payload.targets.map((t) => String(t ?? '')) : []
      if (tc) {
        return (await tc.layer3Compare(targets)) as OzBundledLayer3OkResult
      }
      return layer3BundledStub(
        'compare',
        'Oz-Demo-6eb',
        'Bundled compare requires TrackCToolScaffold; compose catalog_compare and wiki_read manually.',
        { targets },
      )
    },
    async wiki_compare(payload) {
      const slugs = Array.isArray(payload.slugs) ? payload.slugs.map((s) => String(s ?? '')) : []
      if (tc) {
        return (await tc.layer3WikiCompare(slugs)) as OzBundledLayer3OkResult
      }
      return layer3BundledStub(
        'wiki_compare',
        'Oz-Demo-6eb',
        'Bundled wiki_compare requires TrackCToolScaffold; call wiki_read per slug manually.',
        { slugs },
      )
    },
    async drift_check(payload) {
      if (tc) {
        return (await tc.layer3DriftCheck(String(payload.target ?? ''))) as OzBundledLayer3OkResult
      }
      return layer3BundledStub(
        'drift_check',
        'Oz-Demo-coh',
        'Bundled drift_check requires TrackCToolScaffold; contrast sources manually.',
        { target: String(payload.target ?? '') },
      )
    },
    async run_python(payload) {
      if (isOzSandboxToolsUnavailable()) {
        return {
          ok: false,
          reason: 'sandbox_unavailable',
          stdout: '',
          stderr:
            'Sandbox runner did not pass startup smoke (see backend logs). Ensure Docker is running and OZ_SANDBOX_IMAGE is set when needed.',
          exit_code: null,
          runtime_ms: 0,
        }
      }
      const code = String(payload.code ?? '')
      if (!code.trim()) {
        return {
          ok: false,
          reason: 'nonzero_exit',
          stdout: '',
          stderr: 'run_python requires non-empty code.',
          exit_code: 1,
          runtime_ms: 0,
        }
      }
      const timeoutS = Math.min(120, Math.max(1, Number(payload.timeout_s) || 30))
      const timeoutMs = timeoutS * 1000
      const uploadIds = Array.isArray(payload.upload_ids)
        ? payload.upload_ids.map((u) => String(u ?? '').trim()).filter(Boolean)
        : []
      if (uploadIds.length > 0) {
        return {
          ok: false,
          reason: 'sandbox_unavailable',
          stdout: '',
          stderr: 'upload_ids are not wired to storage in this runtime yet; omit upload_ids or use host-mode tools.',
          exit_code: null,
          runtime_ms: 0,
        }
      }
      const refs = Array.isArray(payload.data_refs)
        ? payload.data_refs
            .map((r) => {
              if (!r || typeof r !== 'object') return null
              const o = r as Record<string, unknown>
              const kind = String(o.kind ?? '').trim()
              const id = String(o.id ?? '').trim()
              return kind && id ? ({ kind, id } as DataRef) : null
            })
            .filter((x): x is DataRef => x != null)
        : []
      const backend = new LocalDockerBackend()
      const image = resolveSandboxImage()
      return runPythonSandbox({
        code,
        ...(refs.length ? { dataRefs: refs } : {}),
        timeoutMs,
        backend,
        resolveDataRef: async () => null,
        image,
      })
    },
    async display_table(payload) {
      const panel_id = `pan_${randomUUID().replace(/-/g, '')}`
      return {
        ok: true,
        panel_id,
        kind: 'table',
        title: String(payload.title ?? ''),
        columns: payload.columns ?? [],
        rows: payload.rows ?? [],
        ...(typeof payload.scope === 'string' && payload.scope.trim()
          ? { scope: payload.scope.trim() }
          : {}),
      }
    },
    async display_panel(payload) {
      const panel_id = `pan_${randomUUID().replace(/-/g, '')}`
      const kind = String(payload.kind ?? '').trim() || 'chart'
      return {
        ok: true,
        panel_id,
        kind,
        props: payload.props && typeof payload.props === 'object' && !Array.isArray(payload.props) ? payload.props : {},
      }
    },
  }

  return wrapOzToolSurface(surface, deps.audit)
}

export function choosePolicyPath(request: OzChatRequest): OzPolicyPath {
  const text = String(request.message ?? '').trim().toLowerCase()
  if (!text) return 'hardcoded'
  if (text === 'ping' || text.startsWith('/help')) return 'hardcoded'
  return 'agent'
}

function hardcodedReplyFor(message: string): string {
  const text = message.trim().toLowerCase()
  if (!text) return 'Please enter a message so Oz can respond.'
  if (text === 'ping') return 'pong'
  if (text.startsWith('/help')) return 'Oz runtime scaffold is online. Use normal chat text for the agent path.'
  return 'Hardcoded policy path selected.'
}

function logToolSequenceForMisroute(payload: { route_kind: string; steps: Array<{ name: string; ok: boolean }> }): void {
  if (process.env.OZ_CHAT_LOG_TOOL_SEQUENCE !== '1') return
  try {
    console.error(`[oz-chat-tool-sequence] ${JSON.stringify({ ts: new Date().toISOString(), ...payload })}`)
  } catch {
    /* ignore */
  }
}

export async function* runOzChatLoop(
  request: OzChatRequest,
  deps: RuntimeDependencies = {},
): AsyncGenerator<OzChatStreamEvent> {
  const now = deps.now ?? (() => new Date())
  const runtimeStartedMs = nowMs(now)
  const contractVersion = request.contract_version || OZ_CHAT_CONTRACT_VERSION
  const route = parseOzChatRoutePrefix(String(request.message ?? ''))
  const message = route.bareMessage.trim()
  const policyPath = choosePolicyPath({ ...request, message: route.bareMessage })
  const toolSequence: Array<{ name: string; ok: boolean }> = []
  const registrySnapshot = ozChatOpenAiToolDefinitions()
  let sequence = 0
  let toolFailureCount = 0
  let toolSuccessCount = 0

  const base = () => ({
    contract_version: contractVersion,
    sequence: sequence++,
    timestamp: now().toISOString(),
    trace_id: request.trace_id,
    conversation_id: request.conversation_id,
  })
  const makeLatency = (startedMs: number) => Math.max(0, nowMs(now) - startedMs)

  yield {
    ...base(),
    type: 'trace',
    stage: 'policy_gate',
    decision: policyPath,
    details: {
      reason: policyPath === 'hardcoded' ? 'deterministic text match' : 'fallback to runtime loop',
    },
  }

  const sandboxTraceDetails = getOzChatSandboxTraceDetails()
  if (sandboxTraceDetails) {
    yield {
      ...base(),
      type: 'trace',
      stage: 'runtime_summary',
      decision: 'availability',
      details: sandboxTraceDetails,
    }
  }

  if (policyPath === 'hardcoded') {
    const reply = hardcodedReplyFor(message)
    yield {
      ...base(),
      type: 'trace',
      stage: 'runtime_summary',
      decision: 'complete',
      details: {
        policy_path: policyPath,
        latency_ms: makeLatency(runtimeStartedMs),
        tools_ok: toolSuccessCount,
        tools_failed: toolFailureCount,
      },
    }
    yield { ...base(), type: 'token', delta: reply }
    yield { ...base(), type: 'done', message: reply, finish_reason: 'stop' }
    return
  }

  const graphLimits = resolveGraphTraversalLimits(deps.graph?.limits)
  const toolSurface = createOzToolSurface(request, deps)
  const recallAdapter = deps.memory?.recallAdapter ?? noopMemoryRecall
  const writeAdapter = deps.memory?.writeAdapter ?? noopMemoryWrite

  yield {
    ...base(),
    type: 'trace',
    stage: 'route_prefix',
    decision: route.kind,
    details: {
      stripped_prefix: route.kind !== 'none',
      registry_prompt_version: OZ_CHAT_SYSTEM_PROMPT_VERSION,
      openai_tool_defs_count: registrySnapshot.length,
    },
  }

  if (route.systemNote) {
    yield {
      ...base(),
      type: 'trace',
      stage: 'route_system_note',
      decision: 'append',
      details: {
        note: route.systemNote,
      },
    }
  }

  // Runtime loop scaffold with tool registry wiring (OpenAI tool schemas authored in ozChatToolRegistry.ts).
  yield {
    ...base(),
    type: 'trace',
    stage: 'runtime_loop',
    decision: 'agent_stub',
    details: {
      step: 'plan_and_tools',
      tools_enabled: true,
      tools: Object.keys(toolSurface),
      graph_limits: graphLimits,
    },
  }

  let recalledCount = 0
  let recalledProvenance: string | undefined
  try {
    const recalledItems = await recallAdapter({
      query: message,
      conversation_id: request.conversation_id,
      trace_id: request.trace_id,
      rag_scope: defaultScopeFor(request),
    })
    const sanitized = recalledItems.map(sanitizeMemoryItem).filter((item) => item.content.length > 0)
    recalledCount = sanitized.length
    recalledProvenance = sanitized[0]?.provenance
    yield {
      ...base(),
      type: 'trace',
      stage: 'memory_recall',
      decision: 'ok',
      details: {
        items: recalledCount,
        provenance: recalledProvenance,
      },
    }
  } catch (error) {
    yield {
      ...base(),
      type: 'trace',
      stage: 'memory_recall',
      decision: 'error',
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }

  const writeInput = sanitizeMemoryWrite({
    content: message,
    confidence: 0.85,
    provenance: 'oz-chat-user-input',
    ttl_seconds: DEFAULT_MEMORY_TTL_SECONDS,
    conversation_id: request.conversation_id,
    trace_id: request.trace_id,
  })
  const writePolicy = evaluateMemoryWritePolicy(writeInput)
  yield {
    ...base(),
    type: 'trace',
    stage: 'memory_write_policy',
    decision: writePolicy.allowed ? 'allow' : 'deny',
    details: {
      confidence: writeInput.confidence,
      provenance: writeInput.provenance,
      ttl_seconds: writeInput.ttl_seconds,
      reasons: writePolicy.reasons,
    },
  }
  if (writePolicy.allowed) {
    try {
      const writeResult = await writeAdapter(writeInput)
      yield {
        ...base(),
        type: 'trace',
        stage: 'memory_write',
        decision: writeResult.accepted ? 'accepted' : 'rejected',
        details: { reason: writeResult.reason },
      }
    } catch (error) {
      yield {
        ...base(),
        type: 'trace',
        stage: 'memory_write',
        decision: 'error',
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }

  const searchToolCallId = `tool-search-transcripts-${sequence}`
  const searchArgs = {
    query: message,
    scope: defaultScopeFor(request),
    top_k: 8,
  }
  yield {
    ...base(),
    type: 'tool_call',
    tool_call_id: searchToolCallId,
    name: 'search_transcripts',
    arguments: searchArgs,
  }

  let searchResult: TranscriptSearchResult | null = null
  const searchStartedMs = nowMs(now)
  try {
    searchResult = await toolSurface.search_transcripts(searchArgs)
    toolSuccessCount += 1
    yield {
      ...base(),
      type: 'tool_result',
      tool_call_id: searchToolCallId,
      name: 'search_transcripts',
      ok: true,
      summary: `Retrieved ${searchResult.hits.length} transcript chunks`,
      result_meta: {
        scope: searchResult.scope,
        provenance: searchResult.provenance,
        citations: searchResult.citations,
      },
    }
    toolSequence.push({ name: 'search_transcripts', ok: true })
    yield {
      ...base(),
      type: 'trace',
      stage: 'tool_latency',
      decision: 'ok',
      details: {
        tool_name: 'search_transcripts',
        latency_ms: makeLatency(searchStartedMs),
      },
    }
  } catch (error) {
    toolFailureCount += 1
    yield {
      ...base(),
      type: 'tool_result',
      tool_call_id: searchToolCallId,
      name: 'search_transcripts',
      ok: false,
      summary: error instanceof Error ? error.message : String(error),
    }
    toolSequence.push({ name: 'search_transcripts', ok: false })
    yield {
      ...base(),
      type: 'trace',
      stage: 'tool_latency',
      decision: 'error',
      details: {
        tool_name: 'search_transcripts',
        latency_ms: makeLatency(searchStartedMs),
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }

  let readResult: TranscriptReadResult | null = null
  if (searchResult?.hits.length) {
    const topHit = searchResult.hits[0]
    const readToolCallId = `tool-read-transcript-${sequence}`
    const readArgs = { call_id: topHit.call_id, scope: searchResult.scope, max_chunks: 6 }
    const readStartedMs = nowMs(now)
    yield {
      ...base(),
      type: 'tool_call',
      tool_call_id: readToolCallId,
      name: 'read_transcript',
      arguments: readArgs,
    }
    try {
      readResult = await toolSurface.read_transcript(readArgs)
      toolSuccessCount += 1
      yield {
        ...base(),
        type: 'tool_result',
        tool_call_id: readToolCallId,
        name: 'read_transcript',
        ok: true,
        summary: `Loaded ${readResult.chunks.length} chunks from ${readResult.call_id}`,
        result_meta: {
          call_id: readResult.call_id,
          provenance: readResult.provenance,
          citations: readResult.citations,
        },
      }
      toolSequence.push({ name: 'read_transcript', ok: true })
      yield {
        ...base(),
        type: 'trace',
        stage: 'tool_latency',
        decision: 'ok',
        details: {
          tool_name: 'read_transcript',
          latency_ms: makeLatency(readStartedMs),
        },
      }
    } catch (error) {
      toolFailureCount += 1
      yield {
        ...base(),
        type: 'tool_result',
        tool_call_id: readToolCallId,
        name: 'read_transcript',
        ok: false,
        summary: error instanceof Error ? error.message : String(error),
      }
      toolSequence.push({ name: 'read_transcript', ok: false })
      yield {
        ...base(),
        type: 'trace',
        stage: 'tool_latency',
        decision: 'error',
        details: {
          tool_name: 'read_transcript',
          latency_ms: makeLatency(readStartedMs),
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }

  const kbToolCallId = `tool-kb-search-${sequence}`
  const kbArgs = {
    query: message,
    surface: 'global' as const,
    k: 8,
  }
  yield {
    ...base(),
    type: 'tool_call',
    tool_call_id: kbToolCallId,
    name: 'kb_search',
    arguments: kbArgs,
  }

  let kbResult: KbSearchToolResult | null = null
  const kbStartedMs = nowMs(now)
  try {
    kbResult = await toolSurface.kb_search(kbArgs)
    toolSuccessCount += 1
    yield {
      ...base(),
      type: 'tool_result',
      tool_call_id: kbToolCallId,
      name: 'kb_search',
      ok: true,
      summary: `Retrieved ${kbResult.chunks.length} kb/call chunk(s) (${kbResult.surface})`,
      result_meta: {
        surface: kbResult.surface,
        provenance: kbResult.provenance,
        top_chunk_id: kbResult.chunks[0]?.chunk_id,
      },
    }
    toolSequence.push({ name: 'kb_search', ok: true })
    yield {
      ...base(),
      type: 'trace',
      stage: 'tool_latency',
      decision: 'ok',
      details: {
        tool_name: 'kb_search',
        latency_ms: makeLatency(kbStartedMs),
      },
    }
  } catch (error) {
    toolFailureCount += 1
    yield {
      ...base(),
      type: 'tool_result',
      tool_call_id: kbToolCallId,
      name: 'kb_search',
      ok: false,
      summary: error instanceof Error ? error.message : String(error),
    }
    toolSequence.push({ name: 'kb_search', ok: false })
    yield {
      ...base(),
      type: 'trace',
      stage: 'tool_latency',
      decision: 'error',
      details: {
        tool_name: 'kb_search',
        latency_ms: makeLatency(kbStartedMs),
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }

  logToolSequenceForMisroute({ route_kind: route.kind, steps: toolSequence })

  yield {
    ...base(),
    type: 'trace',
    stage: 'tool_sequence',
    decision: 'complete',
    details: {
      route_kind: route.kind,
      steps: toolSequence,
      registry_prompt_version: OZ_CHAT_SYSTEM_PROMPT_VERSION,
    },
  }

  const recallSuffix = recalledCount
    ? ` Loaded ${recalledCount} memory item(s)${recalledProvenance ? ` from ${recalledProvenance}` : ''}.`
    : ''
  const topHit = searchResult?.hits[0]
  const transcriptSuffix = topHit
    ? ` Top transcript evidence: ${topHit.call_id} chunk ${topHit.chunk_index} (rep ${topHit.owner_user_id}).`
    : ' Transcript evidence lookup returned no hits for this scope.'
  const topKb = kbResult?.chunks[0]
  const kbSuffix =
    topKb && kbResult
      ? ` KB search (${kbResult.surface}): ${kbResult.chunks.length} chunk(s). Top match ${topKb.chunk_id} [${topKb.locator}]: ${topKb.content.slice(0, 500).trim()}${topKb.content.length > 500 ? '…' : ''}`
      : ' KB document search returned no chunks (configure DATABASE_URL + OPENAI_API_KEY, or ingest into kb_rag_chunks).'
  const agentReply = `Oz runtime executed transcript + kb_search tools.${recallSuffix}${transcriptSuffix}${kbSuffix}`

  const filingEvidence = {
    kbHits: kbResult?.chunks,
    transcriptHits: searchResult?.hits,
  }

  if (deps.trackC?.scaffold) {
    const tc = deps.trackC.scaffold
    const repoRoot = tc.getRepoRoot()
    const novelty = await evaluateFilingNovelty({
      userQuestion: message,
      assistantAnswer: agentReply,
      scaffold: tc,
      evidence: filingEvidence,
    })
    yield {
      ...base(),
      type: 'trace',
      stage: 'filing_novelty',
      decision: novelty.offer_filing ? 'offer' : 'suppress',
      details: {
        distinct_source_count: novelty.distinct_source_count,
        reasons: novelty.reasons,
        wiki_top_score: novelty.wiki_top_score,
        wiki_top_path: novelty.wiki_top_path,
      },
    }

    if (!novelty.offer_filing) {
      try {
        const { keys } = collectDistinctEvidenceSources(agentReply, filingEvidence)
        await appendSkippedFilingQueryEvent(repoRoot, {
          question: message,
          reasons: novelty.reasons,
          distinct_source_count: novelty.distinct_source_count,
          citations_compact: compactCitationList(agentReply, keys),
          trace_id: request.trace_id,
          conversation_id: request.conversation_id,
        })
        yield {
          ...base(),
          type: 'trace',
          stage: 'filing_skip_log',
          decision: 'appended',
          details: { path: 'wiki/log.md' },
        }
      } catch (error) {
        yield {
          ...base(),
          type: 'trace',
          stage: 'filing_skip_log',
          decision: 'error',
          details: { message: error instanceof Error ? error.message : String(error) },
        }
      }
    } else {
      const slug = slugifyFilingSegment(message)
      const curator = await runFilingCuratorAgent({
        repoRoot,
        candidateBody: agentReply,
        suggestedSlug: slug,
        title: message.slice(0, 120),
        nowIsoDate: now().toISOString().slice(0, 10),
        write: false,
      })
      yield {
        ...base(),
        type: 'trace',
        stage: 'filing_curator',
        decision: curator.action === 'merge_suggestion' ? 'merge_suggestion' : 'create_draft',
        details: {
          action: curator.action,
          ...(curator.action === 'merge_suggestion'
            ? { target: curator.target_relative_path, similarity: curator.similarity, note: curator.note }
            : { relative_path: curator.relative_path, wrote: curator.wrote }),
        },
      }
    }
  }

  yield {
    ...base(),
    type: 'trace',
    stage: 'runtime_summary',
    decision: 'complete',
    details: {
      policy_path: policyPath,
      latency_ms: makeLatency(runtimeStartedMs),
      tools_ok: toolSuccessCount,
      tools_failed: toolFailureCount,
    },
  }
  yield { ...base(), type: 'token', delta: agentReply }
  yield {
    ...base(),
    type: 'done',
    message: agentReply,
    finish_reason: 'stop',
    citations: searchResult?.citations?.length ? searchResult.citations : readResult?.citations,
  }
}
