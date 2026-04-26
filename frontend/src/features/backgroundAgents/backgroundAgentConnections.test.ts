import { describe, expect, it } from 'vitest'
import { inferConnectionsFromText, resolveBackgroundAgentConnections } from './backgroundAgentConnections'

describe('inferConnectionsFromText', () => {
  it('picks Salesforce, Excel, and Outlook for a sales revenue email report', () => {
    const t =
      'Email a report of the best salesmen in the company based on revenue. Weekly at 9am.'
    const c = inferConnectionsFromText(t)
    const ds = c.map((x) => x.domain).sort()
    expect(ds).toEqual(['office.com', 'outlook.com', 'salesforce.com'].sort())
  })
})

describe('resolveBackgroundAgentConnections', () => {
  it('merges saved LLM companies with heuristics and dedupes by domain', () => {
    const r = resolveBackgroundAgentConnections(
      [
        { name: 'Slack', domain: 'slack.com' },
        { name: 'Salesforce', domain: 'salesforce.com' },
      ],
      {
        assignment: 'Rank reps and email the winner',
        taskDetail: 'Report from CRM by revenue, Excel export, send via Outlook',
        deliverable: 'Email with top rep',
        schedule: 'Mondays 9:00',
      },
    )
    const domains = r.map((x) => x.domain)
    expect(domains).toContain('salesforce.com')
    expect(new Set(domains).size).toBe(domains.length)
  })
})
