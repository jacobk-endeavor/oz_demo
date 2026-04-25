import { cleanup, render, screen, within } from '@testing-library/react'
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

    expect(
      await screen.findByRole('heading', { name: 'Quote Pipeline Studio' }),
    ).toBeInTheDocument()
  })

  it('toggles AI chat, dynamic graph, and Excel import add-ons on demand', async () => {
    const user = userEvent.setup()
    render(<DashboardGeneratorPage />)

    await user.click(screen.getByRole('button', { name: /Excel To Dashboard/i }))

    expect(screen.getByText('AI chat feature active')).toBeInTheDocument()
    expect(screen.getByText('Dynamic graph generation active')).toBeInTheDocument()
    expect(screen.getByText('Excel import active')).toBeInTheDocument()
    expect(screen.getByText(/mapped 8 columns/i)).toBeInTheDocument()
  })

  it('shows a mocked Excel upload control and refreshes the parsed preview', async () => {
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
  })

  it('runs the mock publish workflow from configure to published', async () => {
    const user = userEvent.setup()
    render(<DashboardGeneratorPage />)

    await user.click(screen.getByRole('button', { name: /Publish dashboard/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Mock publishing flow/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/Demo only: clicking publish/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Publish dashboard' }))

    expect(within(dialog).getByLabelText(/Publishing steps/i)).toBeInTheDocument()

    expect(
      await within(dialog).findByText(/Dashboard is published/i, undefined, { timeout: 4000 }),
    ).toBeInTheDocument()

    expect(
      within(dialog).getByTestId('published-share-url').textContent ?? '',
    ).toMatch(/^https:\/\/oz\.demo\/d\//)
    expect(within(dialog).getAllByText(/sami@example.com/i).length).toBeGreaterThan(0)

    await user.click(within(dialog).getByRole('button', { name: 'Done' }))

    expect(screen.getByTestId('dashboard-published-banner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Manage dashboard sharing/i })).toBeInTheDocument()
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0)
  })

  it('lets the user unpublish from the manage sharing modal', async () => {
    const user = userEvent.setup()
    render(<DashboardGeneratorPage />)

    await user.click(screen.getByRole('button', { name: /Publish dashboard/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Publish dashboard' }))
    await within(dialog).findByText(/Dashboard is published/i, undefined, { timeout: 4000 })
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))

    expect(screen.getByTestId('dashboard-published-banner')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Manage dashboard sharing/i }))
    const manageDialog = screen.getByRole('dialog')
    await user.click(within(manageDialog).getByRole('button', { name: 'Unpublish' }))

    expect(
      within(manageDialog).getByRole('heading', { name: /Publish dashboard/i }),
    ).toBeInTheDocument()

    await user.click(within(manageDialog).getByLabelText('Close'))

    expect(screen.queryByTestId('dashboard-published-banner')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Publish dashboard/i })).toBeInTheDocument()
  })
})
