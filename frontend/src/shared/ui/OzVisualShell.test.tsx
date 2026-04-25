import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackgroundTaskRail } from './BackgroundTaskRail'
import { OzAssistantPanel } from './OzAssistantPanel'
import { OzOrb, type OzOrbState } from './OzOrb'

afterEach(() => {
  cleanup()
})

describe('OzOrb', () => {
  it('supports every documented state', () => {
    const states: OzOrbState[] = ['idle', 'listening', 'thinking', 'speaking', 'running_action']

    states.forEach((state) => {
      const { container, unmount } = render(<OzOrb state={state} />)

      expect(container.querySelector(`[data-state="${state}"]`)).toBeInTheDocument()
      unmount()
    })
  })

  it('renders suggested prompts and calls the prompt handler', () => {
    const onPromptSelect = vi.fn()

    render(
      <OzOrb
        prompts={[{ id: 'next-action', label: 'What should I do next?' }]}
        onPromptSelect={onPromptSelect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'What should I do next?' }))

    expect(onPromptSelect).toHaveBeenCalledWith({
      id: 'next-action',
      label: 'What should I do next?',
    })
  })
})

describe('OzAssistantPanel', () => {
  it('displays context, chat messages, prompts, sources, and actions', () => {
    const onPromptSelect = vi.fn()
    const onAction = vi.fn()

    render(
      <OzAssistantPanel
        contextSummary="Mining call notes for regional demand."
        contextItems={[
          { label: 'Workflow', value: 'Call Mining', tone: 'blue' },
          { label: 'Confidence', value: '94%', tone: 'white' },
        ]}
        messages={[
          {
            id: 'm1',
            role: 'user',
            content: 'Find upsell demand.',
            timestamp: '9:12',
          },
          {
            id: 'm2',
            role: 'oz',
            content: 'Demand is strongest around replacement filters.',
            sources: ['call-018', 'note-044'],
          },
        ]}
        suggestedPrompts={[{ id: 'dashboard', label: 'Generate a dashboard' }]}
        actions={[{ id: 'run-script', label: 'Run script', variant: 'primary', onClick: onAction }]}
        onPromptSelect={onPromptSelect}
      />,
    )

    expect(screen.getByText('Mining call notes for regional demand.')).toBeInTheDocument()
    expect(screen.getByText('Call Mining')).toBeInTheDocument()
    expect(screen.getByText('Find upsell demand.')).toBeInTheDocument()
    expect(screen.getByText('Demand is strongest around replacement filters.')).toBeInTheDocument()
    expect(screen.getByText('call-018')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Generate a dashboard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run script' }))

    expect(onPromptSelect).toHaveBeenCalledWith({
      id: 'dashboard',
      label: 'Generate a dashboard',
    })
    expect(onAction).toHaveBeenCalled()
  })
})

describe('BackgroundTaskRail', () => {
  it('renders queued, running, and complete tasks', () => {
    render(
      <BackgroundTaskRail
        tasks={[
          { id: 'queued', label: 'Review specs', status: 'queued', eta: 'Next' },
          { id: 'running', label: 'Mining calls', status: 'running', sourceCount: 18 },
          { id: 'complete', label: 'Prepare report', status: 'complete' },
        ]}
      />,
    )

    const rail = screen.getByRole('region', { name: 'Background agents' })

    expect(within(rail).getByText('Review specs')).toBeInTheDocument()
    expect(within(rail).getByText('Mining calls')).toBeInTheDocument()
    expect(within(rail).getByText('Prepare report')).toBeInTheDocument()
    expect(within(rail).getByText('Queued')).toBeInTheDocument()
    expect(within(rail).getByText('Running')).toBeInTheDocument()
    expect(within(rail).getByText('Complete')).toBeInTheDocument()
  })
})
