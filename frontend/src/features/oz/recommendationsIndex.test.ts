import { describe, expect, it } from 'vitest'
import {
  groupRecommendationsByRuleKey,
  recommendationCitation,
} from '../../../../backend/oz/recommendationsIndex'

describe('recommendationsIndex', () => {
  it('groups rules by cross-sell sub-category and SKU anchors', () => {
    const grouped = groupRecommendationsByRuleKey([
      { rule_kind: 'cross_sell', sub_category: 'Deck-Line' },
      { kind: 'upsell', from_sku: 'DK35031021', lift: 1.2 },
    ] as Record<string, unknown>[])
    expect(grouped['cross_sell:deck-line']).toHaveLength(1)
    expect(grouped['upsell:DK35031021']).toHaveLength(1)
    expect(recommendationCitation('upsell', 'DK35031021', 0)).toBe('[recs:upsell:DK35031021#0]')
  })
})
