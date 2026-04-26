import type { CompetitorOfferRow } from './competitorOffersTypes'

/**
 * Trade-first: regional / pro distributors and specialty channels that sell to the same contractor,
 * dealer, and specifier customers as Russin—not only big-box retail.
 */
const COMPETITORS = [
  {
    name: 'ABC Supply',
    path: (p: string) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${p} site:abcsupply.com`)}`,
  },
  {
    name: '84 Lumber',
    path: (p: string) => `https://www.84lumber.com/search?query=${encodeURIComponent(p)}`,
  },
  {
    name: 'Beacon (BECN)',
    path: (p: string) => `https://www.becn.com/Search-Results?search=${encodeURIComponent(p)}`,
  },
  {
    name: 'L&W Supply (GMS)',
    path: (p: string) => `https://www.lwsupply.com/search?query=${encodeURIComponent(p)}`,
  },
  {
    name: 'The Home Depot',
    path: (p: string) => `https://www.homedepot.com/s/${encodeURIComponent(p)}`,
  },
] as const

function makeId(rowIndex: number, compIndex: number, product: string) {
  return `co-${rowIndex}-${compIndex}-${product.length}-${Math.abs(
    product.split('').reduce((a, b) => a + b.charCodeAt(0) * 17, 0),
  )}`
}

function detPrice(seed: string, i: number): string {
  const n = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + i * 17
  const base = 9 + (n % 80)
  const cents = (n * 3) % 100
  return `$${base}.${String(cents).padStart(2, '0')}`
}

/**
 * Flattens product tags from the first `maxRows` activity rows, unique, product-shaped strings.
 */
export function productQueriesFromTopCalls(
  calls: { productTags?: string[]; title: string }[],
  maxRows: number,
  maxProducts: number,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of calls.slice(0, maxRows)) {
    const tags = row.productTags?.filter((t) => t.trim().length > 0) ?? []
    if (tags.length > 0) {
      for (const t of tags) {
        const k = t.trim()
        if (!seen.has(k) && k.length > 0) {
          seen.add(k)
          out.push(k)
        }
        if (out.length >= maxProducts) return out
      }
    } else {
      const t = row.title?.trim().slice(0, 64) || 'Building materials'
      if (!seen.has(t)) {
        seen.add(t)
        out.push(t)
      }
    }
    if (out.length >= maxProducts) return out
  }
  return out
}

/**
 * @param webByProduct — optional first listing URL from live search, keyed by exact product string.
 */
export function buildCompetitorOfferRows(
  productQueries: string[],
  webByProduct: Record<string, { url: string; title: string } | undefined> = {},
): CompetitorOfferRow[] {
  const rows: CompetitorOfferRow[] = []
  for (let pi = 0; pi < productQueries.length; pi++) {
    const product = productQueries[pi]!
    const hint = webByProduct[product]
    for (let ci = 0; ci < COMPETITORS.length; ci++) {
      const c = COMPETITORS[ci]!
      const useWeb = Boolean(hint) && ci === 0
      rows.push({
        id: makeId(pi, ci, product),
        competitor: c.name,
        product,
        price: detPrice(product + c.name, pi * 3 + ci),
        productPageUrl: useWeb && hint ? hint.url : c.path(product),
        imageUrl: `https://placehold.co/96x64/f1f5f9/334155?text=${encodeURIComponent(product.slice(0, 3))}`,
        sourceLabel: useWeb && hint ? `Web: ${hint.title.slice(0, 40)}` : 'Demo listing URL',
      })
    }
  }
  return rows
}
