import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { CallMiningPage } from './CallMiningPage'
import { callMiningInteractions } from './demoData'

afterEach(() => {
  cleanup()
})

describe('CallMiningPage', () => {
  it('renders a mixed source table with a colored location chip on every row', () => {
    render(<CallMiningPage />)

    expect(screen.getByRole('heading', { name: /call, note, and email mining/i })).toBeInTheDocument()
    expect(screen.getAllByText('Call center call').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Note').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Email').length).toBeGreaterThan(0)

    const table = screen.getByRole('table')
    expect(within(table).getAllByTestId('call-mining-row')).toHaveLength(
      callMiningInteractions.length,
    )

    const locationChips = within(table).getAllByTestId('location-chip')
    expect(locationChips).toHaveLength(callMiningInteractions.length)
    expect(locationChips.some((chip) => chip.dataset.locationTag === 'zoom')).toBe(true)
    expect(locationChips.some((chip) => chip.dataset.locationTag === 'phone_call')).toBe(true)
    expect(locationChips.some((chip) => chip.dataset.locationTag === 'in_person')).toBe(true)

    expect(locationChips.find((chip) => chip.dataset.locationTag === 'zoom')).toHaveStyle({
      borderColor: '#23B8FF',
    })
    expect(locationChips.find((chip) => chip.dataset.locationTag === 'phone_call')).toHaveStyle({
      borderColor: '#E10600',
    })
    expect(locationChips.find((chip) => chip.dataset.locationTag === 'in_person')).toHaveStyle({
      borderColor: '#F5F7FF',
    })
  })

  it('searches and filters the interaction records', async () => {
    const user = userEvent.setup()
    render(<CallMiningPage />)

    await user.type(
      screen.getByPlaceholderText(/search company, topic, product, complaint/i),
      'Russin Lumber',
    )

    expect(within(screen.getByRole('table')).getAllByTestId('call-mining-row')).toHaveLength(3)

    await user.selectOptions(screen.getByLabelText(/medium/i), 'email')

    expect(within(screen.getByRole('table')).getAllByTestId('call-mining-row')).toHaveLength(1)
    expect(screen.queryByText('Hudson Valley Supply')).not.toBeInTheDocument()
  })

  it('uses query buttons to filter source rows and show a grounded Oz answer', async () => {
    const user = userEvent.setup()
    render(<CallMiningPage />)

    const complaintsButton = screen.getByRole('button', { name: /customer complaints/i })
    await user.click(complaintsButton)

    const complaintRecords = callMiningInteractions.filter((record) =>
      record.tags.includes('complaints'),
    )

    expect(complaintsButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(`Source records: ${complaintRecords.length}`)).toBeInTheDocument()
    expect(screen.getByText(/recommended action/i)).toBeInTheDocument()
    expect(screen.getByText(/ranked evidence/i)).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByTestId('call-mining-row')).toHaveLength(
      complaintRecords.length,
    )
  })
})
