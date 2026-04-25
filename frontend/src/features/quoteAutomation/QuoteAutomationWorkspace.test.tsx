import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { QuoteAutomationWorkspace } from './QuoteAutomationWorkspace'

describe('QuoteAutomationWorkspace', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the quote automation workspace with the review-gated outcome', () => {
    render(<QuoteAutomationWorkspace />)

    expect(screen.getByText(/Review workspace for Russin Lumber/i)).toBeTruthy()
    expect(screen.getByText('80% done')).toBeTruthy()
    expect(screen.getByText(/Needs rep review, not final pricing/i)).toBeTruthy()
    expect(screen.getByText(/80% done \/ needs rep review/i)).toBeTruthy()
  })

  it('shows the fake PDF source reference, extracted fields, and voice memo input', () => {
    render(<QuoteAutomationWorkspace />)

    expect(screen.getAllByText('fake-automation-source-document.pdf').length).toBeGreaterThan(0)
    expect(screen.getByText('Field voice memo')).toBeTruthy()
    expect(screen.getByText(/Composite decking bundle for regional contractor program/i)).toBeTruthy()
    expect(screen.getByText(/Delivery address missing/i)).toBeTruthy()
  })

  it('shows quote lines, pricing assumptions, missing information, and suggestions', () => {
    render(<QuoteAutomationWorkspace />)

    expect(screen.getByText('Composite decking bundle')).toBeTruthy()
    expect(screen.getByText('$31,800 - $38,900')).toBeTruthy()
    expect(screen.getByText(/Here is a rough estimate, not final approved pricing/i)).toBeTruthy()
    expect(screen.getByText('Exact square footage')).toBeTruthy()
    expect(screen.getByText('Add hidden fastener system')).toBeTruthy()
    expect(screen.getByText('Ask about exterior trim phase')).toBeTruthy()
  })

  it('advances the task rail through review, template, pricing, and quote preparation', () => {
    render(<QuoteAutomationWorkspace />)

    const taskRail = screen.getByLabelText('Quote automation task rail')
    expect(within(taskRail).getByText('Review voice memo')).toBeTruthy()
    expect(within(taskRail).getByText('Pull quote template')).toBeTruthy()
    expect(within(taskRail).getByText('Check pricing guidance')).toBeTruthy()
    expect(within(taskRail).getByText('Prepare draft quote')).toBeTruthy()

    const advanceButton = screen.getByRole('button', { name: /Advance background review/i })
    fireEvent.click(advanceButton)

    expect(within(taskRail).getAllByText('complete').length).toBe(1)
    expect(within(taskRail).getByText('Review source PDF')).toBeTruthy()

    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Advance background review/i }))
    }

    expect(within(taskRail).getAllByText('complete').length).toBe(5)
    expect(screen.getByRole('button', { name: /Send for rep review/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Open quote draft/i })).toBeTruthy()
  })
})
