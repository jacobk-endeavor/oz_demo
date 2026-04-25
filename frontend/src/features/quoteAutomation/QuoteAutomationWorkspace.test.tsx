import '@testing-library/jest-dom/vitest'
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
    expect(
      screen.getByRole('link', {
        name: 'docs/oz-demo/assets/fake-automation-source-document.pdf',
      }),
    ).toBeTruthy()
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
    expect(within(taskRail).getByText('Reviewing voice memo')).toBeTruthy()
    expect(within(taskRail).getByText('Extracting requested products')).toBeTruthy()
    expect(within(taskRail).getByText('Reviewing specs')).toBeTruthy()
    expect(within(taskRail).getByText('Pulling quote template')).toBeTruthy()
    expect(within(taskRail).getByText('Checking pricing guidance')).toBeTruthy()
    expect(within(taskRail).getByText('Finding upsell/cross-sell additions')).toBeTruthy()
    expect(within(taskRail).getByText('Preparing draft quote')).toBeTruthy()

    const advanceButton = screen.getByRole('button', { name: /Advance background review/i })
    fireEvent.click(advanceButton)

    expect(within(taskRail).getAllByText('complete').length).toBe(1)
    expect(within(taskRail).getByText('Extracting requested products')).toBeTruthy()

    for (let index = 0; index < 6; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Advance background review/i }))
    }

    expect(within(taskRail).getAllByText('complete').length).toBe(7)
    expect(screen.getByRole('button', { name: /Send for rep review/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Open quote draft/i })).toBeTruthy()
  })

  it('shows review-ready confirmation after the rep review action', () => {
    render(<QuoteAutomationWorkspace />)

    for (let index = 0; index < 7; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Advance background review/i }))
    }

    fireEvent.click(screen.getByRole('button', { name: /Send for rep review/i }))

    expect(screen.getByText('Review ready')).toBeTruthy()
    expect(screen.getByText('Review-ready / queued for rep')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Submitted for rep review/i })).toBeTruthy()
    expect(screen.getByRole('status')).toHaveTextContent(/Sami can validate the assumptions/i)
  })
})
