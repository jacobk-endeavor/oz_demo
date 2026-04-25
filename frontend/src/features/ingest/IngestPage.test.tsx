import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { IngestPage } from './IngestPage'

describe('IngestPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders the page title and Begin processing button', () => {
    render(<IngestPage />)
    expect(screen.getByText('Ingest a document')).toBeTruthy()
    expect(screen.getByTestId('ingest-begin-button')).toBeTruthy()
  })

  it('renders the file dropzone and category picker', () => {
    render(<IngestPage />)
    expect(screen.getByRole('button', { name: /file drop zone/i })).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g. hvac, sales, finance')).toBeTruthy()
  })

  it('shows the not-yet-wired note after clicking Begin processing and makes no network call', () => {
    render(<IngestPage />)

    // Simulate selecting a file via the hidden input
    const fileInput = screen.getByTestId('file-input')
    const fakeFile = new File(['hello'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [fakeFile] } })

    // Click the Begin processing button
    const beginButton = screen.getByTestId('ingest-begin-button')
    fireEvent.click(beginButton)

    // The "not yet wired" note must be visible
    const note = screen.getByRole('status')
    expect(note.textContent).toMatch(/Ingest via UI is not yet wired/i)

    // No network call was made
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('Begin processing button looks enabled (not disabled)', () => {
    render(<IngestPage />)
    const beginButton = screen.getByTestId('ingest-begin-button') as HTMLButtonElement
    expect(beginButton.disabled).toBe(false)
  })
})
