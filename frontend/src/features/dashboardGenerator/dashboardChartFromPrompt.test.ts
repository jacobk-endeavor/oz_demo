import { describe, expect, it } from 'vitest'
import { buildDefaultChartsFromData, generateChartsFromPrompt, heuristicsChartsForPrompt } from './dashboardChartFromPrompt'

describe('heuristicsChartsForPrompt', () => {
  it('returns default data charts for generic text', () => {
    const c = heuristicsChartsForPrompt('show me something')
    expect(c.length).toBeGreaterThanOrEqual(1)
  })

  it('adds a line chart when the user asks for trend / time', () => {
    const c = heuristicsChartsForPrompt('I want a line chart of demand over the last 12 months')
    expect(c.some((x) => x.kind === 'line')).toBe(true)
  })

  it('uses a single products-requested bar when the user asks for a dashboard (offline heuristics)', () => {
    const c = heuristicsChartsForPrompt('I need a dashboard for my accounts')
    expect(c).toHaveLength(1)
    expect(c[0]!.kind).toBe('bar')
    expect(c[0]!.title).toMatch(/products requested/i)
    expect(c[0]!.series.length).toBeGreaterThan(0)
  })
})

describe('buildDefaultChartsFromData', () => {
  it('returns two bar series', () => {
    const c = buildDefaultChartsFromData()
    expect(c).toHaveLength(2)
    expect(c[0].kind).toBe('bar')
    expect(c[1].kind).toBe('bar')
  })
})

describe('generateChartsFromPrompt', () => {
  it('works offline (tests) via heuristics', async () => {
    const c = await generateChartsFromPrompt('default dashboard')
    expect(c.length).toBeGreaterThan(0)
  })
})
