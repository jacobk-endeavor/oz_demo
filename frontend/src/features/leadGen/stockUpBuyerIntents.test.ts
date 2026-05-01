import { describe, expect, it } from 'vitest'
import { matchStockUpLikelyBuyersIntent, pickDescriptionFilterNeedle } from './stockUpBuyerIntents'

describe('matchStockUpLikelyBuyersIntent', () => {
  it('matches stocked-up + who is likely to buy', () => {
    expect(
      matchStockUpLikelyBuyersIntent(
        'If I stocked up on this product who is likely to buy it',
      ),
    ).toBe(true)
  })

  it('matches if I stock framing', () => {
    expect(
      matchStockUpLikelyBuyersIntent(
        'If I stock these deck boards who would be most likely to buy from us',
      ),
    ).toBe(true)
  })

  it('does not match generic distributor-list phrasing', () => {
    expect(matchStockUpLikelyBuyersIntent('give me chicago distributors')).toBe(false)
  })

  it('does not match competitor-only search', () => {
    expect(matchStockUpLikelyBuyersIntent('which competitors sell Thermory')).toBe(false)
  })
})

describe('pickDescriptionFilterNeedle', () => {
  it('prefers a product-like token from queries', () => {
    expect(pickDescriptionFilterNeedle(['Thermory Ash 1x6', 'AZEK Vintage'])).toBe('thermory')
  })
})
