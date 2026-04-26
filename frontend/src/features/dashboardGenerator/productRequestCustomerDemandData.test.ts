import { describe, expect, it } from 'vitest'
import { buildCustomerProductRequestBars } from './productRequestCustomerDemandData'

describe('buildCustomerProductRequestBars', () => {
  it('returns non-empty product line demand from demo customers', () => {
    const bars = buildCustomerProductRequestBars()
    expect(bars.length).toBeGreaterThan(0)
    expect(bars.every((b) => b.label.length > 0 && b.value > 0)).toBe(true)
  })
})
