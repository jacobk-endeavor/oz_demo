import type { CompetitorOfferRow } from './competitorOffersTypes'
import type { LumberyardCallRow } from './lumberyardTypes'

export type CompetitorOffersResponse = {
  ok: boolean
  rows: CompetitorOfferRow[]
  usedWebSearch: boolean
  productQueries: string[]
}

/**
 * Resolves a competitor comparison table for the first five activity rows (server: demo URLs + optional Brave pass).
 */
export async function postCompetitorOffers(calls: LumberyardCallRow[]): Promise<CompetitorOffersResponse> {
  if (import.meta.env.VITEST) {
    return {
      ok: true,
      rows: [],
      usedWebSearch: false,
      productQueries: [],
    }
  }
  const payload = {
    rows: calls.slice(0, 5).map((c) => ({
      id: c.id,
      title: c.title,
      productTags: c.productTags ?? [],
    })),
  }
  const r = await fetch('/api/oz/competitor-offers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t.slice(0, 200))
  }
  return (await r.json()) as CompetitorOffersResponse
}
