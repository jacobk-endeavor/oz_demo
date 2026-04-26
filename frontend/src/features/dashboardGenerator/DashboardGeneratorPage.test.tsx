import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { DashboardGeneratorPage } from './DashboardGeneratorPage'

describe('DashboardGeneratorPage', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the hero prompt, chart tiles, and browse section', () => {
    render(<DashboardGeneratorPage />)
    expect(screen.getByTestId('dashboard-workflow')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-builder-chat')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '→ Build charts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '→ Build charts' })).toBeInTheDocument()
    expect(screen.getByText('Published charts')).toBeInTheDocument()
  })

  it('opens the publish flow for a single chart from the tile and shows a share URL', async () => {
    const user = userEvent.setup()
    render(<DashboardGeneratorPage />)

    const publishButtons = screen.getAllByTestId('dashboard-chart-tile-publish')
    expect(publishButtons.length).toBeGreaterThan(0)
    await user.click(publishButtons[0]!)

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Publish dashboard' }))

    expect(
      await within(dialog).findByText(/Dashboard is published/i, undefined, { timeout: 5000 }),
    ).toBeInTheDocument()

    expect(
      (within(dialog).getByTestId('published-share-url').textContent ?? '').length,
    ).toBeGreaterThan(10)
  }, 8_000)

  it('does not mount the preview aside until a chart tile or group preview is active', () => {
    render(<DashboardGeneratorPage />)
    expect(screen.queryByTestId('dashboard-display-panel')).not.toBeInTheDocument()
  })

  it('shows the display panel and preview when a chart tile is selected', async () => {
    const user = userEvent.setup()
    render(<DashboardGeneratorPage />)

    const tiles = screen.getAllByTestId('dashboard-chart-tile')
    expect(tiles.length).toBeGreaterThan(0)
    await user.click(tiles[0]!)

    const panel = screen.getByTestId('dashboard-display-panel')
    expect(panel).toBeInTheDocument()
    expect(within(panel).getByText(/Selected chart/i)).toBeInTheDocument()
  })

  it('shows every chart in the batch when the group title preview is clicked', async () => {
    const user = userEvent.setup()
    render(<DashboardGeneratorPage />)

    const group = screen.getAllByTestId('dashboard-your-charts-group')[0]!
    await user.click(within(group).getByRole('button', { name: /Preview all/i }))

    const panel = screen.getByTestId('dashboard-display-panel')
    expect(within(panel).getByText(/Chart set/i)).toBeInTheDocument()
    expect(within(panel).getByText('Product lines requested (customers)')).toBeInTheDocument()
    expect(within(panel).getByText('Demand by lead source')).toBeInTheDocument()
    expect(within(panel).getAllByTestId('dashboard-bar-chart-data-table').length).toBe(2)
  })

  it('opens publish from the article (group) header button', async () => {
    const user = userEvent.setup()
    render(<DashboardGeneratorPage />)

    const groupPublish = screen.getAllByTestId('dashboard-your-charts-group-publish')[0]!
    await user.click(groupPublish)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Publish dashboard' })).toBeInTheDocument()
  })
})
