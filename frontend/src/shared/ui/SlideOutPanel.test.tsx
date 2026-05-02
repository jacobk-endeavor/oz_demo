import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlideOutPanel } from './SlideOutPanel'

afterEach(() => {
  cleanup()
})

describe('SlideOutPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <SlideOutPanel open={false} onClose={() => {}} panelKind="table" payload={{}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows registry-backed table empty state for kind table', () => {
    render(<SlideOutPanel open onClose={() => {}} panelKind="table" payload={null} />)
    expect(screen.getByTestId('oz-slide-out-panel')).toBeInTheDocument()
    expect(screen.getByText(/Table data unavailable/i)).toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SlideOutPanel open onClose={onClose} panelKind="table" payload={{}} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(
      <SlideOutPanel open onClose={onClose} panelKind="table" payload={{}} />,
    )
    const backdrop = container.querySelector('.absolute.inset-0.cursor-default')
    expect(backdrop).toBeTruthy()
    await user.click(backdrop!)
    expect(onClose).toHaveBeenCalled()
  })
})
