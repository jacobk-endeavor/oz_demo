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
  it('renders the Cursor-style header, mode tabs, floating Try chips, context strip, and composer', () => {
    renderPanel()

    const panel = screen.getByRole('complementary', { name: 'Oz chat' })
    expect(within(panel).getByRole('button', { name: /^Oz$/ })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /^History/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Ask$/, pressed: true })).toBeInTheDocument()

    // Try chip is rendered above the @ Add context strip.
    const tryChip = screen.getByRole('button', { name: 'What is the next sales action?' })
    const addContext = screen.getByRole('button', { name: /^Add context$/ })
    expect(tryChip.compareDocumentPosition(addContext) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(screen.getByPlaceholderText('Ask Oz…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('shows the seeded greeting as ambient empty-state copy before any message is sent', () => {
    renderPanel()

    const conversation = screen.getByLabelText('Oz conversation')
    expect(within(conversation).getByText(seedMessages[0].content as string)).toBeInTheDocument()
    expect(screen.queryByLabelText('Conversation title')).not.toBeInTheDocument()
  })
})

describe('OzAssistantPanel send + sticky title', () => {
  it('sends a typed message, shows thinking, resolves the reply, and pins the first prompt as the title', async () => {
    const user = userEvent.setup()
    renderPanel()

    const input = screen.getByPlaceholderText('Ask Oz…')
    await user.type(input, 'What is the next sales action?')

    const sendButton = screen.getByRole('button', { name: 'Send message' })
    expect(sendButton).toBeEnabled()
    await user.click(sendButton)

    expect(screen.getByLabelText('Conversation title')).toHaveTextContent(
      'What is the next sales action?',
    )

    expect(screen.getByText(/Oz · Thinking/i)).toBeInTheDocument()
    expect(
      await screen.findByText(/The next sales action depends on the page in focus/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Oz · Thinking/i)).not.toBeInTheDocument()
    expect(input).toHaveValue('')

    // Seeded greeting is replaced once the chat has started.
    expect(
      screen.queryByText('Pick a workflow on the left, or ask me what to do next.'),
    ).not.toBeInTheDocument()

    // First prompt is shown only as the sticky title, not duplicated in the conversation flow.
    const conversation = screen.getByLabelText('Oz conversation')
    expect(
      within(conversation).queryByText('What is the next sales action?'),
    ).not.toBeInTheDocument()
  })

  it('sends a Try chip as a message and uses it for the sticky title', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Top requested products this week?' }))

    expect(screen.getByLabelText('Conversation title')).toHaveTextContent(
      'Top requested products this week?',
    )
    expect(
      await screen.findByText(/Composite decking, hidden fasteners, and exterior trim/i),
    ).toBeInTheDocument()
  })
})

describe('OzAssistantPanel sessions', () => {
  it('lists sessions in the History dropdown and switches between them', async () => {
    const user = userEvent.setup()
    renderPanel()

    // Send something in the first session so it has a title.
    const input = screen.getByPlaceholderText('Ask Oz…')
    await user.type(input, 'Top product requests')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText(/Composite decking, hidden fasteners, and exterior trim/i)

    // Start a fresh chat.
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    expect(screen.queryByLabelText('Conversation title')).not.toBeInTheDocument()

    // Open history. Both sessions should appear.
    await user.click(screen.getByRole('button', { name: /^History/ }))
    const menu = screen.getByRole('menu', { name: 'Chat history' })
    expect(within(menu).getByRole('menuitem', { name: /Top product requests/ })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /New chat/ })).toBeInTheDocument()

    // Switch to the older session and confirm it restores the sticky title and reply.
    await user.click(within(menu).getByRole('menuitem', { name: /Top product requests/ }))
    expect(screen.getByLabelText('Conversation title')).toHaveTextContent('Top product requests')
    expect(
      screen.getByText(/Composite decking, hidden fasteners, and exterior trim/i),
    ).toBeInTheDocument()
  })

  it('keeps "New chat" idempotent when the active session is already empty', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'New chat' }))
    await user.click(screen.getByRole('button', { name: 'New chat' }))

    await user.click(screen.getByRole('button', { name: /^History/ }))
    const menu = screen.getByRole('menu', { name: 'Chat history' })
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1)
  })
})
