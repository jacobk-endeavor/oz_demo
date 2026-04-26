import { describe, expect, it } from 'vitest'
import { matchProductRequestCustomerDashboardIntent } from './productRequestDashboardIntent'

describe('matchProductRequestCustomerDashboardIntent', () => {
  it('matches the primary user phrase', () => {
    expect(
      matchProductRequestCustomerDashboardIntent(
        'Generate a dashboard based on product requests from my customers',
      ),
    ).toBe(true)
  })

  it('matches compact phrasing', () => {
    expect(matchProductRequestCustomerDashboardIntent('show me a customer product request dashboard')).toBe(
      true,
    )
    expect(matchProductRequestCustomerDashboardIntent('product request dashboard')).toBe(true)
    expect(
      matchProductRequestCustomerDashboardIntent('give me a dashboard of the products requested'),
    ).toBe(true)
  })

  it('matches build me a bar chart of what my customers have been requesting', () => {
    expect(
      matchProductRequestCustomerDashboardIntent(
        'Build me a bar chart of what my customers have been requesting',
      ),
    ).toBe(true)
  })

  it('matches generate a chart of customer or consumer requests (inline bar chart)', () => {
    expect(matchProductRequestCustomerDashboardIntent('generate a chart of consumer requests')).toBe(true)
    expect(matchProductRequestCustomerDashboardIntent('bar chart of customer requests')).toBe(true)
    expect(
      matchProductRequestCustomerDashboardIntent('show me a chart of what my customers requested'),
    ).toBe(true)
  })

  it('does not match unrelated chat', () => {
    expect(matchProductRequestCustomerDashboardIntent('give me milwaukee distributors')).toBe(false)
    expect(matchProductRequestCustomerDashboardIntent('hello')).toBe(false)
  })
})
