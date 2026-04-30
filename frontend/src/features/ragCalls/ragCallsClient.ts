export type RagCallsScope = 'admin' | 'Jacob' | 'Sami' | 'Ryan' | 'Joanna'

export const RAG_CALLS_REP_OPTIONS: Exclude<RagCallsScope, 'admin'>[] = ['Jacob', 'Sami', 'Ryan', 'Joanna']

/** Delay before committed scope updates after picking a name (full-screen overlay duration). */
export const RAG_CALLS_SCOPE_TRANSITION_MS = 3000

export const RAG_CALLS_SCOPE_OPTIONS: RagCallsScope[] = ['admin', ...RAG_CALLS_REP_OPTIONS]

/** Default retrieval breadth for `/api/oz/rag-calls` (server clamps 4–24; override via OPENAI_RAG_TOP_K). */
export const RAG_CALLS_DEFAULT_TOP_K = 18

export type RagCallsRetrievalChunk = {
  chunk_id: string
  call_id: string
  owner_user_id: string
  chunk_index: number
  dist: number
  preview: string
}

const RAG_CALLS_PATH = '/api/oz/rag-calls'

/** Same path rules as `vite.ozRagCallsApi` (supports `base` subpaths in vite.config). */
export function ragCallsApiUrl(): string {
  const raw = import.meta.env.BASE_URL ?? '/'
  const base = raw.replace(/\/+$/, '')
  return base === '' ? RAG_CALLS_PATH : `${base}${RAG_CALLS_PATH}`
}

export type RagCallsResponse =
  | {
      ok: true
      reply: string
      retrieval: {
        mode: 'admin' | 'rep'
        rep?: string | null
        ownersInHits: string[]
        chunks: RagCallsRetrievalChunk[]
      }
    }
  | { ok: false; error: string; detail?: string }

export async function postRagCallsQuery(payload: {
  query: string
  scope: RagCallsScope
  topK?: number
}): Promise<RagCallsResponse> {
  let r: Response
  try {
    r = await fetch(ragCallsApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: payload.query,
        scope: payload.scope,
        topK: payload.topK,
      }),
    })
  } catch (e) {
    return {
      ok: false,
      error: 'Network error calling transcript API.',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  const raw = await r.text()
  const trimmed = raw.trim()
  if (!trimmed) {
    return {
      ok: false,
      error: `Transcript API returned an empty response (HTTP ${r.status}).`,
      detail:
        r.status === 404
          ? 'Use `npm run dev` or `npm start` / `vite preview` from this repo (same process serves `/api/oz/rag-calls`). Static hosting of `dist/` only will 404. After deploying, ensure you are on a build that registers the RAG middleware before static files.'
          : undefined,
    }
  }

  try {
    const json = JSON.parse(trimmed) as RagCallsResponse
    if (typeof json !== 'object' || json === null || !('ok' in json)) {
      return {
        ok: false,
        error: 'Transcript API returned an unexpected JSON shape.',
        detail: trimmed.slice(0, 400),
      }
    }
    return json
  } catch {
    return {
      ok: false,
      error: 'Transcript API returned non-JSON (proxy or HTML error page?).',
      detail: trimmed.slice(0, 400),
    }
  }
}
