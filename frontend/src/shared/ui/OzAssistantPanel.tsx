import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  ArrowUpIcon,
  AtSignIcon,
  ChevronDownIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from './icons'
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
  /** Visible product label inside the model pill. Defaults to "Oz". */
  title?: string
  /** Replaces the default eyebrow over the title. Now unused; kept for API compat. */
  eyebrow?: string
  /** One-line page context Oz uses to seed scripted replies. */
  contextSummary: string
  /** Currently in-scope context badges, rendered as @-pills above the composer. */
  contextItems?: OzContextItem[]
  /** Initial transcript. The panel manages its own state from there. */
  messages: OzAssistantMessage[]
  /** Quick-fire prompts shown beneath the composer. */
  suggestedPrompts?: OzSuggestedPrompt[]
  /** Optional action buttons. Now rendered inside the chat overflow menu;
      kept in the API for callers that still pass them. */
  actions?: OzAssistantAction[]
  onPromptSelect?: (prompt: OzSuggestedPrompt) => void
  className?: string
}

type ChatMode = 'ask' | 'agent' | 'edit'

const modeOptions: Array<{ id: ChatMode; label: string; tooltip: string }> = [
  { id: 'ask', label: 'Ask', tooltip: 'Talk to Oz about the current page' },
  { id: 'agent', label: 'Agent', tooltip: 'Demo only — agent runs are scripted' },
  { id: 'edit', label: 'Edit', tooltip: 'Demo only — Oz cannot edit the page yet' },
]

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function buildScriptedReply(input: string, contextSummary: string): string {
  const trimmed = input.trim().toLowerCase()
  if (trimmed.includes('next')) {
    return 'The next sales action depends on the page in focus. From here, I would either draft a quote, build a route, or schedule a follow-up call.'
  }
  if (trimmed.includes('product') || trimmed.includes('demand')) {
    return 'Composite decking, hidden fasteners, and exterior trim are the strongest product signals across int_001-int_003 in the demo data.'
  }
  if (trimmed.includes('competitor') || trimmed.includes('lost')) {
    return 'TimberTech and Boral show up as the active competitors. Russin Lumber and Hudson Valley Supply are the at-risk accounts to call first.'
  }
  if (trimmed.startsWith('hi') || trimmed.startsWith('hey') || trimmed.startsWith('hello')) {
    return 'Hey. What do you want to do next?'
  }
  if (contextSummary) {
    return `Got it. In this view, ${contextSummary.toLowerCase()} I can pull more detail or push the action into Nebula whenever you’re ready.`
  }
  return 'Got it. I will pull the relevant evidence and suggest the concrete next sales action.'
}

export function OzAssistantPanel({
  title = 'Oz',
  contextSummary,
  contextItems = [],
  messages,
  suggestedPrompts = [],
  onPromptSelect,
  className,
}: OzAssistantPanelProps) {
  const [transcript, setTranscript] = useState<OzAssistantMessage[]>(messages)
  const [draft, setDraft] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [mode, setMode] = useState<ChatMode>('ask')
  const [historyCursor, setHistoryCursor] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Reset transcript when the seed messages change (e.g., page navigation).
  useEffect(() => {
    setTranscript(messages)
    setPendingId(null)
    setHistoryCursor(null)
  }, [messages])

  // Auto-scroll to the latest message.
  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [transcript])

  // Auto-resize the textarea up to 6 lines.
  const resizeTextarea = useCallback(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    const max = 6 * 22
    node.style.height = `${Math.min(node.scrollHeight, max)}px`
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [draft, resizeTextarea])

  const userHistory = useMemo(
    () =>
      transcript
        .filter((message) => message.role === 'user')
        .map((message) => (typeof message.content === 'string' ? message.content : '')),
    [transcript],
  )

  const send = useCallback(
    (rawInput: string) => {
      const value = rawInput.trim()
      if (!value || pendingId !== null) return

      const userMessage: OzAssistantMessage = {
        id: makeId(),
        role: 'user',
        content: value,
      }
      const placeholderId = makeId()
      setTranscript((current) => [
        ...current,
        userMessage,
        {
          id: placeholderId,
          role: 'oz',
          content: '__thinking__',
        },
      ])
      setPendingId(placeholderId)
      setDraft('')
      setHistoryCursor(null)

      const replyText = buildScriptedReply(value, contextSummary)
      const replyDelay = 700

      window.setTimeout(() => {
        setTranscript((current) =>
          current.map((entry) =>
            entry.id === placeholderId ? { ...entry, content: replyText } : entry,
          ),
        )
        setPendingId(null)
      }, replyDelay)
    },
    [contextSummary, pendingId],
  )

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault()
    send(draft)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
      return
    }
    if (event.key === 'ArrowUp' && (draft.trim() === '' || historyCursor !== null)) {
      if (userHistory.length === 0) return
      event.preventDefault()
      const next =
        historyCursor === null
          ? userHistory.length - 1
          : Math.max(0, historyCursor - 1)
      setHistoryCursor(next)
      setDraft(userHistory[next] ?? '')
    } else if (event.key === 'ArrowDown' && historyCursor !== null) {
      event.preventDefault()
      const next = historyCursor + 1
      if (next >= userHistory.length) {
        setHistoryCursor(null)
        setDraft('')
      } else {
        setHistoryCursor(next)
        setDraft(userHistory[next] ?? '')
      }
    }
  }

  function handlePromptClick(prompt: OzSuggestedPrompt) {
    onPromptSelect?.(prompt)
    send(prompt.label)
  }

  function handleNewChat() {
    setTranscript(messages)
    setDraft('')
    setHistoryCursor(null)
    setPendingId(null)
    textareaRef.current?.focus()
  }

  const canSend = draft.trim().length > 0 && pendingId === null

  return (
    <aside
      className={joinClasses(
        'flex h-full w-full flex-col bg-white text-zinc-900',
        className,
      )}
      aria-label="Oz chat"
    >
      <Header title={title} onNewChat={handleNewChat} />
      <ModeTabs mode={mode} onChange={setMode} />

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-4"
        aria-label="Oz conversation"
      >
        <div className="flex flex-col gap-4">
          {transcript.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
        </div>
      </div>

      <ContextStrip contextItems={contextItems} />

      <Composer
        textareaRef={textareaRef}
        draft={draft}
        onDraftChange={(value) => {
          setDraft(value)
          if (historyCursor !== null) setHistoryCursor(null)
        }}
        onKeyDown={handleKeyDown}
        onSubmit={handleSubmit}
        canSend={canSend}
        mode={mode}
      />

      {suggestedPrompts.length > 0 && (
        <SuggestedPrompts prompts={suggestedPrompts} onClick={handlePromptClick} />
      )}
    </aside>
  )
}

function Header({ title, onNewChat }: { title: string; onNewChat: () => void }) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-3">
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
        title="Model selector (demo only)"
      >
        <span>{title}</span>
        <ChevronDownIcon className="h-3 w-3 text-zinc-500" />
      </button>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onNewChat}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          title="Start a new chat"
          aria-label="New chat"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          <span>New chat</span>
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          aria-label="More chat actions"
          title="More"
        >
          <MoreHorizontalIcon className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}

function ModeTabs({ mode, onChange }: { mode: ChatMode; onChange: (mode: ChatMode) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-3 py-2">
      {modeOptions.map((option) => {
        const active = option.id === mode
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            title={option.tooltip}
            aria-pressed={active}
            className={joinClasses(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function ChatMessage({ message }: { message: OzAssistantMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isThinking = message.role === 'oz' && message.content === '__thinking__'

  const roleLabel = isUser ? 'You' : isSystem ? 'System' : 'Oz'

  return (
    <article
      className={joinClasses(
        'cursor-chat-message flex flex-col gap-1',
        isUser && 'items-end',
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {roleLabel}
        {isThinking && ' · Thinking'}
      </span>
      {isThinking ? (
        <div className="flex h-5 items-center px-1">
          <span className="cursor-chat-dot" />
          <span className="cursor-chat-dot" />
          <span className="cursor-chat-dot" />
        </div>
      ) : (
        <div
          className={joinClasses(
            'max-w-[88%] text-sm leading-relaxed',
            isUser
              ? 'rounded-lg bg-zinc-100 px-3 py-2 text-zinc-900'
              : isSystem
                ? 'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900'
                : 'text-zinc-900',
          )}
        >
          {message.content}
        </div>
      )}
      {!isThinking && message.sources !== undefined && message.sources.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {message.sources.map((source) => (
            <span
              key={source}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600"
            >
              {source}
            </span>
          ))}
        </div>
      )}
    </article>
  )
}

function ContextStrip({ contextItems }: { contextItems: OzContextItem[] }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-zinc-200 bg-white px-3 py-2">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900"
        title="Add context (demo only)"
      >
        <PlusIcon className="h-3 w-3" />
        <span>Add context</span>
      </button>
      {contextItems.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600"
          title={typeof item.value === 'string' ? item.value : undefined}
        >
          <AtSignIcon className="h-3 w-3 text-zinc-400" />
          <span className="truncate">{item.label}</span>
        </span>
      ))}
    </div>
  )
}

function Composer({
  textareaRef,
  draft,
  onDraftChange,
  onKeyDown,
  onSubmit,
  canSend,
  mode,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  draft: string
  onDraftChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onSubmit: (event?: FormEvent) => void
  canSend: boolean
  mode: ChatMode
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="shrink-0 border-t border-zinc-200 bg-white px-3 py-3"
    >
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm focus-within:border-zinc-300">
        <label htmlFor="oz-chat-input" className="sr-only">
          Ask Oz
        </label>
        <textarea
          id="oz-chat-input"
          ref={textareaRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask Oz…"
          className="block w-full resize-none rounded-t-xl border-0 bg-transparent px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1 text-xs">
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            title="Model selector (demo only)"
          >
            <span>oz-prompt</span>
            <ChevronDownIcon className="h-3 w-3" />
          </button>
          <span className="hidden text-[11px] text-zinc-400 sm:block">
            ↵ to send · ⇧↵ for newline
          </span>
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            title={`Send (${mode})`}
            className={joinClasses(
              'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              canSend
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-zinc-100 text-zinc-400',
            )}
          >
            <ArrowUpIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </form>
  )
}

function SuggestedPrompts({
  prompts,
  onClick,
}: {
  prompts: OzSuggestedPrompt[]
  onClick: (prompt: OzSuggestedPrompt) => void
}) {
  return (
    <div className="shrink-0 border-t border-zinc-200 bg-zinc-50 px-3 py-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        Try
      </p>
      <div className="flex flex-wrap gap-1.5">
        {prompts.slice(0, 3).map((prompt) => (
          <button
            key={prompt.id}
            type="button"
            onClick={() => onClick(prompt)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            {prompt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
