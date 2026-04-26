import type { LumberyardIntelResponse, LumberyardLibraryResponse } from './lumberyardTypes'

export async function fetchLumberyardLibrary(): Promise<LumberyardLibraryResponse> {
  if (import.meta.env.VITEST) {
    return { ok: true, version: 1, synthetic: null, calls: [] }
  }
  const r = await fetch('/api/oz/lumberyard-calls')
  const data = (await r.json()) as LumberyardLibraryResponse
  if (!r.ok) throw new Error('Failed to load customer activity')
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
