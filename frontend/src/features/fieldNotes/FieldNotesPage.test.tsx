import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { FieldNotesPage } from './FieldNotesPage'

afterEach(() => {
  cleanup()
})

describe('FieldNotesPage', () => {
  it('renders the managerial dashboard with voice memos and weekly boxes', () => {
    render(<FieldNotesPage />)

    expect(screen.getByTestId('field-notes-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Field Notes/i, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/Incoming voice memos/i)).toBeInTheDocument()
    const memoTable = screen.getByTestId('field-notes-memo-table')
    expect(memoTable).toBeInTheDocument()
    expect(memoTable).toHaveTextContent('Hudson Valley Lumber')
    expect(memoTable).toHaveTextContent('Marcus Chen')
    expect(screen.getByText(/High priority information/i)).toBeInTheDocument()
    const priorityPanel = screen.getByTestId('field-notes-priority-panel')
    expect(priorityPanel).toBeInTheDocument()
    expect(priorityPanel).toHaveTextContent(/Weyerhaeuser/i)
    expect(screen.getAllByTestId('field-notes-priority-brief').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Delete brief' }).length).toBe(
      screen.getAllByTestId('field-notes-priority-brief').length,
    )
    expect(screen.getByText(/Important information/i)).toBeInTheDocument()
    expect(screen.getByTestId('field-notes-important-boxes')).toBeInTheDocument()
    expect(screen.getByText('Top asks')).toBeInTheDocument()
    expect(screen.getByText('Risks & follow-ups')).toBeInTheDocument()
    expect(screen.getByText('Opportunities')).toBeInTheDocument()
  })

  it('does not render the old mobile orb demo', () => {
    render(<FieldNotesPage />)
    expect(screen.queryByTestId('oz-orb')).not.toBeInTheDocument()
    expect(screen.queryByTestId('field-notes-advance')).not.toBeInTheDocument()
  })
})
