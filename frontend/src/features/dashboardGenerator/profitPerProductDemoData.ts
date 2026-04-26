/**
 * Synthetic P&L-style rows for the profit-by-product demo (not real customer data).
 */
export type ProductProfitDemoRow = {
  product: string
  /** Average purchase cost per unit ($K). */
  purchaseCostK: number
  /** Selling price per unit ($K). */
  salePriceK: number
  /** Realized profit per unit after discounts and shrink ($K). */
  realizedProfitK: number
  /**
   * Fake estimate if we fulfilled all observed demand for this line ($K);
   * higher than realized when stock-outs or partial fills are implied.
   */
  fulfillmentCaptureK: number
}

function det(seed: string, salt: number): number {
  let h = salt
  for (let j = 0; j < seed.length; j++) h = (h * 33 + seed.charCodeAt(j)) | 0
  return Math.abs(h)
}

/**
 * Labels aligned with the Milwaukee **Products requested** demo lines.
 */
const PRODUCT_LABELS: readonly string[] = [
  'Thermory',
  'AZEK',
  'Deckorators',
  'Simpson',
  'Millboard',
  'Fortress',
  'Boral / TruExterior',
  'Voyage / fascia',
]

/** Deterministic fake dollars in $K for charts and table. */
export function buildProductProfitDemoRows(): ProductProfitDemoRow[] {
  return PRODUCT_LABELS.map((product, i) => {
    const base = 18 + (det(product, i) % 35)
    const purchaseCostK = Math.round((base + i * 2.2) * 10) / 10
    const markup = 1.14 + (det(product, 3 + i) % 18) / 100
    const salePriceK = Math.round(purchaseCostK * markup * 10) / 10
    const slip = 0.8 + (det(product, 11) % 7) / 10
    const realizedProfitK = Math.max(0.1, Math.round((salePriceK - purchaseCostK - slip) * 10) / 10)
    const scale = 1.35 + (det(product, 19) % 25) / 100
    const fulfillmentCaptureK = Math.round(realizedProfitK * scale * 10) / 10
    return {
      product,
      purchaseCostK,
      salePriceK,
      realizedProfitK,
      fulfillmentCaptureK,
    }
  })
}
