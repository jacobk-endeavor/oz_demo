import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { FieldNotesPage } from './FieldNotesPage'

afterEach(() => {
  cleanup()
})

describe('FieldNotesPage', () => {
  it('renders the phone field notes surface with Oz prompts', () => {
    render(<FieldNotesPage />)

    expect(screen.getByText('Field Notes')).toBeInTheDocument()
    expect(screen.getByText('ABC Building Supply')).toBeInTheDocument()
    expect(screen.getByText('Tap to speak')).toBeInTheDocument()
    expect(screen.getByText('What should I ask next?')).toBeInTheDocument()
    expect(screen.getByTestId('oz-orb')).toHaveAttribute('data-state', 'idle')
  })

  it('progresses through listening, thinking, and output states without a microphone', () => {
    render(<FieldNotesPage />)

    const advanceButton = screen.getByTestId('field-notes-advance')

    fireEvent.click(advanceButton)
    expect(screen.getByTestId('oz-orb')).toHaveAttribute('data-state', 'listening')
    expect(screen.getByText('Listening...')).toBeInTheDocument()
    expect(screen.getByText(/They need slate gray composite decking/i)).toBeInTheDocument()

    fireEvent.click(advanceButton)
    expect(screen.getByTestId('oz-orb')).toHaveAttribute('data-state', 'thinking')
    expect(screen.getByText('Thinking')).toBeInTheDocument()
    expect(screen.getByLabelText('Rank customer intent')).toBeInTheDocument()

    fireEvent.click(advanceButton)
    expect(screen.getByTestId('oz-orb')).toHaveAttribute('data-state', 'speaking')
    expect(screen.getByText('Speaking')).toBeInTheDocument()
    expect(screen.getByText('Structured sales note')).toBeInTheDocument()
    expect(screen.getByText('Follow-up questions')).toBeInTheDocument()
    expect(screen.getByText('Upsell and cross-sell')).toBeInTheDocument()
    expect(screen.getByText('Pricing guidance')).toBeInTheDocument()
  })

  it('pushes concrete sales actions to Nebula in the final state', () => {
    render(<FieldNotesPage />)

    const advanceButton = screen.getByTestId('field-notes-advance')
    fireEvent.click(advanceButton)
    fireEvent.click(advanceButton)
    fireEvent.click(advanceButton)
    fireEvent.click(advanceButton)

    expect(screen.getByTestId('oz-orb')).toHaveAttribute('data-state', 'running_action')
    expect(screen.getByRole('status')).toHaveTextContent('Pushed to Nebula')
    expect(screen.getByText('Draft bundle quote')).toBeInTheDocument()
    expect(screen.getByText('Show product specs')).toBeInTheDocument()
    expect(screen.getByText('Send follow-up prompt')).toBeInTheDocument()
  })
})
