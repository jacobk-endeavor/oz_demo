import { describe, expect, it } from 'vitest'
import { matchProfitByProductGraphIntent, matchWarehouseBackfillPnlIntent } from './profitGraphIntent'

describe('matchProfitByProductGraphIntent', () => {
  it('matches graph expected profit for each product', () => {
    expect(
      matchProfitByProductGraphIntent('graph expected profit for each product'),
    ).toBe(true)
  })

  it('matches show chart and profit with product', () => {
    expect(
      matchProfitByProductGraphIntent('show me a bar chart of profit for each product line'),
    ).toBe(true)
  })

  it('does not match customer-request dashboard phrasing', () => {
    expect(matchProfitByProductGraphIntent('bar chart of customer requests')).toBe(false)
  })
})

describe('matchWarehouseBackfillPnlIntent', () => {
  it('matches add chart P&L warehouse orders script line', () => {
    expect(
      matchWarehouseBackfillPnlIntent(
        'Add a chart that shows what the P&L would be on filling all of the orders I don\'t have in my warehouse now',
      ),
    ).toBe(true)
  })

  it('does not match demand-only phrasing', () => {
    expect(matchWarehouseBackfillPnlIntent('Build me a bar chart of customer requests')).toBe(false)
  })
})
