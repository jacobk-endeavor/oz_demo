/**
 * User wants a profit or P&L view by product with charts (opens inline profit panel).
 */
export function matchProfitByProductGraphIntent(raw: string): boolean {
  const t = raw.trim().toLowerCase()
  if (t.length < 12) return false

  const hasViz = /\b(graph|chart|bar|bars|plot|visuali[sz]e|show)\b/.test(t)

  const profitFraming =
    /\b(profit|margin|p&l|earnings|revenue|cost|purchase|sale)\b/.test(t) ||
    /\bexpected\s+profit\b/.test(t) ||
    /\bmake\s+money\b/.test(t)

  const productFraming =
    /\b(?:each|every|per|by)\s+product\b/.test(t) ||
    /\bproduct\s+lines?\b/.test(t) ||
    (/\bproduct(s)?\b/.test(t) && !/\bcustomer\s+requests?\b/.test(t))

  if (/\bexpected\s+profit\b/.test(t) && /\bproduct/.test(t) && hasViz) return true
  if (hasViz && profitFraming && productFraming) return true
  if (/\bgraph\s+expected\s+profit\b/.test(t)) return true

  return false
}

/**
 * “Add a chart … P&L … orders … warehouse / don’t have in stock” — second step after customer demand panel.
 */
export function matchWarehouseBackfillPnlIntent(raw: string): boolean {
  const t = raw.trim().toLowerCase()
  if (t.length < 24) return false
  const addChart = /\badd\s+a\s+chart\b/.test(t) || /\badd\s+chart\b/.test(t)
  const pnl = /\bp\s*&\s*l\b|\bprofit\b/.test(t)
  const warehouseOrStock =
    /\bwarehouse\b/.test(t) ||
    /\bdon'?t\s+have\b/.test(t) ||
    /\bin\s+my\s+warehouse\b/.test(t) ||
    /\bnot\s+in\s+(?:my\s+)?warehouse\b/.test(t)
  const orders = /\borders?\b/.test(t) && (/\bfilling\b/.test(t) || /\bfill\b/.test(t))
  return addChart && pnl && (warehouseOrStock || orders)
}
