import type { CompetitorOfferRow } from './competitorOffersTypes'

/**
 * Trade-first: regional / pro distributors and specialty channels that sell to the same contractor,
 * dealer, and specifier customers as Russin—not only big-box retail. Each competitor exposes a
 * `path(product)` builder that returns a URL guaranteed to resolve (never 404). When a per-product
 * curated PDP is known, `pdpOverrides` takes priority for the first column.
 */
const COMPETITORS = [
  {
    name: 'ABC Supply',
    domain: 'abcsupply.com',
    path: (p: string) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${p} site:abcsupply.com`)}`,
  },
  {
    name: '84 Lumber',
    domain: '84lumber.com',
    path: (p: string) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${p} site:84lumber.com`)}`,
  },
  {
    name: 'Beacon (BECN)',
    domain: 'becn.com',
    path: (p: string) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${p} site:becn.com`)}`,
  },
  {
    name: 'L&W Supply (GMS)',
    domain: 'lwsupply.com',
    path: (p: string) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${p} site:lwsupply.com`)}`,
  },
  {
    name: 'The Home Depot',
    domain: 'homedepot.com',
    path: (p: string) => `https://www.homedepot.com/s/${encodeURIComponent(p)}`,
  },
] as const

/**
 * Curated manufacturer / catalog pages for the headline products that show up in the demo. These
 * are real, public URLs that resolve to the actual product family page. Match is fuzzy (lowercase
 * substring) so minor wording differences (e.g. "AZEK Vintage" vs "AZEK Vintage wide board") still
 * land on the right page. Used as the first-column "real listing" hint when no Brave URL is set.
 */
const PRODUCT_PDP_OVERRIDES: { match: string; url: string; title: string }[] = [
  {
    match: 'azek vintage',
    url: 'https://www.azekexteriors.com/products/decking/vintage-collection/',
    title: 'AZEK Vintage Collection — AZEK Exteriors',
  },
  {
    match: 'thermory ash',
    url: 'https://thermoryusa.com/products/decking/',
    title: 'Thermory USA — Ash thermally modified decking',
  },
  {
    match: 'thermory',
    url: 'https://thermoryusa.com/',
    title: 'Thermory USA',
  },
  {
    match: 'deckorators alx',
    url: 'https://www.deckorators.com/railing/alx-classic-aluminum-railing/',
    title: 'Deckorators ALX Classic Aluminum Railing',
  },
  {
    match: 'deckorators',
    url: 'https://www.deckorators.com/',
    title: 'Deckorators',
  },
  {
    match: 'azek',
    url: 'https://www.azekexteriors.com/products/decking/',
    title: 'AZEK Decking — AZEK Exteriors',
  },
]

function pdpFor(product: string): { url: string; title: string } | undefined {
  const t = product.toLowerCase()
  for (const o of PRODUCT_PDP_OVERRIDES) {
    if (t.includes(o.match)) return { url: o.url, title: o.title }
  }
  return undefined
}

function makeId(rowIndex: number, compIndex: number, product: string) {
  return `co-${rowIndex}-${compIndex}-${product.length}-${Math.abs(
    product.split('').reduce((a, b) => a + b.charCodeAt(0) * 17, 0),
  )}`
}

/**
 * Plausible $ ranges by quote basis — keeps the board from $9..$88 noise; products still differ via `frac01(product)`.
 */
const PRICE_BANDS: Record<string, { min: number; max: number }> = {
  'per gal': { min: 34, max: 51 },
  'per box': { min: 18, max: 40 },
  'per bag': { min: 7.5, max: 14.5 },
  'per roll': { min: 32, max: 78 },
  'per sheet': { min: 25, max: 45 },
  'per sq ft': { min: 1.25, max: 3.6 },
  'per bd ft': { min: 2.2, max: 4.4 },
  'per 100': { min: 6, max: 18 },
  'ea.': { min: 16, max: 42 },
  'per kit': { min: 85, max: 155 },
  'per bundle': { min: 27, max: 39 },
  'per lf': { min: 2.75, max: 8.85 },
  'per unit': { min: 19, max: 36 },
}

function frac01(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i)
  return (h >>> 0) % 10_000 / 10_000
}

/** Slight, deterministic wiggle by store so rows are not identical but stay in a tight band. */
function storePriceSkew(product: string, competitor: string, compIndex: number): number {
  const raw = (product + '\n' + competitor).split('').reduce((a, c) => a * 37 + c.charCodeAt(0), 1)
  // [-0.014, 0.014] from hash
  const h = (Math.abs(raw) % 29) - 14
  const fromHash = h / 1000
  // gentle ladder across the five default competitors (~±1.2% end-to-end)
  const fromIndex = (compIndex - 2) * 0.0065
  return fromHash + fromIndex
}

function detPriceForRow(product: string, priceUnit: string, competitor: string, compIndex: number): string {
  const band = PRICE_BANDS[priceUnit] ?? PRICE_BANDS['per unit']!
  const t = frac01(product)
  const base = band.min + t * (band.max - band.min)
  const skew = storePriceSkew(product, competitor, compIndex)
  const amount = base * (1 + skew)
  // Keep within a soft margin of the category band (no $80 decking next to $12)
  const lo = band.min * 0.97
  const hi = band.max * 1.03
  const clamped = Math.min(hi, Math.max(lo, amount))
  return `$${clamped.toFixed(2)}`
}

/**
 * Trade-typical unit for the quoted line (drives the Price column suffix).
 * Order: more specific phrases before broad lumber/decking defaults.
 */
export function priceUnitLabelForProduct(product: string): string {
  const t = product.toLowerCase()
  if (/\bgal(?:lon)?\b|paint|stain|primer|sealer|poly|urethane|coating|latex|oil-?based/.test(t)) {
    return 'per gal'
  }
  if (/(per box|case pack|\/ ?box|\/ ?case| shrink wrap box)/.test(t) || /\bbox\s+(of|pack)/.test(t)) {
    return 'per box'
  }
  if (/\bbag\b|mortar mix|cement|concrete mix|grout/.test(t)) return 'per bag'
  if (/\broll\b|roofing underlay|housewrap|tyvek/i.test(t)) return 'per roll'
  if (/plywood|osb|subfloor|drywall|sheet good|4x8|\/ ?sheet|sheathing/.test(t)) return 'per sheet'
  if (/(sq\.?\s*ft|sqft|per sf|\/ ?sf|square foot|sf slab)/.test(t) || /per sq/i.test(t)) {
    return 'per sq ft'
  }
  if (/board ?foot|bd\.?\s*ft|bft|mbf|thousand board/.test(t)) return 'per bd ft'
  if (/(screw|nail|brad|staple|spike|bolt|washer|hanger|fastener|t-?clip|hidden clip|connector)/.test(t)) {
    return 'per 100'
  }
  if (/(newel|baluster|reveal|picket|post cap|lamp|fixture|receptacle)/.test(t)) return 'ea.'
  if (/(railing kit|stair kit|level kit|assembly)/.test(t)) return 'per kit'
  if (/shingle|bundle/.test(t)) return 'per bundle'
  if (/(trim|fascia|1x[468]|1x1[02]|2x[468]|2x1[02]|2x1[0-2]|stud|rafter|joist|beam)/.test(t)) {
    return 'per lf'
  }
  if (
    /(deck|lumber|board|plank|lineal|composite|azek|pvc|thermory|ipe|cedar|siding|decking|rail|railing|alx)/.test(
      t,
    )
  ) {
    return 'per lf'
  }
  return 'per unit'
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
 * Brave hint wins over the curated PDP override; both resolve to a real page.
 */
export function buildCompetitorOfferRows(
  productQueries: string[],
  webByProduct: Record<string, { url: string; title: string } | undefined> = {},
): CompetitorOfferRow[] {
  const rows: CompetitorOfferRow[] = []
  for (let pi = 0; pi < productQueries.length; pi++) {
    const product = productQueries[pi]!
    const braveHint = webByProduct[product]
    const pdpHint = pdpFor(product)
    const firstColHint = braveHint ?? pdpHint
    const priceUnit = priceUnitLabelForProduct(product)
    for (let ci = 0; ci < COMPETITORS.length; ci++) {
      const c = COMPETITORS[ci]!
      const useFirstColHint = Boolean(firstColHint) && ci === 0
      const useFromBrave = Boolean(braveHint) && ci === 0
      rows.push({
        id: makeId(pi, ci, product),
        competitor: c.name,
        product,
        price: detPriceForRow(product, priceUnit, c.name, ci),
        priceUnit,
        productPageUrl: useFirstColHint && firstColHint ? firstColHint.url : c.path(product),
        imageUrl: `https://placehold.co/96x64/f1f5f9/334155?text=${encodeURIComponent(product.slice(0, 3))}`,
        sourceLabel:
          useFromBrave && braveHint
            ? `Web: ${braveHint.title.slice(0, 40)}`
            : useFirstColHint && firstColHint
              ? `Manufacturer: ${firstColHint.title.slice(0, 40)}`
              : `Search · ${c.domain}`,
      })
    }
  }
  return rows
}
