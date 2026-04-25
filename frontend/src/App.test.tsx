import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
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

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

// ── getHashPage unit tests ──────────────────────────────────────────────────

describe('getHashPage()', () => {
  it('returns chat for empty hash', () => {
    window.location.hash = ''
    expect(getHashPage()).toBe('chat')
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

  it('defaults to chat for unknown hash', () => {
    window.location.hash = '#/unknown'
    expect(getHashPage()).toBe('chat')
  })
})

// ── App integration smoke tests ─────────────────────────────────────────────

describe('App', () => {
  it('renders ChatPage by default', () => {
    window.location.hash = ''
    render(<App />)
    expect(screen.getByTestId('chat-page')).toBeInTheDocument()
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
    window.location.hash = ''
    render(<App />)
    expect(screen.getByTestId('chat-page')).toBeInTheDocument()

    await act(async () => {
      window.location.hash = '#/graph'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByTestId('graph-page')).toBeInTheDocument()
  })

  it('switches back to ChatPage on hashchange from graph', async () => {
    window.location.hash = '#/graph'
    render(<App />)
    expect(screen.getByTestId('graph-page')).toBeInTheDocument()

    await act(async () => {
      window.location.hash = '#/chat'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByTestId('chat-page')).toBeInTheDocument()
  })
})
