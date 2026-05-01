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
import type { CatalogGetResult, CatalogListResult, WikiGrepResult, WikiLogResult, WikiReadResult } from './trackCToolScaffold'
import { createTranscriptToolRegistry, type TranscriptReadResult, type TranscriptSearchResult } from './transcriptRagTools'

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
}

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
}

function nowMs(now: () => Date): number {
  return now().getTime()
}

function defaultScopeFor(request: OzChatRequest): string | undefined {
  return request.ragScope?.trim() || undefined
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
  const catalogRegistry = deps.catalog?.registry ?? {
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
  }
  const wikiRegistry = deps.wiki?.registry ?? {
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
  }

  return {
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
  }
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

export async function* runOzChatLoop(
  request: OzChatRequest,
  deps: RuntimeDependencies = {},
): AsyncGenerator<OzChatStreamEvent> {
  const now = deps.now ?? (() => new Date())
  const runtimeStartedMs = nowMs(now)
  const contractVersion = request.contract_version || OZ_CHAT_CONTRACT_VERSION
  const message = String(request.message ?? '').trim()
  const policyPath = choosePolicyPath(request)
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

  // Runtime loop scaffold with tool registry wiring.
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

  const recallSuffix = recalledCount
    ? ` Loaded ${recalledCount} memory item(s)${recalledProvenance ? ` from ${recalledProvenance}` : ''}.`
    : ''
  const topHit = searchResult?.hits[0]
  const transcriptSuffix = topHit
    ? ` Top transcript evidence: ${topHit.call_id} chunk ${topHit.chunk_index} (rep ${topHit.owner_user_id}).`
    : ' Transcript evidence lookup returned no hits for this scope.'
  const agentReply = `Oz runtime executed transcript tools.${recallSuffix}${transcriptSuffix}`
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
