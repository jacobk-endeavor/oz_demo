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
        { label: 'page: oz' },
        { label: 'Russin Lumber' },
      ].map((entry) => ({ label: entry.label, value: entry.label }))}
      suggestedPrompts={[
        { id: 'next', label: 'What is the next sales action?' },
        { id: 'top', label: 'Top requested products this week?' },
      ]}
    />,
  )
}

describe('OzAssistantPanel', () => {
  it('renders the Cursor-style header, mode tabs, context strip, and composer', () => {
    renderPanel()

    const header = screen.getByRole('complementary', { name: 'Oz chat' })
    expect(within(header).getByRole('button', { name: /^Oz$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Ask$/, pressed: true })).toBeInTheDocument()
    expect(screen.getByText('Add context')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ask Oz…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('sends a typed message, shows a thinking state, and resolves to a scripted reply', async () => {
    const user = userEvent.setup()
    renderPanel()

    const input = screen.getByPlaceholderText('Ask Oz…')
    await user.type(input, 'What is the next sales action?')

    const sendButton = screen.getByRole('button', { name: 'Send message' })
    expect(sendButton).toBeEnabled()
    await user.click(sendButton)

    const conversation = screen.getByLabelText('Oz conversation')
    expect(within(conversation).getByText('What is the next sales action?')).toBeInTheDocument()
    expect(screen.getByText(/Oz · Thinking/i)).toBeInTheDocument()

    expect(
      await screen.findByText(/The next sales action depends on the page in focus/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Oz · Thinking/i)).not.toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('lets the user send a suggested prompt and clears the conversation on New chat', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Top requested products this week?' }))
    expect(
      await screen.findByText(/Composite decking, hidden fasteners, and exterior trim/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New chat' }))

    const conversation = screen.getByLabelText('Oz conversation')
    expect(within(conversation).getByText(seedMessages[0].content as string)).toBeInTheDocument()
    expect(
      within(conversation).queryByText('Top requested products this week?'),
    ).not.toBeInTheDocument()
  })
})
