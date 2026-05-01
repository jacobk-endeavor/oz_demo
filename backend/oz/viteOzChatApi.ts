import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import pg from 'pg'
import { OZ_CHAT_CONTRACT_VERSION, runOzChatLoop, type OzChatRequest, type OzChatStreamEvent } from './chatRuntime'
import { TrackCToolScaffold } from './trackCToolScaffold'

// Canonical API route for the unified Oz runtime.
const OZ_CHAT_PATH = '/api/oz/chat'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
// `backend/oz` lives under repo root; env is loaded from root to match existing project behavior.
const REPO_ROOT = path.resolve(__dirname, '../..')
const trackCScaffold = new TrackCToolScaffold({
  readEnv,
  poolFactory: (connectionString) =>
    new pg.Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      application_name: 'oz-track-c-tools-readonly',
    }),
})
const initTrackCScaffold = trackCScaffold.initialize()

function normalizedUrlPath(url: string | undefined): string {
  const pathOnly = url?.split('?')[0] ?? ''
  const trimmed = pathOnly.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

function isOzChatPost(req: IncomingMessage): boolean {
  if (req.method !== 'POST') return false
  const path = normalizedUrlPath(req.url)
  // Accept exact match and prefixed paths so preview/proxy setups still resolve correctly.
  return path === OZ_CHAT_PATH || path.endsWith(OZ_CHAT_PATH)
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

export function ozChatApiPlugin() {
  async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
    // Only intercept the Oz chat route; all other requests continue down Vite middleware chain.
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

    try {
      await initTrackCScaffold
      await trackCScaffold.refreshBetweenTurns()
      const dbQuery = trackCScaffold.readOnlyDbQuery()
      // Runtime is an async generator: each yielded event is streamed to client as SSE.
      for await (const event of runOzChatLoop(request, {
        transcripts: {
          openAiApiKey: openAiKey(),
          dbQuery,
        },
        catalog: {
          registry: {
            async catalog_get(payload) {
              return trackCScaffold.catalog_get(payload.sku)
            },
            async catalog_list(payload) {
              return trackCScaffold.catalog_list(payload)
            },
          },
        },
      })) {
        writeSseFrame(res, event)
      }
    } catch (error) {
      writeSseDone(res, error instanceof Error ? error.message : String(error))
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
