import { describe, expect, it } from 'vitest'
import {
  formatCompactUsd,
  getSpendProfileForCompanyUrl,
} from './leadSpendProfiles'
import { buildDemoDistributorRows } from './demoDistributorRows'

describe('leadSpendProfiles', () => {
  it('attaches spend only to the first five companies by seed URL', () => {
    const rows = buildDemoDistributorRows('standard')
    const withSpend = rows.filter((r) => r.spendProfile != null)
    expect(withSpend).toHaveLength(5)
    expect(withSpend.map((r) => r.name)).toEqual([
      'Hudson Valley Deck & Porch Co.',
      'North River Lumber & Building Supply',
      'Sensient Technologies Corporation',
      'A. O. Smith Corporation',
      'A. O. Smith Corporation (duplicate listing)',
    ])
  })

  it('formatCompactUsd formats mid amounts', () => {
    expect(formatCompactUsd(1_200_000)).toBe('$1.2M')
    expect(formatCompactUsd(840_000)).toBe('$840k')
  })

  it('lookup by URL returns profile for the Hudson Valley contractor seed', () => {
    const p = getSpendProfileForCompanyUrl('https://www.linkedin.com/company/hudson-valley-deck-porch')
    expect(p).toBeDefined()
    expect(p!.months).toHaveLength(12)
    expect(p!.ltmSpendUsd).toBeGreaterThan(0)
  })
})
