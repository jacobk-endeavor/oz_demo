import type { LumberyardIntelResponse, LumberyardLibraryResponse } from './lumberyardTypes'

export async function fetchLumberyardLibrary(): Promise<LumberyardLibraryResponse> {
  if (import.meta.env.VITEST) {
    return { ok: true, version: 1, synthetic: null, calls: [] }
  }
  let r: Response
  try {
    r = await fetch('/api/oz/lumberyard-calls')
  } catch (e) {
    const orig = e instanceof Error ? e.message : String(e)
    const hint =
      orig === 'Failed to fetch' || /NetworkError|load failed/i.test(orig)
        ? ' Run `npm run dev` in frontend/ (or `npm run preview` after build) so /api/oz/* is served; static file hosting alone has no lumberyard API.'
        : ''
    throw new Error(`${orig}.${hint}`)
  }
  let parsed: unknown
  try {
    parsed = await r.json()
  } catch {
    throw new Error(
      `Customer activity API returned non-JSON (HTTP ${r.status}). Use Vite dev/preview so /api/oz/lumberyard-calls is active.`,
    )
  }
  const data = parsed as LumberyardLibraryResponse & { error?: string }
  if (!r.ok || !data.ok) {
    const detail =
      typeof data.error === 'string' && data.error.trim()
        ? data.error
        : !r.ok
          ? `HTTP ${r.status}`
          : 'Failed to load customer activity'
    throw new Error(detail)
  }
  return data
}

function priorToIntelHistory(
  prior: { role: 'user' | 'oz' | 'system'; text: string }[],
): { role: 'user' | 'assistant'; content: string }[] {
  return prior
    .filter((p) => p.role !== 'system')
    .map((p) => ({
      role: p.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: p.text,
    }))
}

/**
 * RAG + optional Brave web search over call corpus (dev server / preview only).
 */
export async function postLumberyardIntel(
  userMessage: string,
  priorExchanges: { role: 'user' | 'oz' | 'system'; text: string }[],
): Promise<LumberyardIntelResponse> {
  if (import.meta.env.VITEST) {
    return { reply: 'Intel is disabled in tests.', usedWebSearch: false }
  }
  const h = priorToIntelHistory(priorExchanges)
  const r = await fetch('/api/oz/lumberyard-intel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userMessage, history: h.slice(-10) }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t.slice(0, 200))
  }
  return (await r.json()) as LumberyardIntelResponse
}
