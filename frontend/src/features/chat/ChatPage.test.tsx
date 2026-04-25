import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { ChatPage } from './ChatPage'

// jsdom doesn't implement scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// Mock the shared API client
vi.mock('../../shared/api/client', () => ({
  api: {
    post: vi.fn(),
  },
}))

import { api } from '../../shared/api/client'
const mockPost = vi.mocked(api.post)

describe('ChatPage', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends a message on Enter and displays assistant reply with citation pill', async () => {
    const user = userEvent.setup()

    mockPost.mockResolvedValueOnce({
      reply: 'Here is an insight from your knowledge base.',
      citations: [
        {
          kind: 'obs',
          id: 'obs_0042',
          statement: 'Revenue grew 15% YoY',
          layer: 1,
          category: 'finance',
          doc_slug: 'annual-report',
          wikilink: '[[obs_0042]]',
        },
      ],
      session_id: 'sess-abc',
    })

    render(<ChatPage />)

    const input = screen.getByTestId('composer-input')
    await user.type(input, 'What are the key findings?')
    await user.keyboard('{Enter}')

    expect(mockPost).toHaveBeenCalledWith('/api/chat', {
      message: 'What are the key findings?',
      session_id: null,
    })

    await waitFor(() => {
      expect(
        screen.getByText('Here is an insight from your knowledge base.'),
      ).toBeInTheDocument()
    })

    expect(screen.getByText('obs_0042')).toBeInTheDocument()
    expect(screen.getByText('obs')).toBeInTheDocument()
    expect(
      screen.getByText('What are the key findings?'),
    ).toBeInTheDocument()
  })

  it('shows error banner when API call fails', async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValueOnce(new Error('API error 500: Internal Server Error'))

    render(<ChatPage />)

    const input = screen.getByTestId('composer-input')
    await user.type(input, 'test')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(
        screen.getByText('API error 500: Internal Server Error'),
      ).toBeInTheDocument()
    })
  })

  it('disables composer while sending', async () => {
    const user = userEvent.setup()

    mockPost.mockReturnValue(new Promise(() => {}))

    render(<ChatPage />)

    const input = screen.getByTestId('composer-input')
    await user.type(input, 'hello')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByTestId('composer-input')).toBeDisabled()
      expect(screen.getByTestId('send-button')).toBeDisabled()
    })
  })
})
