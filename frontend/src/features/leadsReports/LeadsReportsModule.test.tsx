import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { DEMO_REP_FIRST_NAME } from '../../config/demoRep'
import { LeadGenerationScreen, LeadsReportsModule, ReportingScreen } from './LeadsReportsModule'

afterEach(() => {
  cleanup()
})

describe('LeadGenerationScreen', () => {
  it('renders lookalike leads with contacts, phone numbers, reasons, and route stops', () => {
    render(<LeadGenerationScreen onAddToReport={vi.fn()} />)

    expect(screen.getByRole('heading', { name: /find nearby lookalike customers/i })).toBeTruthy()
    expect(screen.getAllByText('North Ridge Builders').length).toBeGreaterThan(0)
    expect(screen.getByText('Jordan Miles')).toBeInTheDocument()
    expect(screen.getAllByText('555-0142').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Matches Russin Lumber decking volume/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Stop 1').length).toBeGreaterThan(0)
  })

  it('shows an actionable route preview with talking points and product angles', () => {
    render(<LeadGenerationScreen onAddToReport={vi.fn()} />)

    const routePreview = screen.getByText(/Estimated travel time: 3 hr 45 min/i).closest('div')
    expect(routePreview).toBeTruthy()
    expect(screen.getByText(/Talking point: Open with faster composite decking/i)).toBeInTheDocument()
    expect(screen.getByText(/Product angle: Composite decking bundle/i)).toBeInTheDocument()
    expect(screen.getByText(/Call Jordan Miles at 555-0142/i)).toBeInTheDocument()
  })

  it('moves the insight into the report flow', async () => {
    const user = userEvent.setup()
    render(<LeadsReportsModule />)

    await user.click(screen.getByRole('button', { name: /add to weekly report/i }))

    expect(screen.getByRole('heading', { name: /weekly sales intelligence digest/i })).toBeTruthy()
    expect(screen.getByText(/North Ridge Builders: call Jordan Miles/i)).toBeInTheDocument()
  })
})

describe('ReportingScreen', () => {
  it('renders weekly digest sections, recipient list, cadence, and rep actions', () => {
    render(<ReportingScreen />)

    expect(screen.getByRole('heading', { name: /weekly sales intelligence digest/i })).toBeTruthy()
    expect(
      screen.getAllByText(/sami@example.com, sales@example.com, ops@example.com/i).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText(/Every Monday at 8:00 AM/i).length).toBeGreaterThan(0)
    expect(screen.getByText('Top product requests')).toBeInTheDocument()
    expect(screen.getByText('Top complaints')).toBeInTheDocument()
    expect(screen.getByText('Competitor mentions')).toBeInTheDocument()
    expect(screen.getByText('New lookalike leads')).toBeInTheDocument()
    expect(screen.getByText('Quote opportunities')).toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(`${DEMO_REP_FIRST_NAME} should call Jordan Miles today`, 'i')),
    ).toBeInTheDocument()
  })

  it('shows send and scheduled confirmations', async () => {
    const user = userEvent.setup()
    render(<ReportingScreen />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/Draft ready/i)

    await user.click(screen.getByRole('button', { name: /send digest now/i }))
    expect(status).toHaveTextContent(/Sent confirmation/i)

    await user.click(screen.getByRole('button', { name: /schedule weekly send/i }))
    expect(status).toHaveTextContent(/Scheduled confirmation/i)
  })

  it('keeps source records visible for traceability', () => {
    render(<ReportingScreen />)

    const productSection = screen.getByRole('heading', { name: 'Top product requests' }).closest('article')
    expect(productSection).toBeTruthy()
    expect(within(productSection as HTMLElement).getByText(/Sources: int_001/i)).toBeInTheDocument()
  })
})
