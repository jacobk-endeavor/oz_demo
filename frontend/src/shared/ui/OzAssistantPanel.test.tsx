import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OZ_DEFAULT_WELCOME, OzAssistantPanel } from './OzAssistantPanel'

afterEach(() => {
  cleanup()
})

function renderPanel(overrides: Record<string, unknown> = {}) {
  return render(
    <OzAssistantPanel
      contextSummary="Voice-first sales assistant. Ask for the next sales action."
      messages={[]}
      hideWelcome
      contextItems={[
        { label: 'page: oz', value: 'page: oz' },
        { label: 'Russin Lumber', value: 'Russin Lumber' },
      ]}
      {...overrides}
    />,
  )
}

describe('OzAssistantPanel', () => {
  it('renders the conversation surface, composer, and no tab strip or mode chrome', () => {
    renderPanel()
    const panel = screen.getByRole('complementary', { name: 'Oz chat' })
    expect(within(panel).getByLabelText('Oz conversation')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ask Oz…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Chat tabs' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mode: Ask' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument()
  })

  it('sends a message and shows a scripted reply in the thread', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByPlaceholderText('Ask Oz…'), 'next steps for the route')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(
      await screen.findByText(/The next move depends/, undefined, { timeout: 10_000 }),
    ).toBeInTheDocument()
  })

  it('defaults to a welcome line when the thread is empty and hideWelcome is not set', async () => {
    render(
      <OzAssistantPanel
        contextSummary="Demo"
        messages={[]}
        contextItems={[]}
      />,
    )
    const conversation = screen.getByLabelText('Oz conversation')
    expect(
      await within(conversation).findByText(new RegExp(OZ_DEFAULT_WELCOME.slice(0, 20))),
    ).toBeInTheDocument()
  })

  it('shows Used in this reply after attaching a file and sending', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : 'url' in input ? input.url : String(input)
      if (u.includes('/api/oz/chat/uploads')) {
        return Promise.resolve(new Response(null, { status: 404 }))
      }
      return Promise.reject(new Error(`unexpected fetch: ${u}`))
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      renderPanel({
        onUserMessage: async () => ({ reply: 'Acknowledged.', delayMs: 0, stream: false }),
      })
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
      const file = new File([pdfBytes], 'demo.pdf', { type: 'application/pdf' })
      await user.upload(screen.getByTestId('oz-composer-upload-input'), file)
      await user.type(screen.getByPlaceholderText('Ask Oz…'), 'Please review')
      await user.click(screen.getByRole('button', { name: 'Send message' }))
      expect(await screen.findByText('Acknowledged.')).toBeInTheDocument()
      expect(screen.getByText('Used in this reply')).toBeInTheDocument()
      expect(fetchMock).toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('applies layout dock for bottom strips', () => {
    render(
      <OzAssistantPanel
        contextSummary="Tables"
        messages={[]}
        layout="dock"
      />,
    )
    const aside = screen.getByRole('complementary', { name: 'Oz chat' })
    expect(aside).toHaveClass('border-t')
    expect(aside.className).toMatch(/max-h-\[min/)
  })
})
