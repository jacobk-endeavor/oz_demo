import type { ReactNode } from 'react'
import { Button } from './Button'
import { PulseOrb } from './PulseOrb'
import { Tag } from './Tag'
import { joinClasses, type Tone } from './visualSystem'

export type OzMessageRole = 'user' | 'oz' | 'system'
export type OzActionVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface OzContextItem {
  label: string
  value: ReactNode
  tone?: Tone
}

export interface OzAssistantMessage {
  id: string
  role: OzMessageRole
  content: ReactNode
  timestamp?: string
  sources?: string[]
}

export interface OzSuggestedPrompt {
  id: string
  label: string
}

export interface OzAssistantAction {
  id: string
  label: string
  variant?: OzActionVariant
  disabled?: boolean
  onClick?: () => void
}

export interface OzAssistantPanelProps {
  title?: string
  eyebrow?: string
  contextSummary: string
  contextItems?: OzContextItem[]
  messages: OzAssistantMessage[]
  suggestedPrompts?: OzSuggestedPrompt[]
  actions?: OzAssistantAction[]
  onPromptSelect?: (prompt: OzSuggestedPrompt) => void
  className?: string
  active?: boolean
}

const roleLabels: Record<OzMessageRole, string> = {
  user: 'You',
  oz: 'Oz',
  system: 'System',
}

const roleClasses: Record<OzMessageRole, string> = {
  user: 'border-blue-200 bg-blue-50/60 ml-6',
  oz: 'border-zinc-200 bg-white mr-6',
  system: 'border-amber-200 bg-amber-50/60',
}

export function OzAssistantPanel({
  title = 'Oz Assistant',
  eyebrow = 'Persistent copilot',
  contextSummary,
  contextItems = [],
  messages,
  suggestedPrompts = [],
  actions = [],
  onPromptSelect,
  className,
  active = false,
}: OzAssistantPanelProps) {
  return (
    <aside
      className={joinClasses(
        'flex h-full w-full flex-col border-l border-zinc-200 bg-white',
        className,
      )}
      aria-label={title}
    >
      <div className="border-b border-zinc-200 p-5">
        <div className="flex items-start gap-3">
          <PulseOrb size="sm" paused={!active} />
          <div className="min-w-0 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-base font-semibold text-zinc-900">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-zinc-600">{contextSummary}</p>
          </div>
        </div>
        {contextItems.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-2">
            {contextItems.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2"
              >
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  {item.label}
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-zinc-900">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-zinc-50/50 p-4"
        aria-label="Oz chat messages"
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={joinClasses('rounded-2xl border p-3', roleClasses[message.role])}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                {roleLabels[message.role]}
              </p>
              {message.timestamp !== undefined && (
                <time className="text-[11px] text-zinc-400">{message.timestamp}</time>
              )}
            </div>
            <div className="mt-1.5 text-sm leading-5 text-zinc-800">{message.content}</div>
            {message.sources !== undefined && message.sources.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Sources">
                {message.sources.map((source) => (
                  <Tag key={source} tone="blue">
                    {source}
                  </Tag>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {(suggestedPrompts.length > 0 || actions.length > 0) && (
        <div className="space-y-3 border-t border-zinc-200 p-4">
          {suggestedPrompts.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Suggested prompts
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => onPromptSelect?.(prompt)}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {actions.length > 0 && (
            <div className="grid gap-2">
              {actions.map((action) => (
                <Button
                  key={action.id}
                  variant={action.variant ?? 'secondary'}
                  disabled={action.disabled}
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
