/**
 * Phrases that open the **competitor / product** web comparison table (top activity rows).
 */
export function matchCompetitorProductSearchIntent(input: string): boolean {
  const t = input.toLowerCase()
  if (t.length < 12) return false
  const competitorAngle =
    t.includes('competitor') ||
    t.includes('competitors') ||
    t.includes('competing') ||
    t.includes('who else sells') ||
    t.includes('other suppliers')
  const productAngle =
    t.includes('sell') ||
    t.includes('sells') ||
    t.includes('selling') ||
    t.includes('stock') ||
    t.includes('stocks') ||
    t.includes('carries') ||
    t.includes('offers') ||
    t.includes('list price') ||
    t.includes('price') ||
    t.includes('where to buy')
  const hasProductToken =
    t.includes('product') ||
    t.includes(' these ') ||
    t.includes('these products') ||
    t.includes('those products') ||
    t.includes('same sku') ||
    t.includes('same products')
  const doSearch = /(search|look up|look up|find|look for|right now|google|web|online)/.test(t)
  const topRows = /(top\s*5|first\s*5|five rows|5 rows|activity rows|grid)/.test(t) || t.includes('rows')

  if (competitorAngle && (productAngle || hasProductToken) && (doSearch || topRows)) return true
  if (t.includes('which of my competitors') && (productAngle || hasProductToken)) return true
  if (t.includes('competitor') && t.includes('product') && (t.includes('table') || t.includes('search') || doSearch))
    return true
  if ((t.includes('image') && t.includes('selling')) || (t.includes('people') && t.includes('selling'))) {
    if (t.includes('product') || t.includes('row') || t.includes('competitor')) return true
  }
  return false
}
