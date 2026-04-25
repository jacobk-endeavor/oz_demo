import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from 'react'
import {
  ArrowUpIcon,
  AtSignIcon,
  ChatBubbleIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  InfinityIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SpinnerIcon,
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
  title?: string
  /** Replaces the default eyebrow over the title. Now unused; kept for API compat. */
  eyebrow?: string
  contextSummary: string
  contextItems?: OzContextItem[]
  /**
   * Initial assistant greeting for empty sessions on this page. Rendered as
   * the empty-state intro until the user sends the first message.
   */
  messages: OzAssistantMessage[]
  suggestedPrompts?: OzSuggestedPrompt[]
  /** Optional action buttons. Kept in the API for callers; not rendered. */
  actions?: OzAssistantAction[]
  onPromptSelect?: (prompt: OzSuggestedPrompt) => void
  className?: string
}

type ChatMode = 'ask' | 'agent' | 'edit'

type IconCmp = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

interface ModeOption {
  id: ChatMode
  label: string
  icon: IconCmp
  tooltip: string
}

const modeOptions: ModeOption[] = [
  { id: 'ask', label: 'Ask', icon: ChatBubbleIcon, tooltip: 'Talk to Oz about the current page' },
  { id: 'agent', label: 'Agent', icon: InfinityIcon, tooltip: 'Demo only — agent runs are scripted' },
  { id: 'edit', label: 'Edit', icon: PencilIcon, tooltip: 'Demo only — Oz cannot edit the page yet' },
]

interface ChatSession {
  id: string
  title: string
  messages: OzAssistantMessage[]
  createdAt: number
  pendingMessageId: string | null
}

const NEW_CHAT_TITLE = 'New chat'

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function makeSession(): ChatSession {
  return {
    id: makeId(),
    title: NEW_CHAT_TITLE,
    messages: [],
    createdAt: Date.now(),
    pendingMessageId: null,
  }
}

function asString(content: ReactNode): string {
  if (typeof content === 'string') return content
  if (typeof content === 'number') return String(content)
  return ''
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

function formatRelativeTime(timestamp: number, now: number): string {
  const delta = Math.max(0, now - timestamp)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 30) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
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
  const [sessions, setSessions] = useState<ChatSession[]>(() => [makeSession()])
  const [activeSessionId, setActiveSessionId] = useState<string>(() => sessions[0].id)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<ChatMode>('ask')
  const [historyCursor, setHistoryCursor] = useState<number | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const historyMenuRef = useRef<HTMLDivElement>(null)
  const modeMenuRef = useRef<HTMLDivElement>(null)

  // Reset sessions when the seed messages change (e.g., page navigation).
  useEffect(() => {
    const fresh = makeSession()
    setSessions([fresh])
    setActiveSessionId(fresh.id)
    setDraft('')
    setHistoryCursor(null)
    setHistoryOpen(false)
    setModeOpen(false)
  }, [messages])

  // Keep relative timestamps fresh while the history dropdown is open.
  useEffect(() => {
    if (!historyOpen) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(interval)
  }, [historyOpen])

  // Close popovers on outside click.
  useEffect(() => {
    if (!historyOpen && !modeOpen) return
    function handleClick(event: MouseEvent) {
      const target = event.target as Node
      if (historyOpen && historyMenuRef.current?.contains(target)) return
      if (modeOpen && modeMenuRef.current?.contains(target)) return
      setHistoryOpen(false)
      setModeOpen(false)
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [historyOpen, modeOpen])

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [sessions, activeSessionId],
  )

  const transcript = activeSession.messages
  const firstUserMessage = useMemo(
    () => transcript.find((message) => message.role === 'user'),
    [transcript],
  )
  const conversationMessages = useMemo(
    () =>
      firstUserMessage
        ? transcript.filter((message) => message.id !== firstUserMessage.id)
        : transcript,
    [transcript, firstUserMessage],
  )
  const isPending = activeSession.pendingMessageId !== null

  // Auto-scroll to the latest message when the active transcript changes.
  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [transcript, activeSessionId])

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
      transcript.filter((message) => message.role === 'user').map((message) => asString(message.content)),
    [transcript],
  )

  const send = useCallback(
    (rawInput: string) => {
      const value = rawInput.trim()
      if (!value || isPending) return

      const userMessage: OzAssistantMessage = { id: makeId(), role: 'user', content: value }
      const placeholder: OzAssistantMessage = { id: makeId(), role: 'oz', content: '__thinking__' }
      const targetSessionId = activeSessionId

      setSessions((current) =>
        current.map((session) => {
          if (session.id !== targetSessionId) return session
          const isFirst = session.messages.length === 0
          return {
            ...session,
            title: isFirst ? value : session.title,
            messages: [...session.messages, userMessage, placeholder],
            pendingMessageId: placeholder.id,
          }
        }),
      )
      setDraft('')
      setHistoryCursor(null)

      const replyText = buildScriptedReply(value, contextSummary)
      window.setTimeout(() => {
        setSessions((current) =>
          current.map((session) => {
            if (session.id !== targetSessionId) return session
            return {
              ...session,
              messages: session.messages.map((entry) =>
                entry.id === placeholder.id ? { ...entry, content: replyText } : entry,
              ),
              pendingMessageId: null,
            }
          }),
        )
      }, 700)
    },
    [activeSessionId, contextSummary, isPending],
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
      const next = historyCursor === null ? userHistory.length - 1 : Math.max(0, historyCursor - 1)
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
    setSessions((current) => {
      const active = current.find((session) => session.id === activeSessionId)
      if (active && active.messages.length === 0) return current
      const fresh = makeSession()
      setActiveSessionId(fresh.id)
      return [...current, fresh]
    })
    setDraft('')
    setHistoryCursor(null)
    setHistoryOpen(false)
    textareaRef.current?.focus()
  }

  function handleSelectSession(sessionId: string) {
    setActiveSessionId(sessionId)
    setDraft('')
    setHistoryCursor(null)
    setHistoryOpen(false)
  }

  function handleCloseTab(sessionId: string) {
    setSessions((current) => {
      if (current.length <= 1) return current
      const remaining = current.filter((session) => session.id !== sessionId)
      if (sessionId === activeSessionId) {
        const fallback = remaining[remaining.length - 1]
        setActiveSessionId(fallback.id)
      }
      return remaining
    })
  }

  const canSend = draft.trim().length > 0 && !isPending

  // Sessions render in creation order so tabs feel stable as the user opens new
  // chats. The history dropdown sorts by most-recent for "back to last chat".
  const orderedSessions = sessions
  const historySessions = useMemo(
    () => [...sessions].sort((a, b) => b.createdAt - a.createdAt),
    [sessions],
  )

  return (
    <aside
      className={joinClasses(
        'flex h-full w-full flex-col bg-white text-zinc-900',
        className,
      )}
      aria-label="Oz chat"
    >
      <Header
        title={title}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen((open) => !open)}
        sessions={historySessions}
        activeSessionId={activeSession.id}
        onSelectSession={handleSelectSession}
        historyMenuRef={historyMenuRef}
        now={now}
      />

      <ChatTabBar
        sessions={orderedSessions}
        activeSessionId={activeSession.id}
        onSelect={handleSelectSession}
        onClose={handleCloseTab}
        onNewChat={handleNewChat}
      />

      {firstUserMessage && (
        <StickyTitle text={asString(firstUserMessage.content)} pending={isPending} />
      )}

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-4"
        aria-label="Oz conversation"
      >
        {transcript.length === 0 ? (
          <EmptyState seedMessages={messages} />
        ) : (
          <div className="flex flex-col gap-4">
            {conversationMessages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
          </div>
        )}
      </div>

      {suggestedPrompts.length > 0 && (
        <SuggestedPrompts prompts={suggestedPrompts} onClick={handlePromptClick} />
      )}

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
        modeOpen={modeOpen}
        onToggleMode={() => setModeOpen((open) => !open)}
        onSelectMode={(next) => {
          setMode(next)
          setModeOpen(false)
        }}
        modeMenuRef={modeMenuRef}
      />
    </aside>
  )
}

function Header({
  title,
  historyOpen,
  onToggleHistory,
  sessions,
  activeSessionId,
  onSelectSession,
  historyMenuRef,
  now,
}: {
  title: string
  historyOpen: boolean
  onToggleHistory: () => void
  sessions: ChatSession[]
  activeSessionId: string
  onSelectSession: (id: string) => void
  historyMenuRef: React.RefObject<HTMLDivElement | null>
  now: number
}) {
  return (
    <header className="relative flex h-11 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-3">
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
        title="Model selector (demo only)"
      >
        <span>{title}</span>
        <ChevronDownIcon className="h-3 w-3 text-zinc-500" />
      </button>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleHistory}
          aria-haspopup="menu"
          aria-expanded={historyOpen}
          aria-label="Chat history"
          title="Chat history"
          className={joinClasses(
            'rounded-md p-1.5 transition-colors',
            historyOpen
              ? 'bg-zinc-100 text-zinc-900'
              : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900',
          )}
        >
          <ClockIcon className="h-4 w-4" />
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

      {historyOpen && (
        <div
          ref={historyMenuRef}
          role="menu"
          aria-label="Chat history"
          className="absolute right-3 top-11 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg"
        >
          <div className="border-b border-zinc-200 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Chat history
            </p>
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId
              const isRunning = session.pendingMessageId !== null
              return (
                <li key={session.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onSelectSession(session.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={joinClasses(
                      'flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm transition-colors',
                      isActive ? 'bg-zinc-50' : 'hover:bg-zinc-50',
                    )}
                  >
                    <span className="min-w-0">
                      <span
                        className={joinClasses(
                          'block truncate text-zinc-900',
                          isActive ? 'font-semibold' : 'font-medium',
                        )}
                      >
                        {session.title}
                      </span>
                      <span className="block text-[11px] text-zinc-500">
                        {session.messages.length === 0
                          ? 'Empty session'
                          : `${session.messages.length} message${
                              session.messages.length === 1 ? '' : 's'
                            }`}
                        {isRunning && ' · running'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-zinc-400">
                      {isRunning && (
                        <SpinnerIcon className="h-3 w-3 animate-spin text-blue-500" />
                      )}
                      {formatRelativeTime(session.createdAt, now)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </header>
  )
}

function ChatTabBar({
  sessions,
  activeSessionId,
  onSelect,
  onClose,
  onNewChat,
}: {
  sessions: ChatSession[]
  activeSessionId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNewChat: () => void
}) {
  return (
    <div
      className="flex shrink-0 items-end gap-1 border-b border-zinc-200 bg-zinc-50 px-2 pt-2"
      role="tablist"
      aria-label="Chat tabs"
    >
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          const isRunning = session.pendingMessageId !== null
          const tabTitle =
            session.messages.length === 0 ? NEW_CHAT_TITLE : session.title
          const canClose = sessions.length > 1
          return (
            <div
              key={session.id}
              role="tab"
              aria-selected={isActive}
              data-testid="chat-tab"
              data-active={isActive ? 'true' : undefined}
              data-running={isRunning ? 'true' : undefined}
              className={joinClasses(
                'group flex max-w-[160px] items-center gap-1 rounded-t-md border border-b-0 px-2 py-1.5 text-xs transition-colors',
                isActive
                  ? 'border-zinc-200 bg-white text-zinc-900'
                  : 'border-transparent bg-zinc-100 text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-800',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(session.id)}
                title={tabTitle}
                aria-label={`Switch to chat: ${tabTitle}`}
                className="flex min-w-0 items-center gap-1.5 text-left"
              >
                {isRunning ? (
                  <SpinnerIcon
                    className="h-3 w-3 shrink-0 animate-spin text-blue-500"
                    aria-label="Reply in progress"
                  />
                ) : (
                  <ChatBubbleIcon
                    className={joinClasses(
                      'h-3 w-3 shrink-0',
                      isActive ? 'text-zinc-700' : 'text-zinc-400 group-hover:text-zinc-600',
                    )}
                    aria-hidden="true"
                  />
                )}
                <span className="truncate font-medium">{tabTitle}</span>
              </button>
              {canClose && (
                <button
                  type="button"
                  onClick={() => onClose(session.id)}
                  aria-label={`Close chat: ${tabTitle}`}
                  title="Close chat"
                  className={joinClasses(
                    'rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700',
                    !isActive && 'opacity-0 group-hover:opacity-100',
                  )}
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <button
        type="button"
        onClick={onNewChat}
        aria-label="New chat"
        title="New chat"
        className="mb-1 ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900"
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function StickyTitle({ text, pending }: { text: string; pending: boolean }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur-sm">
      {pending && (
        <SpinnerIcon
          className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500"
          aria-label="Reply in progress"
        />
      )}
      <p
        title={text}
        aria-label="Conversation title"
        className="line-clamp-2 text-sm font-semibold text-zinc-900"
      >
        {text}
      </p>
    </div>
  )
}

function EmptyState({ seedMessages }: { seedMessages: OzAssistantMessage[] }) {
  return (
    <div className="flex flex-col gap-3 text-sm text-zinc-600">
      {seedMessages.length === 0 ? (
        <p className="text-zinc-500">Ask Oz anything about this page.</p>
      ) : (
        seedMessages.map((message) => (
          <p key={message.id} className="text-zinc-600">
            {message.content}
          </p>
        ))
      )}
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

function SuggestedPrompts({
  prompts,
  onClick,
}: {
  prompts: OzSuggestedPrompt[]
  onClick: (prompt: OzSuggestedPrompt) => void
}) {
  return (
    <div className="shrink-0 border-t border-zinc-200 bg-white px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Try</p>
        <span className="h-px flex-1 bg-zinc-100" aria-hidden="true" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {prompts.slice(0, 4).map((prompt) => (
          <button
            key={prompt.id}
            type="button"
            onClick={() => onClick(prompt)}
            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            {prompt.label}
          </button>
        ))}
      </div>
    </div>
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
  modeOpen,
  onToggleMode,
  onSelectMode,
  modeMenuRef,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  draft: string
  onDraftChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onSubmit: (event?: FormEvent) => void
  canSend: boolean
  mode: ChatMode
  modeOpen: boolean
  onToggleMode: () => void
  onSelectMode: (mode: ChatMode) => void
  modeMenuRef: React.RefObject<HTMLDivElement | null>
}) {
  const activeMode = modeOptions.find((option) => option.id === mode) ?? modeOptions[0]
  const ModeIcon = activeMode.icon

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
        <div className="relative flex items-center justify-between gap-2 px-2 pb-2 pt-1 text-xs">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              title="Model selector (demo only)"
            >
              <span>oz-prompt</span>
              <ChevronDownIcon className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onToggleMode}
              aria-haspopup="menu"
              aria-expanded={modeOpen}
              aria-label={`Mode: ${activeMode.label}`}
              title={activeMode.tooltip}
              className={joinClasses(
                'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-zinc-700 transition-colors',
                modeOpen
                  ? 'border-zinc-300 bg-zinc-100'
                  : 'border-zinc-200 bg-white hover:bg-zinc-100',
              )}
            >
              <ModeIcon className="h-3 w-3 text-zinc-500" aria-hidden="true" />
              <span>{activeMode.label}</span>
              <ChevronDownIcon className="h-3 w-3 text-zinc-500" />
            </button>

            {modeOpen && (
              <div
                ref={modeMenuRef}
                role="menu"
                aria-label="Chat mode"
                className="absolute bottom-full left-12 z-30 mb-1 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg"
              >
                {modeOptions.map((option) => {
                  const Icon = option.icon
                  const active = option.id === mode
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitem"
                      onClick={() => onSelectMode(option.id)}
                      aria-current={active ? 'true' : undefined}
                      className={joinClasses(
                        'flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors',
                        active ? 'bg-zinc-50' : 'hover:bg-zinc-50',
                      )}
                    >
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
                      <span className="min-w-0">
                        <span
                          className={joinClasses(
                            'block text-zinc-900',
                            active ? 'font-semibold' : 'font-medium',
                          )}
                        >
                          {option.label}
                        </span>
                        <span className="block text-[11px] text-zinc-500">{option.tooltip}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <span className="hidden text-[11px] text-zinc-400 sm:block">
            ↵ to send · ⇧↵ for newline
          </span>

          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            title={`Send (${activeMode.label})`}
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
