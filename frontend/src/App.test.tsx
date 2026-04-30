import { afterEach, describe, it, expect } from 'vitest'
import { render, screen, within, cleanup, act, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import App from './App'
import { getHashPage } from './app/workflows/workflowRouting'

afterEach(() => {
  cleanup()
  window.location.hash = ''
  try {
    window.localStorage.removeItem('oz-demo-assistant-collapsed')
    window.localStorage.removeItem('oz-demo-sidebar-collapsed')
    window.localStorage.removeItem('oz-demo-workflows-expanded')
    window.localStorage.removeItem('oz-demo-chat-rail-px')
  } catch {
    // ignore
  }
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

  it('defaults to oz for removed routes such as #/reports', () => {
    window.location.hash = '#/reports?focus=int_001'
    expect(getHashPage()).toBe('oz')
  })

  it('returns field-app for #/field-app', () => {
    window.location.hash = '#/field-app'
    expect(getHashPage()).toBe('field-app')
  })

  it('defaults to oz for legacy field mobile workflow hashes when not in the nav', () => {
    window.location.hash = '#/field-mw--customer-interactions'
    expect(getHashPage()).toBe('oz')
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
  it('renders the Oz home with chat only (no right-hand placeholder) until a chat or nav opens context', () => {
    window.location.hash = ''
    render(<App />)
    expect(screen.queryByTestId('workflow-placeholder')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Command center chat' })).toBeInTheDocument()
  })

  it('renders Field App as voice-only: orb on home, no text chat, no right-hand placeholder', () => {
    window.location.hash = '#/field-app'
    render(<App />)
    expect(screen.queryByTestId('workflow-placeholder')).not.toBeInTheDocument()
    expect(screen.getByTestId('field-app-surface')).toBeInTheDocument()
    expect(screen.getByTestId('field-app-voice-home')).toBeInTheDocument()
    expect(screen.getByTestId('field-app-orb')).toBeInTheDocument()
    expect(screen.getByTestId('pulse-orb')).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Command center chat' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Oz chat' })).not.toBeInTheDocument()
  })

  it('hides the primary left nav on Field App (orb only)', () => {
    window.location.hash = '#/field-app'
    render(<App />)
    expect(
      screen.queryByRole('navigation', { name: 'Primary navigation' }),
    ).not.toBeInTheDocument()
  })

  it('renders Field Notes when hash is #/field-notes', () => {
    window.location.hash = '#/field-notes'
    render(<App />)
    const page = screen.getByTestId('field-notes-page')
    expect(page).toBeInTheDocument()
    expect(within(page).getByRole('heading', { name: /Incoming voice memos/i })).toBeInTheDocument()
  })

  it('defaults #/call-mining to home when route is not registered', () => {
    window.location.hash = '#/call-mining'
    render(<App />)
    expect(screen.queryByTestId('workflow-placeholder')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Command center chat' })).toBeInTheDocument()
  })

  it('renders Dashboards when hash is #/dashboards', () => {
    window.location.hash = '#/dashboards'
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Dashboard Studio', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-workflow')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '→ Build charts' })).toBeInTheDocument()
  })

  it('renders Quote Automation when hash is #/quote-automation', () => {
    window.location.hash = '#/quote-automation'
    render(<App />)
    expect(screen.getByText(/Review workspace for Summit Ridge Framing/i)).toBeInTheDocument()
  })

  it('renders Quotes Ready for Review when hash is #/quotes-ready', () => {
    window.location.hash = '#/quotes-ready'
    render(<App />)
    expect(screen.getByTestId('quotes-ready-for-review-page')).toBeInTheDocument()
  })

  it('switches between workflows on hashchange', async () => {
    window.location.hash = '#/oz'
    render(<App />)
    expect(screen.queryByTestId('workflow-placeholder')).not.toBeInTheDocument()

    await act(async () => {
      window.location.hash = '#/dashboards'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByTestId('dashboard-workflow')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '→ Build charts' })).toBeInTheDocument()
  })

  it('navigates from nebula to dashboards via sidebar', async () => {
    window.location.hash = '#/nebula'
    render(<App />)
    expect(screen.getByTestId('nebula-hub-page')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: /Dashboard Studio/i }))
    })

    expect(screen.getByTestId('dashboard-workflow')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '→ Build charts' })).toBeInTheDocument()
  })

  it('exposes color-coded workflow navigation in the Workflows list', () => {
    window.location.hash = '#/nebula'
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard Studio' }))

    expect(screen.getByTestId('dashboard-workflow')).toBeInTheDocument()
  })

  it('exposes a collapsible sidebar', () => {
    window.location.hash = '#/oz'
    render(<App />)
    const collapseButton = screen.getByRole('button', { name: /Collapse sidebar/i })
    expect(collapseButton).toBeInTheDocument()
    fireEvent.click(collapseButton)
    expect(screen.getByRole('button', { name: /Expand sidebar/i })).toBeInTheDocument()
  })

  it('uses a full-page workflow view on Nebula without a default chat column', () => {
    window.location.hash = '#/nebula'
    render(<App />)

    expect(screen.queryByRole('region', { name: 'Command center chat' })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Oz chat' })).not.toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Context' })).toBeInTheDocument()
    expect(screen.getByTestId('nebula-hub-page')).toBeInTheDocument()
  })

  it('does not expose legacy chat/graph/ingest navigation', () => {
    window.location.hash = '#/oz'
    render(<App />)
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Graph' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ingest' })).not.toBeInTheDocument()
  })

  it('does not open the lead table from former Milwaukee-only chat phrasing on the home route', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/oz'
    render(<App />)

    await user.type(screen.getByPlaceholderText('Ask Oz…'), 'distributors in Milwaukee')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => {
      expect(screen.queryByTestId('lead-gen-distributors-table')).not.toBeInTheDocument()
    })
  })
})
