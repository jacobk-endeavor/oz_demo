import type { ReactNode } from 'react'
import { OzOrb, type OzOrbState } from './OzOrb'
import { joinClasses, ozButtonClasses, ozSurfaceClasses, ozToneClasses } from './visualSystem'

export type OzMessageRole = 'user' | 'oz' | 'system'
export type OzActionVariant = 'primary' | 'secondary' | 'ghost'

export interface OzContextItem {
  label: string
  value: ReactNode
  tone?: 'blue' | 'red' | 'white' | 'muted'
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

interface OzAssistantPanelProps {
  title?: string
  eyebrow?: string
  contextSummary: string
  contextItems?: OzContextItem[]
  messages: OzAssistantMessage[]
  suggestedPrompts?: OzSuggestedPrompt[]
  actions?: OzAssistantAction[]
  orbState?: OzOrbState
  orbSrc?: string
  onPromptSelect?: (prompt: OzSuggestedPrompt) => void
  className?: string
}

const roleLabels: Record<OzMessageRole, string> = {
  user: 'Rep',
  oz: 'Oz',
  system: 'System',
}

const roleClasses: Record<OzMessageRole, string> = {
  user: 'ml-8 border-[#23B8FF]/28 bg-[#0674FF]/14',
  oz: 'mr-8 border-white/12 bg-white/[0.055]',
  system: 'border-[#FF3B00]/24 bg-[#E10600]/12',
}

export function OzAssistantPanel({
  title = 'Oz Assistant',
  eyebrow = 'Persistent copilot',
  contextSummary,
  contextItems = [],
  messages,
  suggestedPrompts = [],
  actions = [],
  orbState = 'idle',
  orbSrc,
  onPromptSelect,
  className,
}: OzAssistantPanelProps) {
  return (
    <aside
      className={joinClasses(
        ozSurfaceClasses.panel,
        'flex h-full w-full max-w-[420px] flex-col overflow-hidden',
        className,
      )}
      aria-label={title}
    >
      <div className="border-b border-white/10 p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            <OzOrb state={orbState} orbSrc={orbSrc} size="sm" className="border-0 bg-transparent p-0 shadow-none" />
          </div>
          <div className="min-w-0 pt-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#23B8FF]">
              {eyebrow}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[#F5F7FF]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#8B93A7]">{contextSummary}</p>
          </div>
        </div>

        {contextItems.length > 0 && (
          <dl className="mt-5 grid grid-cols-2 gap-2">
            {contextItems.map((item) => (
              <div
                key={item.label}
                className={joinClasses(
                  'rounded-2xl border px-3 py-2',
                  ozToneClasses[item.tone ?? 'muted'],
                )}
              >
                <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-70">
                  {item.label}
                </dt>
                <dd className="mt-1 text-sm font-semibold">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5" aria-label="Oz chat messages">
        {messages.map((message) => (
          <article
            key={message.id}
            className={joinClasses('rounded-2xl border p-4', roleClasses[message.role])}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F5F7FF]/75">
                {roleLabels[message.role]}
              </p>
              {message.timestamp !== undefined && (
                <time className="text-xs text-[#8B93A7]">{message.timestamp}</time>
              )}
            </div>
            <div className="mt-2 text-sm leading-6 text-[#F5F7FF]">{message.content}</div>
            {message.sources !== undefined && message.sources.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Sources">
                {message.sources.map((source) => (
                  <span
                    key={source}
                    className="rounded-full border border-white/12 bg-[#030407]/70 px-2.5 py-1 text-xs text-[#BDEBFF]"
                  >
                    {source}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {(suggestedPrompts.length > 0 || actions.length > 0) && (
        <div className="space-y-4 border-t border-white/10 p-5">
          {suggestedPrompts.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#8B93A7]">
                Suggested prompts
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => onPromptSelect?.(prompt)}
                    className="rounded-full border border-[#23B8FF]/28 bg-[#0674FF]/12 px-3 py-1.5 text-left text-xs font-medium text-[#BDEBFF] transition hover:bg-[#0674FF]/24 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23B8FF]"
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
                <button
                  key={action.id}
                  type="button"
                  disabled={action.disabled}
                  onClick={action.onClick}
                  className={ozButtonClasses[action.variant ?? 'secondary']}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
