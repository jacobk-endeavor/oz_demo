import { describe, expect, it } from 'vitest'
import {
  detectRequestedFeature,
  generateDashboardFromPrompt,
  selectTemplateForPrompt,
} from './dashboardGenerator'

describe('dashboardGenerator helpers', () => {
  it('selects one of the hard-coded web app templates from prompt triggers', () => {
    expect(selectTemplateForPrompt('Build a quote approval queue for pricing').id).toBe(
      'quote_pipeline_studio',
    )
    expect(selectTemplateForPrompt('Create a route for similar prospects nearby').id).toBe(
      'lead_route_planner',
    )
    expect(selectTemplateForPrompt('Draft the weekly executive digest').id).toBe(
      'weekly_revenue_brief',
    )
    expect(selectTemplateForPrompt('Top product requests and complaints').id).toBe(
      'sales_demand_command_center',
    )
  })

  it('detects supported feature add-on requests', () => {
    expect(detectRequestedFeature('Add an AI chat feature')).toBe('ai_chat')
    expect(detectRequestedFeature('Add dynamic graph generation')).toBe(
      'dynamic_graph_generation',
    )
    expect(detectRequestedFeature('Turn this spreadsheet into a dashboard')).toBe(
      'excel_to_dashboard',
    )
  })

  it('grounds generated cards in the call-mining demo records', () => {
    const dashboard = generateDashboardFromPrompt(
      'Top product requests, customer complaints, and competitor pressure',
    )

    expect(dashboard.sourceSummary).toMatch(/60 demo interactions/i)
    expect(dashboard.template.defaultFeatures).toEqual(['ai_chat', 'dynamic_graph_generation'])
    expect(dashboard.modules[0].data.map((item) => item.label)).toEqual([
      'Composite decking',
      'Hidden fasteners',
      'Exterior trim',
    ])
    expect(dashboard.modules[0].source).toContain('int_001 Russin Lumber')
  })
})
