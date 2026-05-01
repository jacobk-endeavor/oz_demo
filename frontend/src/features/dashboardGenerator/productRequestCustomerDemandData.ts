import { sourceLabelForChat } from '../leadGen/leadGenTableModel'
import { getLeadSourceIdForIndex } from '../leadGen/leadSourceMeta'
import { CUSTOMER_CALLS_COMPANY_SEED } from '../leadGen/customerCallsCompanySeed50'

const PRODUCT_LINE_DEFS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'thermory', label: 'Thermory' },
  { id: 'azek', label: 'AZEK' },
  { id: 'deckorator', label: 'Deckorators' },
  { id: 'simpson', label: 'Simpson' },
  { id: 'millboard', label: 'Millboard' },
  { id: 'fortress', label: 'Fortress' },
  { id: 'boral', label: 'Boral / TruExterior' },
  { id: 'voyage', label: 'Voyage / fascia' },
]

function detWeight(seed: string, salt: number): number {
  let h = salt
  for (let j = 0; j < seed.length; j++) h = (h * 33 + seed.charCodeAt(j)) | 0
  return 14 + (Math.abs(h) % 52)
}

export interface ProductRequestBar {
  label: string
  value: number
}

/**
 * One series for the dashboard: how often each product line appears in demo
 * **Products requested** + exterior blurbs (offline, same seed as the lead grid).
 */
export function buildCustomerProductRequestBars(): ProductRequestBar[] {
  const productAgg: Record<string, number> = Object.fromEntries(
    PRODUCT_LINE_DEFS.map((d) => [d.label, 0]),
  ) as Record<string, number>

  CUSTOMER_CALLS_COMPANY_SEED.forEach((seed, i) => {
    const block = `${seed.description} ${seed.productsRequested ?? ''}`.toLowerCase()
    if (!seed.productsRequested && !/\b(thermory|azek|deckorator|composite|deck|siding|porch|exterior|lumber|russin)\b/.test(block)) {
      return
    }
    for (const d of PRODUCT_LINE_DEFS) {
      if (block.includes(d.id)) {
        productAgg[d.label] = (productAgg[d.label] ?? 0) + detWeight(`${seed.name}:${d.id}`, i)
      }
    }
  })

  const rows = PRODUCT_LINE_DEFS.map((d) => ({
    label: d.label,
    value: productAgg[d.label] ?? 0,
  }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)

  return rows.length > 0 ? rows : [{ label: 'Exterior (demo)', value: 24 }]
}

/**
 * Where demand index lands by lead / system (same index→source map as the lead table).
 */
export function buildCustomerLeadSourceBars(): ProductRequestBar[] {
  const bySource: Record<string, number> = {}

  CUSTOMER_CALLS_COMPANY_SEED.forEach((seed, i) => {
    const block = `${seed.description} ${seed.productsRequested ?? ''}`.toLowerCase()
    if (!seed.productsRequested && !/\b(thermory|azek|deckorator|composite|deck|siding|porch|exterior|lumber|russin)\b/.test(block)) {
      return
    }
    const source = sourceLabelForChat(getLeadSourceIdForIndex(i))
    let units = 0
    for (const d of PRODUCT_LINE_DEFS) {
      if (block.includes(d.id)) {
        units += detWeight(`${seed.name}:${d.id}`, i)
      }
    }
    if (seed.productsRequested) {
      units += detWeight(seed.linkedInUrl, 7)
    }
    if (units === 0) return
    bySource[source] = (bySource[source] ?? 0) + units
  })

  const rows = Object.entries(bySource)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
  return rows.length > 0 ? rows : [{ label: 'LinkedIn (demo)', value: 40 }]
}
