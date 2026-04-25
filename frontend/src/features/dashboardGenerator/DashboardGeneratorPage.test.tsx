import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { DashboardGeneratorPage } from './DashboardGeneratorPage'
import {
  detectRequestedFeature,
  generateDashboardFromPrompt,
  selectTemplateForPrompt,
} from './dashboardGenerator'

describe('dashboard generator helpers', () => {
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
    expect(dashboard.template.defaultFeatures).toEqual([
      'ai_chat',
      'dynamic_graph_generation',
    ])
    expect(dashboard.modules[0].data.map((item) => item.label)).toEqual([
      'Composite decking',
      'Hidden fasteners',
      'Exterior trim',
    ])
    expect(dashboard.modules[0].source).toContain('int_001 Russin Lumber')
    expect(dashboard.modules.flatMap((card) => card.data.map((item) => item.label))).not.toContain(
      'EcoShield Sealant',
    )
  })
})

describe('DashboardGeneratorPage', () => {
  afterEach(() => {
    cleanup()
  })

  it('generates a selected hard-coded web app template', async () => {
    const user = userEvent.setup()
    render(<DashboardGeneratorPage />)

    await user.click(screen.getByLabelText('Generate Quote Pipeline Studio'))

    expect(await screen.findByRole('heading', { name: 'Quote Pipeline Studio' })).toBeInTheDocument()
    expect(screen.getByText(/Open quotes/i)).toBeInTheDocument()
    expect(screen.getByText(/Oz: Quote Pipeline Studio is ready/i)).toBeInTheDocument()
  })

  it('adds visible AI chat, dynamic graph, and Excel import states', async () => {
    const user = userEvent.setup()
    render(<DashboardGeneratorPage />)

    await user.click(screen.getByRole('button', { name: /AI Chat Feature/i }))
    await user.click(screen.getByRole('button', { name: /Dynamic Graph Generation/i }))
    await user.click(screen.getByRole('button', { name: /Excel To Dashboard/i }))

    expect(screen.getByText('AI chat feature active')).toBeInTheDocument()
    expect(screen.getByText('Dynamic graph generation active')).toBeInTheDocument()
    expect(screen.getByText('Excel import active')).toBeInTheDocument()
    expect(screen.getByText(/mapped 8 columns/i)).toBeInTheDocument()
  })

  it('shows mocked Excel upload control and parsed preview state', async () => {
    const user = userEvent.setup()
    render(<DashboardGeneratorPage />)

    await user.click(screen.getByRole('button', { name: /Excel To Dashboard/i }))

    expect(screen.getByText(/Drop customer-interactions.xlsx here/i)).toBeInTheDocument()
    expect(screen.getByText(/Mock parsed preview/i)).toBeInTheDocument()
    expect(screen.getByText(/Interactions, Products, Leads/i)).toBeInTheDocument()

    const file = new File(['fake workbook'], 'oz-demo-call-mining.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await user.upload(screen.getByLabelText('Upload Excel source file'), file)

    expect(screen.getByText('oz-demo-call-mining.xlsx')).toBeInTheDocument()
    expect(screen.getByText(/Oz: Mock parsed oz-demo-call-mining.xlsx/i)).toBeInTheDocument()
  })

  it('routes chatbot add-on requests into the same visible states', async () => {
    const user = userEvent.setup()
    render(<DashboardGeneratorPage />)

    const prompt = screen.getByLabelText('App builder prompt')
    await user.clear(prompt)
    await user.type(prompt, 'Please add dynamic graph generation')
    await user.click(screen.getByRole('button', { name: 'Send to app builder' }))

    expect(screen.getByText('Dynamic graph generation active')).toBeInTheDocument()

    const transcript = screen.getByLabelText('App builder transcript')
    await waitFor(() => {
      expect(within(transcript).getByText(/Prompt-to-chart module added/i)).toBeInTheDocument()
    })
  })
})
