import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OzAssistantPanel, type OzAssistantMessage } from './OzAssistantPanel'

afterEach(() => {
  cleanup()
})

const seedMessages: OzAssistantMessage[] = [
  {
    id: 'oz-seed',
    role: 'oz',
    content: 'Pick a workflow on the left, or ask me what to do next.',
  },
]

function renderPanel() {
  return render(
    <OzAssistantPanel
      contextSummary="Voice-first sales assistant. Ask for the next sales action."
      messages={seedMessages}
      contextItems={[
        { label: 'page: oz', value: 'page: oz' },
        { label: 'Russin Lumber', value: 'Russin Lumber' },
      ]}
      suggestedPrompts={[
        { id: 'next', label: 'What is the next sales action?' },
        { id: 'top', label: 'Top requested products this week?' },
      ]}
    />,
  )
}

describe('OzAssistantPanel chrome', () => {
  it('renders the header clock, a single chat tab with a New chat plus, and the composer mode pill', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: 'Chat history' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^History/ })).not.toBeInTheDocument()

    const tablist = screen.getByRole('tablist', { name: 'Chat tabs' })
    expect(within(tablist).getAllByTestId('chat-tab')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Mode: Ask' })).toBeInTheDocument()

    // Try chip is above the @ Add context strip.
    const tryChip = screen.getByRole('button', { name: 'What is the next sales action?' })
    const addContext = screen.getByRole('button', { name: /^Add context$/ })
    expect(tryChip.compareDocumentPosition(addContext) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('opens the mode pill menu and lets the user pick Agent', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Mode: Ask' }))
    const menu = screen.getByRole('menu', { name: 'Chat mode' })
    expect(within(menu).getByRole('menuitem', { name: /Ask/ })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /Agent/ })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /Edit/ })).toBeInTheDocument()

    await user.click(within(menu).getByRole('menuitem', { name: /Agent/ }))
    expect(screen.getByRole('button', { name: 'Mode: Agent' })).toBeInTheDocument()
  })

  it('opens the clock-icon history dropdown and lists sessions', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Chat history' }))
    expect(screen.getByRole('menu', { name: 'Chat history' })).toBeInTheDocument()
  })
})

describe('OzAssistantPanel tabs', () => {
  it('opens a new tab from the strip and switches to it', async () => {
    const user = userEvent.setup()
    renderPanel()

    // Send something on the first tab so it has a real title.
    await user.type(screen.getByPlaceholderText('Ask Oz…'), 'First chat question')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByLabelText('Conversation title')

    await user.click(screen.getByRole('button', { name: 'New chat' }))

    const tablist = screen.getByRole('tablist', { name: 'Chat tabs' })
    const tabs = within(tablist).getAllByTestId('chat-tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].dataset.active).toBeUndefined()
    expect(tabs[1].dataset.active).toBe('true')
    expect(screen.queryByLabelText('Conversation title')).not.toBeInTheDocument()
  })

  it('shows a running spinner on the originating tab while a reply is pending', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByPlaceholderText('Ask Oz…'), 'Top requested products')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    // Spinner appears immediately while the scripted reply is in flight.
    const tablist = screen.getByRole('tablist', { name: 'Chat tabs' })
    const tabs = within(tablist).getAllByTestId('chat-tab')
    expect(tabs[0].dataset.running).toBe('true')
    expect(within(tabs[0]).getByLabelText('Reply in progress')).toBeInTheDocument()

    // After the reply resolves, the spinner clears.
    await screen.findByText(/Composite decking, hidden fasteners, and exterior trim/i)
    expect(tabs[0].dataset.running).toBeUndefined()
  })

  it('closes a non-active tab via the per-tab close button', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByPlaceholderText('Ask Oz…'), 'First chat question')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByLabelText('Conversation title')

    await user.click(screen.getByRole('button', { name: 'New chat' }))

    const tablist = screen.getByRole('tablist', { name: 'Chat tabs' })
    expect(within(tablist).getAllByTestId('chat-tab')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /Close chat: First chat question/ }))
    expect(within(tablist).getAllByTestId('chat-tab')).toHaveLength(1)
  })
})

describe('OzAssistantPanel send + sticky title', () => {
  it('pins the first prompt as the sticky title and shows the scripted reply', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByPlaceholderText('Ask Oz…'), 'What is the next sales action?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(screen.getByLabelText('Conversation title')).toHaveTextContent(
      'What is the next sales action?',
    )

    expect(
      await screen.findByText(/The next sales action depends on the page in focus/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Oz · Thinking/i)).not.toBeInTheDocument()

    // First prompt is shown only as the sticky title, not duplicated in the conversation flow.
    const conversation = screen.getByLabelText('Oz conversation')
    expect(
      within(conversation).queryByText('What is the next sales action?'),
    ).not.toBeInTheDocument()
  })
})
