/**
 * Normalizes recommendations.json rows into `[recs:<kind>:<anchor>#i]` lookup buckets.
 * Spec: docs/wiki-kb/track-c-chat-integration.md Layer 2 — Recommendation tools.
 */
type JsonRecord = Record<string, unknown>

export type RecommendationKind = 'cross_sell' | 'upsell' | 'margin_substitution'

export function normalizedAnchor(value: unknown): string | undefined {
  const text = String(value ?? '').trim().toLowerCase()
  return text || undefined
}

export function readRuleKind(record: JsonRecord): RecommendationKind | string {
  const raw = String(record.rule_kind ?? record.kind ?? record.type ?? 'upsell').trim().toLowerCase()
  if (raw === 'cross_sell' || raw === 'cross-sell') return 'cross_sell'
  if (raw === 'margin_substitution' || raw === 'substitution') return 'margin_substitution'
  if (raw === 'upsell') return 'upsell'
  return raw
}

export function readCrossSellAnchor(record: JsonRecord): string | undefined {
  return normalizedAnchor(
    record.sub_category ?? record.subCategory ?? record.cross_sell_sub_category ?? record.anchor_subcategory,
  )
}

export function readSkuAnchor(record: JsonRecord): string | undefined {
  const sku = String(
    record.from_sku ?? record.source_sku ?? record.sku ?? record.anchor_sku ?? record.source ?? '',
  )
    .trim()
    .toUpperCase()
  return sku || undefined
}

export function groupRecommendationsByRuleKey(records: JsonRecord[]): Record<string, JsonRecord[]> {
  const buckets: Record<string, JsonRecord[]> = {}
  const push = (key: string, row: JsonRecord) => {
    if (!buckets[key]) buckets[key] = []
    buckets[key].push(row)
  }

  for (const row of records) {
    const rk = readRuleKind(row)
    if (rk === 'cross_sell') {
      const anchor = readCrossSellAnchor(row)
      if (anchor) push(`cross_sell:${anchor}`, row)
      continue
    }
    const anchor = readSkuAnchor(row)
    if (anchor) push(`${rk}:${anchor}`, row)
  }

  return buckets
}

export function recommendationCitation(ruleKind: string, anchor: string, index: number): string {
  return `[recs:${ruleKind}:${anchor}#${index}]`
}
