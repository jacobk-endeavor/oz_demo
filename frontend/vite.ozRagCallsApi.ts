/**
 * Dev/preview API: pgvector RAG over `call_rag_chunks` (see calls/sauron/scripts/ingest_calls_pgvector.py).
 * `kb_search` retrieval: `POST /api/oz/kb-search` (kb_rag_chunks ∪ call_rag_chunks).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import pg from 'pg'
import {
  embedOpenAiText,
  OZ_DEMO_CALL_REP_IDS,
  runKbSearch,
  type KbSearchSurface,
} from '../backend/oz/kbSearchRag'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const OPENAI_EMBED = 'https://api.openai.com/v1/embeddings'
const OPENAI_CHAT = 'https://api.openai.com/v1/chat/completions'

/** Matches ingest `rep_name` values in calls_transcripts_only.json */
export const RAG_CALL_REP_IDS = OZ_DEMO_CALL_REP_IDS

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function openAiKey(mode: string): string | undefined {
  const fe = loadEnv(mode, __dirname, '')
  const root = loadEnv(mode, REPO_ROOT, '')
  return (
    process.env.OPENAI_API_KEY ||
    fe.OPENAI_API_KEY ||
    fe.VITE_OPENAI_API_KEY ||
    root.OPENAI_API_KEY ||
    root.VITE_OPENAI_API_KEY
  )?.trim()
}

function embedModel(mode: string): string {
  const root = loadEnv(mode, REPO_ROOT, '')
  return (root.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small').trim()
}

function chatModel(mode: string): string {
  const root = loadEnv(mode, REPO_ROOT, '')
  return (root.OPENAI_CHAT_MODEL || 'gpt-4o-mini').trim()
}

/** Higher = more paraphrase / synthesis across excerpts (still grounded). Env: OPENAI_RAG_CHAT_TEMPERATURE */
function ragChatTemperature(mode: string): number {
  const root = loadEnv(mode, REPO_ROOT, '')
  const raw = String(
    root.OPENAI_RAG_CHAT_TEMPERATURE ?? process.env.OPENAI_RAG_CHAT_TEMPERATURE ?? '',
  ).trim()
  if (!raw) return 0.35
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? Math.min(2, Math.max(0, n)) : 0.35
}

/** Default chunk count when the client omits topK. Env: OPENAI_RAG_TOP_K (clamped 4–24). */
function ragTopKDefault(mode: string): number {
  const root = loadEnv(mode, REPO_ROOT, '')
  const raw = String(root.OPENAI_RAG_TOP_K ?? process.env.OPENAI_RAG_TOP_K ?? '').trim()
  if (!raw) return 18
  const n = Number.parseInt(raw, 10)
  return Math.min(24, Math.max(4, Number.isFinite(n) ? n : 18))
}

/** Env: OPENAI_RAG_MAX_OUTPUT_TOKENS */
function ragMaxOutputTokens(mode: string): number {
  const root = loadEnv(mode, REPO_ROOT, '')
  const raw = String(root.OPENAI_RAG_MAX_OUTPUT_TOKENS ?? process.env.OPENAI_RAG_MAX_OUTPUT_TOKENS ?? '').trim()
  if (!raw) return 2_000
  const n = Number.parseInt(raw, 10)
  return Math.min(4_096, Math.max(256, Number.isFinite(n) ? n : 2_000))
}

let pool: pg.Pool | null = null

function getPool(mode: string): pg.Pool | null {
  if (pool) return pool
  const root = loadEnv(mode, REPO_ROOT, '')
  const url = (root.DATABASE_URL || '').trim()
  const host = (root.PGHOST || '').trim()
  const user = (root.PGUSER || '').trim()
  const password = (root.PGPASSWORD || '').trim()
  const database = (root.PGDATABASE || 'defaultdb').trim()
  const port = Number.parseInt(root.PGPORT || '5432', 10)
  const sslmode = (root.PGSSLMODE || 'require').trim().toLowerCase()

  if (url) {
    pool = new pg.Pool({
      connectionString: url,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    })
    return pool
  }
  if (!host || !user || password === '' || !database) return null

  pool = new pg.Pool({
    host,
    port: Number.isFinite(port) ? port : 5432,
    user,
    password,
    database,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    ssl: sslmode === 'disable' ? undefined : { rejectUnauthorized: false },
  })
  return pool
}

type ChunkRow = {
  chunk_id: string
  call_id: string
  owner_user_id: string
  chunk_index: number
  content: string
  dist: number
}

const RAG_CALLS_PATH = '/api/oz/rag-calls'
const KB_SEARCH_PATH = '/api/oz/kb-search'

function normalizedUrlPath(url: string | undefined): string {
  const pathOnly = url?.split('?')[0] ?? ''
  const trimmed = pathOnly.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

function isRagCallsPost(req: IncomingMessage): boolean {
  if (req.method !== 'POST') return false
  const p = normalizedUrlPath(req.url)
  return p === RAG_CALLS_PATH || p.endsWith(RAG_CALLS_PATH)
}

function isKbSearchPost(req: IncomingMessage): boolean {
  if (req.method !== 'POST') return false
  const p = normalizedUrlPath(req.url)
  return p === KB_SEARCH_PATH || p.endsWith(KB_SEARCH_PATH)
}

export function ozRagCallsApiPlugin(mode: string) {
  async function kbSearchHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const key = openAiKey(mode)
    if (!key) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: false,
          error: 'Set OPENAI_API_KEY in repo .env for kb_search embeddings.',
        }),
      )
      return
    }

    const db = getPool(mode)
    if (!db) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: false,
          error:
            'Database not configured. Set DATABASE_URL or PGHOST, PGUSER, PGPASSWORD, PGDATABASE in repo .env.',
        }),
      )
      return
    }

    let body: {
      query?: string
      surface?: KbSearchSurface
      kb_scope?: KbSearchSurface
      k?: number
      kind?: string
      call_scope?: string
    }
    try {
      body = JSON.parse(await readBody(req)) as typeof body
    } catch {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
      return
    }

    const query = (body.query ?? '').trim()
    if (!query) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'query required' }))
      return
    }

    const surfaceRaw = body.surface ?? body.kb_scope
    const surface: KbSearchSurface =
      surfaceRaw === 'kb' || surfaceRaw === 'call' || surfaceRaw === 'global' ? surfaceRaw : 'global'

    try {
      const embedModelName = embedModel(mode)
      const chunks = await runKbSearch(
        {
          dbQuery: async <T>(sql: string, params: unknown[]) => {
            const r = await db.query(sql, params)
            return { rows: r.rows as T[] }
          },
          embedQuery: (text) =>
            embedOpenAiText({ apiKey: key, model: embedModelName, text, fetchImpl: fetch }),
        },
        {
          query,
          surface,
          k: Number(body.k),
          kind: body.kind,
          call_scope: body.call_scope,
          validRepIds: OZ_DEMO_CALL_REP_IDS,
        },
      )

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, surface, query, chunks }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      res.statusCode = msg.includes('call_scope') ? 400 : 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: msg }))
    }
  }

  async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (isKbSearchPost(req)) {
      await kbSearchHandler(req, res)
      return
    }

    if (!isRagCallsPost(req)) {
      next()
      return
    }

    const key = openAiKey(mode)
    if (!key) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: false,
          error: 'Set OPENAI_API_KEY in repo .env for RAG chat.',
        }),
      )
      return
    }

    const db = getPool(mode)
    if (!db) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: false,
          error:
            'Database not configured. Set DATABASE_URL or PGHOST, PGUSER, PGPASSWORD, PGDATABASE in repo .env.',
        }),
      )
      return
    }

    let body: { query?: string; scope?: 'admin' | string; topK?: number }
    try {
      body = JSON.parse(await readBody(req)) as typeof body
    } catch {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
      return
    }

    const query = (body.query ?? '').trim()
    if (!query) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'query required' }))
      return
    }

    const scopeRaw = body.scope === 'admin' ? 'admin' : String(body.scope ?? '').trim()
    const isAdmin = scopeRaw === 'admin'
    const ownerFilter = isAdmin ? null : scopeRaw
    if (!isAdmin && !RAG_CALL_REP_IDS.includes(ownerFilter as (typeof RAG_CALL_REP_IDS)[number])) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: false,
          error: `scope must be "admin" or one of: ${RAG_CALL_REP_IDS.join(', ')}`,
        }),
      )
      return
    }

    const topK = Math.min(24, Math.max(4, Number(body.topK) || ragTopKDefault(mode)))

    try {
      const embResp = await fetch(OPENAI_EMBED, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: embedModel(mode),
          input: query,
        }),
      })
      const embText = await embResp.text()
      if (!embResp.ok) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Embedding request failed', detail: embText.slice(0, 400) }))
        return
      }
      const embJson = JSON.parse(embText) as { data?: { embedding?: number[] }[] }
      const embedding = embJson.data?.[0]?.embedding
      if (!embedding?.length) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'No embedding returned' }))
        return
      }

      const vecLiteral = `[${embedding.join(',')}]`

      let rows: ChunkRow[]
      if (isAdmin) {
        const r = await db.query<ChunkRow>(
          `SELECT chunk_id, call_id, owner_user_id, chunk_index, content,
                  (embedding <=> $1::vector)::float8 AS dist
           FROM call_rag_chunks
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          [vecLiteral, topK],
        )
        rows = r.rows
      } else {
        const r = await db.query<ChunkRow>(
          `SELECT chunk_id, call_id, owner_user_id, chunk_index, content,
                  (embedding <=> $1::vector)::float8 AS dist
           FROM call_rag_chunks
           WHERE owner_user_id = $2
           ORDER BY embedding <=> $1::vector
           LIMIT $3`,
          [vecLiteral, ownerFilter, topK],
        )
        rows = r.rows
      }

      const ownersInHits = [...new Set(rows.map((x) => x.owner_user_id))].sort()

      if (rows.length === 0) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            ok: true,
            reply:
              'No excerpts matched this question with the current filter (empty index or nothing close enough). Try Admin scope, another rep, or different wording.',
            retrieval: { mode: isAdmin ? 'admin' : 'rep', ownersInHits: [], chunks: [] },
          }),
        )
        return
      }

      const contextBlocks = rows.map(
        (row) =>
          `[${row.chunk_id}] call_id=${row.call_id} rep=${row.owner_user_id} chunk_index=${row.chunk_index}\n${row.content}`,
      )
      const context = contextBlocks.join('\n\n---\n\n')

      const scopeBlock = isAdmin
        ? `[Scope] Admin retrieval: top semantic matches across **all** reps. Reps that appear in these excerpts: ${ownersInHits.join(', ') || '(none)'}. Only compare reps when both sides show up here; otherwise say the excerpt set is too narrow for that comparison.`
        : `[Scope] **Single-rep filter:** only excerpts attributed to **${ownerFilter}** are retrieved — other reps were **not** searched. If the question names another rep, needs their calls, or compares reps, say briefly that this view only covers **${ownerFilter}**, and they should switch transcript scope to **Admin** (all reps) or to that other rep. Do not speculate about unretrieved reps.`

      const system = [
        'You are Oz helping a lumberyard rep review **synthetic Russin Lumber phone transcripts** (demo database).',
        'Treat the excerpts as **primary evidence**. You may summarize **themes and patterns** clearly supported across them (e.g. typical lead-time ranges, how quotes/terms come up). Reasonable paraphrase is fine when anchored with **call_id** citations.',
        'Do **not** invent specific facts (exact quantities, buyer names, dates) that do not appear in the excerpts. If coverage is partial, give the best summary from what *is* here and note what’s missing in one short clause—not a lecture.',
        'When excerpts truly don’t speak to the question, keep the refusal brief (no "## Missing information" headers, no stiff legal tone).',
        'Respect the [Scope] block literally; never imply calls were retrieved for reps outside that scope.',
        'Use light markdown. Prefer citing **call_id** for concrete claims.',
      ].join(' ')

      const userMsg = `${scopeBlock}\n\nExcerpts:\n\n${context}\n\n---\n\nQuestion: ${query}`

      const chatResp = await fetch(OPENAI_CHAT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: chatModel(mode),
          temperature: ragChatTemperature(mode),
          max_tokens: ragMaxOutputTokens(mode),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMsg },
          ],
        }),
      })
      const chatText = await chatResp.text()
      if (!chatResp.ok) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Chat completion failed', detail: chatText.slice(0, 400) }))
        return
      }
      const chatJson = JSON.parse(chatText) as { choices?: { message?: { content?: string } }[] }
      const reply = chatJson.choices?.[0]?.message?.content?.trim() ?? ''

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: true,
          reply,
          retrieval: {
            mode: isAdmin ? 'admin' : 'rep',
            rep: ownerFilter,
            ownersInHits,
            chunks: rows.map((row) => ({
              chunk_id: row.chunk_id,
              call_id: row.call_id,
              owner_user_id: row.owner_user_id,
              chunk_index: row.chunk_index,
              dist: row.dist,
              preview: row.content.replace(/\s+/g, ' ').slice(0, 200),
            })),
          },
        }),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: msg }))
    }
  }

  return {
    name: 'oz-rag-calls-api',
    /** Run before Vite’s static / SPA handlers so preview/production (`vite preview`) returns JSON, not 404. */
    enforce: 'pre',
    configureServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
  }
}
