import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import App, { getHashPage } from './App'

vi.mock('./features/oz/OzHomePage', () => ({
  OzHomePage: () => <div data-testid="oz-home-page">OzHomePage</div>,
}))
vi.mock('./features/oz/NebulaHubPage', () => ({
  NebulaHubPage: () => <div data-testid="nebula-hub-page">NebulaHubPage</div>,
}))
vi.mock('./features/fieldNotes', () => ({
  FieldNotesPage: () => <div data-testid="field-notes-page">FieldNotesPage</div>,
}))
vi.mock('./features/callMining', () => ({
  CallMiningPage: () => <div data-testid="call-mining-page">CallMiningPage</div>,
}))
vi.mock('./features/dashboardGenerator', () => ({
  DashboardGeneratorPage: () => <div data-testid="dashboards-page">DashboardGeneratorPage</div>,
}))
vi.mock('./features/quoteAutomation', () => ({
  QuoteAutomationWorkspace: () => <div data-testid="quote-automation-page">QuoteAutomationWorkspace</div>,
}))
vi.mock('./features/leadsReports', () => ({
  LeadGenerationScreen: ({ onAddToReport }: { onAddToReport: () => void }) => (
    <div data-testid="lead-generation-page">
      LeadGenerationScreen
      <button type="button" onClick={onAddToReport}>
        Add to weekly report
      </button>
    </div>
  ),
  ReportingScreen: () => <div data-testid="reports-page">ReportingScreen</div>,
}))

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('getHashPage()', () => {
  it('returns oz for empty hash', () => {
    window.location.hash = ''
    expect(getHashPage()).toBe('oz')
  })

  it('returns oz for #/oz', () => {
    window.location.hash = '#/oz'
    expect(getHashPage()).toBe('oz')
  })

  it('returns nebula for #/nebula', () => {
    window.location.hash = '#/nebula'
    expect(getHashPage()).toBe('nebula')
  })

  it('returns field notes for #/field-notes', () => {
    window.location.hash = '#/field-notes'
    expect(getHashPage()).toBe('field-notes')
  })

  it('returns dashboards for #/dashboards', () => {
    window.location.hash = '#/dashboards'
    expect(getHashPage()).toBe('dashboards')
  })

  it('returns reports for #/reports?focus=int_001', () => {
    window.location.hash = '#/reports?focus=int_001'
    expect(getHashPage()).toBe('reports')
  })

  it('defaults to oz for unknown hash including legacy routes', () => {
    window.location.hash = '#/chat'
    expect(getHashPage()).toBe('oz')
    window.location.hash = '#/graph'
    expect(getHashPage()).toBe('oz')
    window.location.hash = '#/ingest'
    expect(getHashPage()).toBe('oz')
    window.location.hash = '#/anything-else'
    expect(getHashPage()).toBe('oz')
  })
})

describe('App', () => {
  it('renders the Oz home by default', () => {
    window.location.hash = ''
    render(<App />)
    expect(screen.getByTestId('oz-home-page')).toBeInTheDocument()
  })

  it('renders Field Notes when hash is #/field-notes', () => {
    window.location.hash = '#/field-notes'
    render(<App />)
    expect(screen.getByTestId('field-notes-page')).toBeInTheDocument()
  })

  it('renders Call Mining when hash is #/call-mining', () => {
    window.location.hash = '#/call-mining'
    render(<App />)
    expect(screen.getByTestId('call-mining-page')).toBeInTheDocument()
  })

  it('renders Dashboards when hash is #/dashboards', () => {
    window.location.hash = '#/dashboards'
    render(<App />)
    expect(screen.getByTestId('dashboards-page')).toBeInTheDocument()
  })

  it('renders Quote Automation when hash is #/quote-automation', () => {
    window.location.hash = '#/quote-automation'
    render(<App />)
    expect(screen.getByTestId('quote-automation-page')).toBeInTheDocument()
  })

  it('switches between workflows on hashchange', async () => {
    window.location.hash = '#/oz'
    render(<App />)
    expect(screen.getByTestId('oz-home-page')).toBeInTheDocument()

    await act(async () => {
      window.location.hash = '#/dashboards'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByTestId('dashboards-page')).toBeInTheDocument()
  })

  it('navigates from lead generation to reports', () => {
    window.location.hash = '#/lead-generation'
    render(<App />)
    expect(screen.getByTestId('lead-generation-page')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add to weekly report' }))

    expect(screen.getByTestId('reports-page')).toBeInTheDocument()
  })

  it('exposes primary Oz workflow navigation in the sidebar', () => {
    window.location.hash = '#/oz'
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Call Mining' }))

    expect(screen.getByTestId('call-mining-page')).toBeInTheDocument()
  })

  it('exposes a collapsible sidebar', () => {
    window.location.hash = '#/oz'
    render(<App />)
    const collapseButton = screen.getByRole('button', { name: /Collapse sidebar/i })
    expect(collapseButton).toBeInTheDocument()
    fireEvent.click(collapseButton)
    expect(screen.getByRole('button', { name: /Expand sidebar/i })).toBeInTheDocument()
  })

  it('toggles the Oz chat rail open and closed from the workflow header', () => {
    window.location.hash = '#/oz'
    render(<App />)

    expect(screen.getByRole('complementary', { name: 'Oz assistant rail' })).toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /Hide Oz chat/i })
    fireEvent.click(toggle)

    expect(
      screen.queryByRole('complementary', { name: 'Oz assistant rail' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Show Oz chat/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Show Oz chat/i }))
    expect(screen.getByRole('complementary', { name: 'Oz assistant rail' })).toBeInTheDocument()
  })

  it('does not expose legacy chat/graph/ingest navigation', () => {
    window.location.hash = '#/oz'
    render(<App />)
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Graph' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ingest' })).not.toBeInTheDocument()
  })
})
