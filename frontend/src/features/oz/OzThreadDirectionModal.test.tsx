import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OzThreadDirectionModal } from './OzThreadDirectionModal'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('OzThreadDirectionModal', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          status: 200,
          text: () => Promise.resolve('null'),
        }),
      ),
    )
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<OzThreadDirectionModal open threadId="t1" onClose={onClose} />)

    await screen.findByRole('heading', { name: /task direction/i })
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('confirm shortcut from primary textarea submits via PUT', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            thread_id: 't1',
            tenant: 'demo',
            direction_text: 'hello',
            structured_refs: [],
            set_at: new Date().toISOString(),
            set_by: 'oz-chat-ui',
          }),
      } as Response),
    )

    const onClose = vi.fn()
    render(<OzThreadDirectionModal open threadId="t1" onClose={onClose} />)

    const ta = await screen.findByPlaceholderText(/what should oz optimize/i)
    await user.type(ta, 'hello')
    await user.keyboard('{Enter}')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const putCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PUT')
    expect(putCall).toBeDefined()
    expect(onClose).toHaveBeenCalled()
  })
})
