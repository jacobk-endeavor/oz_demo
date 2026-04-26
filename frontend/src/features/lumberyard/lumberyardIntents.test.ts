import { describe, expect, it } from 'vitest'
import { matchLumberyardAnalyticsOrResearchIntent, matchLumberyardTableIntent } from './lumberyardIntents'

describe('matchLumberyardTableIntent', () => {
  it('matches customer request phrasing and close paraphrases', () => {
    expect(matchLumberyardTableIntent('What have my customers been requesting?')).toBe(true)
    expect(matchLumberyardTableIntent("what have my customers been asking for")).toBe(true)
    expect(matchLumberyardTableIntent('show me what our customers have been requesting lately')).toBe(true)
    expect(matchLumberyardTableIntent('What are our clients asking for this week?')).toBe(true)
    expect(matchLumberyardTableIntent('List what customers want to order')).toBe(true)
    expect(matchLumberyardTableIntent('Tell me what buyers are looking for')).toBe(true)
    expect(matchLumberyardTableIntent('latest customer requests')).toBe(true)
  })

  it('avoids non-demand “need to” phrasing', () => {
    expect(matchLumberyardTableIntent('What customers need to know about returns')).toBe(false)
  })
})

describe('matchLumberyardAnalyticsOrResearchIntent', () => {
  it('overlaps on similar customer-demand questions', () => {
    expect(
      matchLumberyardAnalyticsOrResearchIntent('Which products are our customers most interested in?'),
    ).toBe(true)
  })
})
