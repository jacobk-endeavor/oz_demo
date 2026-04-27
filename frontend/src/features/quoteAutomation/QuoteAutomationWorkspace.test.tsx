import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEMO_REP_FIRST_NAME } from '../../config/demoRep'
import { QuoteAutomationWorkspace } from './QuoteAutomationWorkspace'

describe('QuoteAutomationWorkspace', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the quote automation workspace with the review-gated outcome', () => {
    render(<QuoteAutomationWorkspace />)

    expect(screen.getByText(/Review workspace for Summit Ridge Framing/i)).toBeTruthy()
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
    expect(screen.getByText(/SPF dimensional 2×6 \/ 2×10 for walls and plates/i)).toBeTruthy()
    expect(screen.getByText(/Three flatbed drops — align to site crane calendar/i)).toBeTruthy()
  })

  it('shows lumber quote lines, pricing assumptions, missing information, and suggestions', () => {
    render(<QuoteAutomationWorkspace />)

    expect(screen.getByText('SPF dimensional & stud packs (walls / plates)')).toBeTruthy()
    expect(screen.getByText('$268,000 - $292,000')).toBeTruthy()
    expect(screen.getByText(/Rough yard estimate — not released lumber PO pricing/i)).toBeTruthy()
    expect(screen.getByText('Final piece counts from field verify')).toBeTruthy()
    expect(screen.getByText('Hold moisture / job-site coverage line')).toBeTruthy()
    expect(screen.getByText('Quote alternate mill for I-joist')).toBeTruthy()
  })

  it('shows the lumber invoice preview and Job Cost template for Summit Ridge', () => {
    render(<QuoteAutomationWorkspace />)

    expect(screen.getByTestId('lumber-invoice-preview')).toBeInTheDocument()
    expect(screen.getByText(/INV-Q25-4420-LUM/i)).toBeInTheDocument()
    expect(screen.getByText(/Template example — Summit Ridge Framing/i)).toBeInTheDocument()
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
    expect(screen.getByRole('status')).toHaveTextContent(
      new RegExp(`${DEMO_REP_FIRST_NAME} can validate the assumptions`, 'i'),
    )
  })
})
