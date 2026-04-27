import { describe, expect, it } from 'vitest'
import { buildCompetitorOfferRows, priceUnitLabelForProduct } from './competitorOffersBuild'

describe('priceUnitLabelForProduct', () => {
  it('maps common material classes', () => {
    expect(priceUnitLabelForProduct('Cabot solid stain — exterior')).toBe('per gal')
    expect(priceUnitLabelForProduct('1/2" OSB sheathing 4x8')).toBe('per sheet')
    expect(priceUnitLabelForProduct('Simpson strong-tie SD screws')).toBe('per 100')
    expect(priceUnitLabelForProduct('2x10 floor joist — 12ft')).toBe('per lf')
    expect(priceUnitLabelForProduct('Azek Vintage PVC deckingboard')).toBe('per lf')
    expect(priceUnitLabelForProduct('Misc building materials order')).toBe('per unit')
  })
})

function parseUSD(p: string): number {
  return Number.parseFloat(p.replace(/[$,]/g, ''))
}

describe('buildCompetitorOfferRows', () => {
  it('attaches the same price unit to every competitor row for a product', () => {
    const rows = buildCompetitorOfferRows(['1/2" OSB subfloor 4x8'], {})
    expect(rows).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({ product: '1/2" OSB subfloor 4x8', priceUnit: 'per sheet' }),
      ]),
    )
    const units = new Set(rows.map((r) => r.priceUnit))
    expect(units).toEqual(new Set(['per sheet']))
  })

  it('keeps competitor prices for a given SKU in a tight band (no wide outliers)', () => {
    const product = 'Azek Vintage 1x5-1/2 solid PVC'
    const rows = buildCompetitorOfferRows([product], {})
    const sameProduct = rows.filter((r) => r.product === product)
    const amounts = sameProduct.map((r) => parseUSD(r.price))
    const min = Math.min(...amounts)
    const max = Math.max(...amounts)
    expect(min).toBeGreaterThan(0)
    // Within ~3.5% of the min — loose similarity, not identical
    expect(max / min).toBeLessThan(1.04)
  })
})
