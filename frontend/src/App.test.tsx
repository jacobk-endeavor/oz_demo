import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import App, { getHashPage } from './App'

// Mock all page components so the test doesn't need their full dependency tree
vi.mock('./features/chat/ChatPage', () => ({
  ChatPage: () => <div data-testid="chat-page">ChatPage</div>,
}))
vi.mock('./features/graph/GraphPage', () => ({
  GraphPage: () => <div data-testid="graph-page">GraphPage</div>,
}))
vi.mock('./features/ingest/IngestPage', () => ({
  IngestPage: () => <div data-testid="ingest-page">IngestPage</div>,
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

// ── getHashPage unit tests ──────────────────────────────────────────────────

describe('getHashPage()', () => {
  it('returns oz for empty hash', () => {
    window.location.hash = ''
    expect(getHashPage()).toBe('oz')
  })

  it('returns oz for #/oz', () => {
    window.location.hash = '#/oz'
    expect(getHashPage()).toBe('oz')
  })

  it('returns field notes for #/field-notes', () => {
    window.location.hash = '#/field-notes'
    expect(getHashPage()).toBe('field-notes')
  })

  it('returns graph for #/graph', () => {
    window.location.hash = '#/graph'
    expect(getHashPage()).toBe('graph')
  })

  it('returns graph for #/graph?focus=obs_001', () => {
    window.location.hash = '#/graph?focus=obs_001'
    expect(getHashPage()).toBe('graph')
  })

  it('returns ingest for #/ingest', () => {
    window.location.hash = '#/ingest'
    expect(getHashPage()).toBe('ingest')
  })

  it('defaults to oz for unknown hash', () => {
    window.location.hash = '#/unknown'
    expect(getHashPage()).toBe('oz')
  })
})

// ── App integration smoke tests ─────────────────────────────────────────────

describe('App', () => {
  it('renders Oz by default', () => {
    window.location.hash = ''
    render(<App />)
    expect(screen.getByText('Oz voice command center')).toBeInTheDocument()
  })

  it('renders Field Notes when hash is #/field-notes', () => {
    window.location.hash = '#/field-notes'
    render(<App />)
    expect(screen.getByTestId('field-notes-page')).toBeInTheDocument()
  })

  it('renders GraphPage when hash is #/graph', () => {
    window.location.hash = '#/graph'
    render(<App />)
    expect(screen.getByTestId('graph-page')).toBeInTheDocument()
  })

  it('renders IngestPage when hash is #/ingest', () => {
    window.location.hash = '#/ingest'
    render(<App />)
    expect(screen.getByTestId('ingest-page')).toBeInTheDocument()
  })

  it('switches to GraphPage on hashchange event', async () => {
    window.location.hash = '#/oz'
    render(<App />)
    expect(screen.getByText('Oz voice command center')).toBeInTheDocument()

    await act(async () => {
      window.location.hash = '#/graph'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByTestId('graph-page')).toBeInTheDocument()
  })

  it('switches back to Oz on hashchange from graph', async () => {
    window.location.hash = '#/graph'
    render(<App />)
    expect(screen.getByTestId('graph-page')).toBeInTheDocument()

    await act(async () => {
      window.location.hash = '#/oz'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByText('Oz voice command center')).toBeInTheDocument()
  })

  it('navigates from lead generation to reports', () => {
    window.location.hash = '#/lead-generation'
    render(<App />)
    expect(screen.getByTestId('lead-generation-page')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add to weekly report' }))

    expect(screen.getByTestId('reports-page')).toBeInTheDocument()
  })

  it('exposes primary Oz workflow navigation', () => {
    window.location.hash = '#/oz'
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Call Mining' }))

    expect(screen.getByTestId('call-mining-page')).toBeInTheDocument()
  })
})
