/**
 * After a **competitor product search**, the user can ask who would be likely to buy
 * if Russin (or the distributor) stocked those lines—opens the lead grid with
 * a demo filter, not a separate “Milwaukee distributors” look-up.
 */

const STOP = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'that',
  'this',
  'deck',
  'decks',
  'rail',
  'rails',
  'board',
  'boards',
  'line',
  'lines',
])

/**
 * Heuristic: user is asking for likely / prospective buyers in a “what if we stocked” frame.
 */
export function matchStockUpLikelyBuyersIntent(raw: string): boolean {
  const t = raw.trim()
  if (!t) return false
  const lower = t.toLowerCase()
  const stockFrame =
    /\bif i (?:stock|stocked|overstock|buy in bulk|brought in|carried|added)\b/.test(lower) ||
    /\bstock(?:ed)? up on\b/.test(lower) ||
    /\boverstock(ed)?\b/.test(lower) ||
    /(?:^|\b)(?:we|I) (?:should |could )?stock\b/.test(lower)

  const whoBuys =
    /\bwho(?:'d|'s| would| might)\s+(?:be\s+)?(?:likely\s+to\s+)?buy\b/.test(lower) ||
    /\bwho\s+is\s+likely\s+to\s+buy\b/.test(lower) ||
    /\bwho\s+(?:is\s+)?likely\s+to\s+buy\b/.test(lower) ||
    /\blikely\s+buyer/.test(lower) ||
    /\bprospect(?:ive)?\s+(?:account|customer|buyer)/.test(lower) ||
    /\bwho\s+(?:should|would)\s+(?:I\s+)?(?:sell|call|target)\b/.test(lower) ||
    /\bwh(?:o|ich)\s+(?:accounts?|companies?|firms?)\b.*\b(?:need|buy|move|stock)\b/.test(lower)

  if (stockFrame && whoBuys) return true
  if (stockFrame && /\bwho\b/.test(lower) && (/\bbuy\b/.test(lower) || /\bmove\b/.test(lower))) return true
  if (whoBuys && /\b(?:stock|inventory|shelf|yard|carrying|line)\b/.test(lower)) return true
  if (/\bif we (?:had|carried|stocked)\b.*\bwho\b.*\b(?:buy|order|call)\b/i.test(t)) return true
  return false
}

/**
 * Picks a short substring for the lead **Description** text filter from competitor product lines.
 */
export function pickDescriptionFilterNeedle(productQueries: string[]): string {
  if (productQueries.length === 0) return 'lumber'
  const raw = productQueries.join(' ').toLowerCase()
  const words = raw
    .split(/[^a-z0-9+]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3)
  const hit = words.find((w) => !STOP.has(w))
  if (hit) {
    return hit.length > 40 ? hit.slice(0, 40) : hit
  }
  const first = productQueries[0]?.trim() ?? ''
  return first.length > 48 ? first.slice(0, 48) : first
}
