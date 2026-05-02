import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlideOutPanel } from './SlideOutPanel'
import { useOzSlideOutMobileSheetLayout } from './useOzSlideOutMobileSheetLayout'

const tablePayload = {
  title: 'Metrics',
  columns: [{ key: 'k', label: 'Key', kind: 'text' as const }],
  rows: [{ id: 'r1', cells: { k: 'v' } }],
}

function mockMatchMedia(matchesMobile: boolean) {
  const mql = {
    matches: matchesMobile,
    media: '(max-width: 767px)',
    onchange: null as null | (() => void),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_: string, cb: () => void) => {
      mql.onchange = cb
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    if (query === '(max-width: 767px)') {
      return mql as unknown as MediaQueryList
    }
    return {
      matches: false,
      media: String(query),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList
  })
  return mql
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SlideOutPanel', () => {
  beforeEach(() => {
    mockMatchMedia(false)
  })

  it('renders nothing when closed', () => {
    const onClose = vi.fn()
    const { container } = render(
      <SlideOutPanel open={false} onClose={onClose} panelKind="table" payload={tablePayload} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows registry-backed table empty state for kind table', () => {
    render(<SlideOutPanel open onClose={() => {}} panelKind="table" payload={null} />)
    expect(screen.getByTestId('oz-slide-out-panel')).toBeInTheDocument()
    expect(screen.getByText(/Table data unavailable/i)).toBeInTheDocument()
  })

  it('opens with registry body for table kind and closes via button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SlideOutPanel open onClose={onClose} panelKind="table" payload={tablePayload} />)

    expect(screen.getByTestId('oz-slide-out-panel')).toBeInTheDocument()
    expect(screen.getByTestId('oz-panel-table')).toBeInTheDocument()
    expect(screen.getByText('Metrics')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close panel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SlideOutPanel open onClose={onClose} panelKind="chart" payload={{ title: 'c' }} />)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(
      <SlideOutPanel open onClose={onClose} panelKind="table" payload={{}} />,
    )
    const backdrop = container.querySelector('button[aria-label="Close panel backdrop"]')
    expect(backdrop).toBeTruthy()
    await user.click(backdrop!)
    expect(onClose).toHaveBeenCalled()
  })

  it('uses unsupported fallback for unknown kinds', () => {
    render(<SlideOutPanel open onClose={() => {}} panelKind="unknown_xyz" payload={{ hint: 1 }} />)
    expect(screen.getByText('Unsupported panel')).toBeInTheDocument()
  })

  it('keeps Tab focus inside the dialog', async () => {
    const user = userEvent.setup()
    render(<SlideOutPanel open onClose={() => {}} panelKind="table" payload={tablePayload} />)

    const closeBtn = screen.getByRole('button', { name: 'Close panel' })
    closeBtn.focus()
    await user.tab()
    const dialog = screen.getByTestId('oz-slide-out-panel')
    expect(dialog.contains(document.activeElement)).toBe(true)

    await user.tab({ shift: true })
    expect(document.activeElement).toBe(closeBtn)
  })

  it('uses bottom-sheet layout attributes when viewport matches mobile breakpoint', () => {
    mockMatchMedia(true)
    const { container } = render(<SlideOutPanel open onClose={() => {}} panelKind="chart" payload={{}} />)
    const root = container.querySelector('[data-oz-slideout-root]')
    expect(root).toHaveAttribute('data-oz-slideout-variant', 'sheet')
    expect(screen.getByRole('dialog').className).toMatch(/rounded-t-2xl/)
  })

  it('uses drawer layout when viewport is wide', () => {
    mockMatchMedia(false)
    const { container } = render(<SlideOutPanel open onClose={() => {}} panelKind="chart" payload={{}} />)
    const root = container.querySelector('[data-oz-slideout-root]')
    expect(root).toHaveAttribute('data-oz-slideout-variant', 'drawer')
    expect(screen.getByRole('dialog').className).toMatch(/border-l/)
  })
})

describe('useOzSlideOutMobileSheetLayout', () => {
  it('reflects matchMedia for the slide-out breakpoint', () => {
    mockMatchMedia(true)
    function Read() {
      const mobile = useOzSlideOutMobileSheetLayout()
      return <span data-testid="mq">{mobile ? 'mobile' : 'wide'}</span>
    }
    render(<Read />)
    expect(screen.getByTestId('mq')).toHaveTextContent('mobile')
  })
})
