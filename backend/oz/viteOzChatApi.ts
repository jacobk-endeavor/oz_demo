import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import pg from 'pg'
import { buildOzChatAgentManifest } from './ozChatAgentManifest'
import { OZ_CHAT_CONTRACT_VERSION, runOzChatLoop, type OzChatRequest, type OzChatStreamEvent } from './chatRuntime'
import { runOzChatLoopAgentic } from './chatRuntimeAgentic'
import { runOzChatLoopAgenticOpenAi } from './chatRuntimeAgenticOpenAi'
import { loadOzConfig, type OzChatAgenticProvider, type OzChatRuntimeKind } from './ozConfig'
import { TrackCToolScaffold } from './trackCToolScaffold'
import type { OzThreadDirectionPutInput } from './threadDirectionNormalize'
import { resolveOzTenant, sanitizeThreadDirectionPut } from './threadDirectionNormalize'
import {
  fetchOzThreadDirection,
  getOzThreadDirectionDb,
  upsertOzThreadDirection,
} from './threadDirectionPg'

// Canonical API route for the unified Oz runtime.
const OZ_CHAT_PATH = '/api/oz/chat'
/** GET JSON manifest (system prompt + OpenAI-style tool defs) for external agents / consumers. */
const OZ_CHAT_MANIFEST_PATH = '/api/oz/chat/manifest'
/** GET JSON snapshot of current chat-runtime defaults from config/oz.yaml; UI toggle reads it. */
const OZ_CHAT_CONFIG_PATH = '/api/oz/chat/config'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
// `backend/oz` lives under repo root; env is loaded from root to match existing project behavior.
const REPO_ROOT = path.resolve(__dirname, '../..')

// Anchor TrackCToolScaffold paths to REPO_ROOT regardless of where vite is launched from
// (its cwd is `frontend/`, so process.cwd()-relative defaults inside the scaffold land in
// the wrong directory and every wiki/catalog tool returns "not found"). Only set what's
// not already overridden so users can still customize via .env if needed.
function ensureOzPathDefault(envKey: string, fallback: string): void {
  if (!process.env[envKey]) process.env[envKey] = fallback
}
ensureOzPathDefault('OZ_REPO_ROOT', REPO_ROOT)
ensureOzPathDefault('OZ_WIKI_ROOT_PATH', path.join(REPO_ROOT, 'wiki'))
ensureOzPathDefault('OZ_KB_EXTRACTS_ROOT', path.join(REPO_ROOT, 'kb_extracts'))
// product_catalog_flat.json is the array-of-SKU shape the scaffold expects;
// product_catalog.json (hierarchical: product_lines→sub_categories→products) does not match.
ensureOzPathDefault('OZ_PRODUCT_CATALOG_PATH', path.join(REPO_ROOT, 'product_catalog_flat.json'))
// recommendations_flat.json is a flat row array of {rule_kind, sub_category|from_sku, recommend, ...};
// recommendations.json from the analytics export groups by anchor and uses different field names per kind.
// Regenerate with `npx tsx scripts/build-flat-recommendations.ts` whenever the source refreshes.
ensureOzPathDefault('OZ_RECOMMENDATIONS_PATH', path.join(REPO_ROOT, 'recommendations_flat.json'))

// TrackCToolScaffold's kb_search reads from DATABASE_READONLY_URL || DATABASE_URL.
// `.env` here uses individual PG* vars (matching ingest_kb.py), so build a URL from
// them so the wired pgvector kb_search path activates instead of returning the stub.
function buildDatabaseUrlFromPgVars(): string | undefined {
  const env = (() => {
    try {
      return readEnv()
    } catch {
      return process.env as unknown as Record<string, string>
    }
  })()
  const get = (k: string) => (process.env[k] || env[k] || '').trim()
  const host = get('PGHOST')
  const user = get('PGUSER')
  const password = get('PGPASSWORD')
  const database = get('PGDATABASE') || 'defaultdb'
  if (!host || !user || !password) return undefined
  const port = get('PGPORT') || '5432'
  // Managed Postgres providers (DigitalOcean, etc.) use a custom CA that Node's
  // default trust store doesn't include. pg-connection-string's `sslmode=require`
  // currently aliases to `verify-full` and rejects the chain, even when we pass
  // `ssl: { rejectUnauthorized: false }` to Pool — its own parsing wins. Use
  // `no-verify` (pg's escape hatch) so TLS is on but the chain isn't checked,
  // matching what psycopg does in ingest_kb.py with sslmode=require.
  const requested = (get('PGSSLMODE') || 'require').toLowerCase()
  const strict = process.env.PGSSL_REJECT_UNAUTHORIZED === '1'
  const sslmode = strict ? requested : 'no-verify'
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=${sslmode}`
}
if (!process.env.DATABASE_URL && !process.env.DATABASE_READONLY_URL) {
  const url = buildDatabaseUrlFromPgVars()
  if (url) process.env.DATABASE_URL = url
}

// Managed Postgres providers (e.g. DigitalOcean) issue certs from a custom CA;
// when the Node runtime doesn't bundle that CA, the pg client throws
// "self-signed certificate in certificate chain" even though the connection
// is otherwise correct (psycopg in ingest_kb.py allows it because sslmode=require
// there does not verify the chain). Mirror that behavior in JS unless an explicit
// override (PGSSL_REJECT_UNAUTHORIZED=1) is set.
function buildPoolSsl(connectionString: string): undefined | { rejectUnauthorized: boolean } {
  const wantsTls = /sslmode=(require|verify-ca|verify-full)/i.test(connectionString)
  if (!wantsTls) return undefined
  if (process.env.PGSSL_REJECT_UNAUTHORIZED === '1') return { rejectUnauthorized: true }
  return { rejectUnauthorized: false }
}

const trackCScaffold = new TrackCToolScaffold({
  readEnv,
  poolFactory: (connectionString) =>
    new pg.Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      application_name: 'oz-track-c-tools-readonly',
      ssl: buildPoolSsl(connectionString),
    }),
})
const initTrackCScaffold = trackCScaffold.initialize()

function normalizedUrlPath(url: string | undefined): string {
  const pathOnly = url?.split('?')[0] ?? ''
  const trimmed = pathOnly.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** GET/PUT /api/oz/chat/thread/<id>/direction (prefix-safe: matches .../api/oz/chat/... in preview). */
function parseOzThreadDirectionPath(urlPath: string): { threadId: string } | null {
  const trimmed = urlPath.replace(/\/+$/, '')
  const needle = '/api/oz/chat/thread/'
  const idx = trimmed.lastIndexOf(needle)
  if (idx === -1) return null
  const rest = trimmed.slice(idx + needle.length)
  const segments = rest.split('/').filter(Boolean)
  if (segments.length !== 2 || segments[1] !== 'direction') return null
  try {
    const threadId = decodeURIComponent(segments[0])
    return threadId ? { threadId } : null
  } catch {
    return null
  }
}

function isOzChatPost(req: IncomingMessage): boolean {
  if (req.method !== 'POST') return false
  const path = normalizedUrlPath(req.url)
  // Accept exact match and prefixed paths so preview/proxy setups still resolve correctly.
  return path === OZ_CHAT_PATH || path.endsWith(OZ_CHAT_PATH)
}

function isOzChatManifestGet(req: IncomingMessage): boolean {
  if (req.method !== 'GET') return false
  const path = normalizedUrlPath(req.url)
  return path === OZ_CHAT_MANIFEST_PATH || path.endsWith(OZ_CHAT_MANIFEST_PATH)
}

function isOzChatConfigGet(req: IncomingMessage): boolean {
  if (req.method !== 'GET') return false
  const path = normalizedUrlPath(req.url)
  return path === OZ_CHAT_CONFIG_PATH || path.endsWith(OZ_CHAT_CONFIG_PATH)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function writeSseFrame(res: ServerResponse, event: OzChatStreamEvent): void {
  // Every SSE frame is one JSON event on a `data:` line.
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function writeSseDone(res: ServerResponse, message: string): void {
  // Error fallback: still emit a terminal `done` event so client can close cleanly.
  const doneEvent: OzChatStreamEvent = {
    type: 'done',
    contract_version: OZ_CHAT_CONTRACT_VERSION,
    sequence: Number.MAX_SAFE_INTEGER,
    timestamp: new Date().toISOString(),
    message,
    finish_reason: 'error',
  }
  writeSseFrame(res, doneEvent)
}

function normalizedTraceId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function resolveTraceId(req: IncomingMessage, parsed: OzChatRequest): string {
  // Prefer client-provided trace IDs for correlation; otherwise generate one server-side.
  return (
    normalizedTraceId(parsed.trace_id) ||
    normalizedTraceId(req.headers['x-oz-trace-id']) ||
    normalizedTraceId(req.headers['x-trace-id']) ||
    randomUUID()
  )
}

function readEnv(): Record<string, string> {
  // Keep env-loading local so runtime picks up latest values across dev restarts.
  const root = loadEnv(process.env.NODE_ENV || 'development', REPO_ROOT, '')
  return root
}

function openAiKey(): string | undefined {
  const env = readEnv()
  return (process.env.OPENAI_API_KEY || env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY)?.trim()
}

function anthropicKey(): string | undefined {
  const env = readEnv()
  return (process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY)?.trim()
}

function resolveRuntimeKind(
  bodyMode: unknown,
  configured: OzChatRuntimeKind,
): { kind: OzChatRuntimeKind; source: 'request' | 'config' } {
  if (bodyMode === 'scaffold' || bodyMode === 'agentic') {
    return { kind: bodyMode, source: 'request' }
  }
  return { kind: configured, source: 'config' }
}

type AgenticProviderResolution =
  | { provider: 'openai'; apiKey: string }
  | { provider: 'anthropic'; apiKey: string }
  | { provider: null; reason: string }

function resolveAgenticProvider(preference: OzChatAgenticProvider): AgenticProviderResolution {
  const openai = openAiKey()
  const anthropic = anthropicKey()
  if (preference === 'openai') {
    if (openai) return { provider: 'openai', apiKey: openai }
    return { provider: null, reason: 'OPENAI_API_KEY missing (provider preference: openai)' }
  }
  if (preference === 'anthropic') {
    if (anthropic) return { provider: 'anthropic', apiKey: anthropic }
    return { provider: null, reason: 'ANTHROPIC_API_KEY missing (provider preference: anthropic)' }
  }
  // auto: prefer OpenAI when both present (matches the existing OpenAI-shaped tool defs natively).
  if (openai) return { provider: 'openai', apiKey: openai }
  if (anthropic) return { provider: 'anthropic', apiKey: anthropic }
  return { provider: null, reason: 'No agentic provider key set (looked for OPENAI_API_KEY then ANTHROPIC_API_KEY)' }
}

export function ozChatApiPlugin() {
  async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (isOzChatManifestGet(req)) {
      try {
        const manifest = buildOzChatAgentManifest()
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('x-oz-chat-contract-version', manifest.contract_version)
        res.setHeader('x-oz-registry-prompt-version', manifest.registry_prompt_version)
        res.end(JSON.stringify(manifest))
      } catch (error) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
      }
      return
    }

    if (isOzChatConfigGet(req)) {
      try {
        const config = await loadOzConfig(REPO_ROOT)
        const preference = config.chat.agentic?.provider ?? 'auto'
        const resolution = resolveAgenticProvider(preference)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(
          JSON.stringify({
            chat: {
              runtime: config.chat.runtime,
              agentic: config.chat.agentic ?? null,
            },
            sandbox: {
              imageDigest: config.sandbox?.imageDigest ?? null,
            },
            agentic_available: resolution.provider !== null,
            agentic_provider: resolution.provider, // 'openai' | 'anthropic' | null
            providers_available: {
              openai: Boolean(openAiKey()),
              anthropic: Boolean(anthropicKey()),
            },
          }),
        )
      } catch (error) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
      }
      return
    }

    const pathForExtras = normalizedUrlPath(req.url)
    const threadDirection = parseOzThreadDirectionPath(pathForExtras)
    if (threadDirection && (req.method === 'GET' || req.method === 'PUT')) {
      try {
        const db = getOzThreadDirectionDb(readEnv)
        if (!db) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ error: 'oz_thread_direction requires DATABASE_URL' }))
          return
        }
        const tenant = resolveOzTenant(readEnv)
        if (req.method === 'GET') {
          const row = await fetchOzThreadDirection(db, threadDirection.threadId, tenant)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(row === null ? 'null' : JSON.stringify(row))
          return
        }
        const raw = await readBody(req)
        let parsedBody: unknown = {}
        if (String(raw ?? '').trim()) {
          try {
            parsedBody = JSON.parse(String(raw)) as unknown
          } catch {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: 'Invalid JSON body' }))
            return
          }
        }
        const sanitized = sanitizeThreadDirectionPut((parsedBody ?? {}) as OzThreadDirectionPutInput)
        const row = await upsertOzThreadDirection(db, threadDirection.threadId, tenant, sanitized)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(row))
        return
      } catch (error) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        return
      }
    }
    if (threadDirection) {
      res.statusCode = 405
      res.setHeader('Allow', 'GET, PUT')
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }

    // Only intercept the Oz chat POST route; all other requests continue down Vite middleware chain.
    if (!isOzChatPost(req)) {
      next()
      return
    }

    let parsed: OzChatRequest
    try {
      parsed = JSON.parse(await readBody(req)) as OzChatRequest
    } catch {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Invalid JSON body' }))
      return
    }

    const message = String(parsed.message ?? '').trim()
    if (!message) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'message is required' }))
      return
    }

    const contractVersion = parsed.contract_version || OZ_CHAT_CONTRACT_VERSION
    // Normalize request so downstream runtime always receives required, clean metadata.
    const request: OzChatRequest = {
      ...parsed,
      message,
      contract_version: contractVersion,
      trace_id: resolveTraceId(req, parsed),
    }

    res.statusCode = 200
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('x-oz-chat-contract-version', contractVersion)
    res.setHeader('x-oz-trace-id', request.trace_id ?? '')

    const httpStarted = Date.now()
    let sseFrames = 0

    try {
      await initTrackCScaffold
      await trackCScaffold.refreshBetweenTurns()
      const dbQuery = trackCScaffold.readOnlyDbQuery()
      const config = await loadOzConfig(REPO_ROOT)
      const resolved = resolveRuntimeKind(parsed.mode, config.chat.runtime)
      const auditDep =
        process.env.OZ_TOOL_AUDIT === '1'
          ? {
              onComplete: (payload: {
                tool: string
                ok: boolean
                latency_ms: number
                args_summary: string
                result_summary: string
              }) => {
                console.error(`[oz-tool-audit] ${JSON.stringify({ ts: new Date().toISOString(), ...payload })}`)
              },
            }
          : undefined
      const sharedDeps = {
        transcripts: { openAiApiKey: openAiKey(), dbQuery },
        catalog: {
          registry: {
            async catalog_get(payload: { sku: string }) {
              return trackCScaffold.catalog_get(payload.sku)
            },
            async catalog_list(payload: Parameters<TrackCToolScaffold['catalog_list']>[0]) {
              return trackCScaffold.catalog_list(payload)
            },
          },
        },
        wiki: {
          registry: {
            async wiki_read(payload: { path: string }) {
              return trackCScaffold.wiki_read(payload.path)
            },
            async wiki_grep(payload: { query: string; top_n?: number }) {
              return trackCScaffold.wiki_grep(payload.query, payload.top_n)
            },
            async wiki_log(payload: { kind?: string; since?: string; until?: string; top_n?: number }) {
              return trackCScaffold.wiki_log(payload)
            },
          },
        },
        trackC: { scaffold: trackCScaffold },
        audit: auditDep,
      }

      let runtimeIter: AsyncIterable<OzChatStreamEvent>
      let providerNote: { provider: 'openai' | 'anthropic' } | null = null
      if (resolved.kind === 'agentic') {
        const provider = resolveAgenticProvider(config.chat.agentic?.provider ?? 'auto')
        if (provider.provider === null) {
          writeSseFrame(res, {
            contract_version: contractVersion,
            sequence: 0,
            timestamp: new Date().toISOString(),
            type: 'trace',
            stage: 'mode_resolution',
            decision: 'fallback_scaffold',
            details: { requested: 'agentic', source: resolved.source, reason: provider.reason },
          })
          sseFrames += 1
          runtimeIter = runOzChatLoop(request, sharedDeps)
        } else if (provider.provider === 'openai') {
          providerNote = { provider: 'openai' }
          runtimeIter = runOzChatLoopAgenticOpenAi(request, {
            ...sharedDeps,
            openai: { apiKey: provider.apiKey, model: config.chat.agentic?.model },
          })
        } else {
          providerNote = { provider: 'anthropic' }
          runtimeIter = runOzChatLoopAgentic(request, {
            ...sharedDeps,
            anthropic: { apiKey: provider.apiKey, model: config.chat.agentic?.model },
          })
        }
      } else {
        runtimeIter = runOzChatLoop(request, sharedDeps)
      }

      writeSseFrame(res, {
        contract_version: contractVersion,
        sequence: 0,
        timestamp: new Date().toISOString(),
        type: 'trace',
        stage: 'mode_resolution',
        decision: resolved.kind,
        details: {
          source: resolved.source,
          configured: config.chat.runtime,
          ...(providerNote ? { provider: providerNote.provider } : {}),
        },
      })
      sseFrames += 1

      for await (const event of runtimeIter) {
        sseFrames += 1
        writeSseFrame(res, event)
      }
    } catch (error) {
      writeSseDone(res, error instanceof Error ? error.message : String(error))
    }

    if (process.env.OZ_CHAT_HTTP_LOG === '1') {
      const duration_ms = Math.max(0, Date.now() - httpStarted)
      try {
        console.error(
          `[oz-chat-http] ${JSON.stringify({
            ts: new Date().toISOString(),
            trace_id: request.trace_id,
            duration_ms,
            sse_frames: sseFrames,
            contract_version: contractVersion,
          })}`,
        )
      } catch {
        /* ignore */
      }
    }

    res.end()
  }

  return {
    name: 'oz-chat-api',
    enforce: 'pre' as const,
    // Register for both `vite dev` and `vite preview`.
    configureServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
  }
}
