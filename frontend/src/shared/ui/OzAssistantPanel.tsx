import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { matchMilwaukeeLeadGridIntent } from '../../features/leadGen/leadGenTableModel'
import { matchStockUpLikelyBuyersIntent } from '../../features/leadGen/stockUpBuyerIntents'
import type { TableRowContextAttachment } from '../tableRowContext'
import { ArrowUpIcon } from './icons'
import { SimpleAssistantMarkdown } from './SimpleAssistantMarkdown'
import { joinClasses, type Tone } from './visualSystem'

export type OzMessageRole = 'user' | 'oz' | 'system'

/** What we know before handling the current user line (excludes the line being sent). */
export interface OzChatTurnContext {
  /** Prior user message texts, oldest first (current input not included). */
  priorUserMessages: string[]
  /** User + assistant lines with plain string bodies (thinking placeholders skipped). */
  priorExchanges: { role: 'user' | 'oz' | 'system'; text: string }[]
  /** Current-turn focused table rows (from composer); not in transcript until send. */
  tableContextAttachments?: TableRowContextAttachment[]
}
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
  /** When set, the assistant text is revealed incrementally, then cleared. */
  streamIn?: boolean
  /**
   * When true, show the full reply at once (no line-by-line reveal). Set when the parent handler
   * returns `{ stream: false }`.
   */
  instantReply?: boolean
  timestamp?: string
  sources?: string[]
  /** Lumberyard activity table rows the user had in the composer for this line. */
  rowAttachments?: { id: string; label: string }[]
}

export interface OzAssistantAction {
  id: string
  label: string
  variant?: OzActionVariant
  disabled?: boolean
  onClick?: () => void
}

export interface OzAssistantPanelProps {
  /** @deprecated — ignored; kept for API compatibility. */
  title?: string
  eyebrow?: string
  contextSummary: string
  contextItems?: OzContextItem[]
  messages: OzAssistantMessage[]
  actions?: OzAssistantAction[]
  className?: string
  onClosePanel?: () => void
  onUserMessage?: (
    text: string,
    context: OzChatTurnContext,
  ) =>
    | { reply: string; delayMs?: number; stream?: boolean }
    | void
    | Promise<{ reply: string; delayMs?: number; stream?: boolean } | void>
  /**
   * Choose the loading UI after the user sends a line (before `onUserMessage` resolves).
   * Use `knowledge_base` when the reply will draw on company-specific tabular / KB data.
   * Use `knowledge_web` for live web search (Chrome icon). Use `knowledge_crm` for CRM
   * lookup (Outlook · Salesforce · HubSpot · Apollo icons). `knowledge_crm_likely_buyers` uses
   * the same icons with a longer stagger (likely-buyer / stock-up flow).
   * `knowledge_customer_demand` — Excel + Endeavor (Oz customer demand / P&L charts).
   */
  pendingAssistantPlaceholder?: (
    userText: string,
  ) =>
    | 'thinking'
    | 'knowledge_base'
    | 'knowledge_web'
    | 'knowledge_crm'
    | 'knowledge_crm_likely_buyers'
    | 'knowledge_customer_demand'
  /** Focused table rows (any generated table) shown as chips above the input until removed or sent. */
  composerContextAttachments?: TableRowContextAttachment[]
  onRemoveComposerContextAttachment?: (attachmentKey: string) => void
  /**
   * If true, do not add the default opening Oz line when the thread is empty. Useful in tests
   * or a bare composer-only first screen.
   */
  hideWelcome?: boolean
  /**
   * `center` — home column (default). `dock` — bottom strip for full-page views (e.g. lead table).
   */
  layout?: 'center' | 'dock'
  /** Fires when a knowledge loading pill is shown, before the reply. Argument is the pill variant. */
  onKnowledgePreambleStart?: (kind: OzKnowledgePillKind) => void
  /** Fires when the in-chat knowledge preamble (staggered source icons) finishes, or the placeholder unmounts. */
  onKnowledgePreambleComplete?: () => void
  /**
   * Fires once per send after the assistant reply is written into the thread (after network delay, before stream ends).
   * Use to clear composer row context chips so a turn does not keep rows “linked” after the message is sent.
   */
  onAfterUserMessage?: () => void
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function asString(content: ReactNode): string {
  if (typeof content === 'string') return content
  if (typeof content === 'number') return String(content)
  return ''
}

export const OZ_DEFAULT_WELCOME =
  "Hey—I'm Oz. Tell me what you want to do next in plain language. I'll stay in the thread with you."

function transcriptToContext(transcript: OzAssistantMessage[]): OzChatTurnContext {
  const priorExchanges: OzChatTurnContext['priorExchanges'] = []
  for (const m of transcript) {
    const t = asString(m.content)
    if (
      m.role === 'oz' &&
      (t === '__thinking__' ||
        t === '__knowledge_base__' ||
        t === '__knowledge_web__' ||
        t === '__knowledge_crm__')
    )
      continue
    if (m.role === 'user') {
      const ra = m.rowAttachments
      const withCtx = ra?.length
        ? `[Context: ${ra.map((r) => r.label).join(', ')}] ${t}`.trim()
        : t
      if (!withCtx.trim()) continue
      priorExchanges.push({ role: 'user', text: withCtx })
    } else {
      if (!t.trim()) continue
      if (m.role === 'oz') priorExchanges.push({ role: 'oz', text: t })
      else if (m.role === 'system') priorExchanges.push({ role: 'system', text: t })
    }
  }
  const priorUserMessages = priorExchanges.filter((e) => e.role === 'user').map((e) => e.text)
  return { priorUserMessages, priorExchanges }
}

function lastOzText(ctx: OzChatTurnContext): string {
  for (let i = ctx.priorExchanges.length - 1; i >= 0; i--) {
    if (ctx.priorExchanges[i]!.role === 'oz') return ctx.priorExchanges[i]!.text
  }
  return ''
}

function buildScriptedReply(
  input: string,
  contextSummary: string,
  ctx: OzChatTurnContext,
): string {
  const trimmed = input.trim()
  const lower = trimmed.toLowerCase()
  const lastOz = lastOzText(ctx)
  if (matchStockUpLikelyBuyersIntent(input)) {
    return 'After your competitor product search, I can open the lead grid for likely buyers filtered to those product lines—engaged accounts first. If you have not run a competitor search yet, do that on the activity grid, then ask again.'
  }
  if (matchMilwaukeeLeadGridIntent(input)) {
    return 'I found distributors in the Milwaukee area and added them to the lead table on the right. Skim size and type before you route visits or enrollments.'
  }
  if (/^(yes|yeah|yep|yup|ok|okay|sounds good|sounds right|do it|please do)\b/.test(lower)) {
    if (lastOz || ctx.priorExchanges.length > 0) {
      return "Got it. I'll use that. What's the next move—tighten the list, re-sort, or line up a visit?"
    }
  }
  if (/\b(thanks|thank you|thx|appreciate it)\b/.test(lower)) {
    return "You're welcome. I'm here in the thread if you need another pass or a sharper next step."
  }
  if (/\b(why|how come)\b/.test(lower) && (lastOz || ctx.priorExchanges.length > 0)) {
    return "I'm following the intent in your last couple of messages. If you want a different result, rephrase the goal or add a constraint (sort, source, or engagement) and I'll adjust."
  }
  if (lower.includes('next') && (lower.includes('step') || lower.includes('action'))) {
    return 'The next move depends a bit on what you are staring at, but a safe order is: narrow the set, then pick two accounts to call or visit, then follow up the rest. Say what you are looking at and I will be specific.'
  }
  if (lower.includes('next')) {
    return 'The next sales action depends on the page in focus. From here, I would either draft a quote, build a route, or schedule a follow-up call.'
  }
  if (lower.includes('product') || lower.includes('demand')) {
    return 'Composite decking, hidden fasteners, and exterior trim are the strongest product signals across int_001-int_003 in the demo data.'
  }
  if (lower.includes('competitor') || lower.includes('lost')) {
    return 'TimberTech and Boral show up as the active competitors. Russin Lumber and Hudson Valley Supply are the at-risk accounts to call first.'
  }
  if (trimmed.startsWith('hi') || trimmed.startsWith('hey') || trimmed.startsWith('hello')) {
    if (ctx.priorUserMessages.length > 0) {
      return 'Hey again. Still on the same track, or should we change direction?'
    }
    return 'Hey. What do you want to do next?'
  }
  if (ctx.priorUserMessages.length >= 2) {
    return `I’m with you. Building on our thread: say whether you want to dig into one account, widen the set, or pick a follow-up and I will mirror that.`
  }
  if (contextSummary) {
    return `Right—on this view, the gist is: ${contextSummary} Tell me a tighter next step and I will stay in the back-and-forth.`
  }
  return 'Alright. Tell me a bit more about the outcome you want, and I will answer in-thread—sorting, follow-ups, or the Milwaukee grid, for example.'
}

/** Reply text streams in small chunks per tick (including newlines). */
const ASSISTANT_STREAM_CHUNK_CHARS = 2
const ASSISTANT_STREAM_TICK_MS = 9

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const fn = () => setReduced(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return reduced
}

function StreamedText({
  text,
  onComplete,
  className,
  reducedMotion = false,
}: {
  text: string
  onComplete: () => void
  className?: string
  /** When set, one-shot render with no per-line delay (e.g. system prefers reduced motion). */
  reducedMotion?: boolean
}) {
  const [shown, setShown] = useState('')
  const systemReduced = usePrefersReducedMotion()
  const reduce = reducedMotion || systemReduced
  const doneRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    doneRef.current = false
    if (reduce) {
      setShown(text)
      if (!doneRef.current) {
        doneRef.current = true
        onCompleteRef.current()
      }
      return
    }
    setShown('')
    if (text.length === 0) {
      if (!doneRef.current) {
        doneRef.current = true
        onCompleteRef.current()
      }
      return
    }
    let id: number | null = null
    let n = 0
    const run = () => {
      n = Math.min(n + ASSISTANT_STREAM_CHUNK_CHARS, text.length)
      setShown(text.slice(0, n))
      if (n >= text.length) {
        if (!doneRef.current) {
          doneRef.current = true
          onCompleteRef.current()
        }
        return
      }
      id = window.setTimeout(run, ASSISTANT_STREAM_TICK_MS)
    }
    id = window.setTimeout(run, 0)
    return () => {
      if (id != null) window.clearTimeout(id)
      if (!doneRef.current) {
        doneRef.current = true
        onCompleteRef.current()
      }
    }
  }, [text, reduce])

  const typing = !reduce && shown.length < text.length

  return (
    <div
      className={joinClasses('flex w-full min-w-0 items-end gap-0.5', className)}
    >
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <SimpleAssistantMarkdown text={shown} streamMode />
      </div>
      {typing ? (
        <span
          className="mb-0.5 inline-block h-3.5 w-0.5 shrink-0 self-end rounded-sm bg-zinc-500/85 motion-safe:animate-pulse"
          aria-hidden
        />
      ) : null}
    </div>
  )
}

function ChatComposerRow({
  textareaRef,
  draft,
  onDraftChange,
  onKeyDown,
  onSubmit,
  canSend,
  size,
  formClassName,
  inputId = 'oz-chat-input',
  contextRowTags,
  onRemoveContextRowTag,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  draft: string
  onDraftChange: (v: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  onSubmit: (e?: FormEvent) => void
  canSend: boolean
  size: 'hero' | 'compact'
  formClassName?: string
  inputId?: string
  contextRowTags?: { id: string; label: string }[]
  onRemoveContextRowTag?: (rowId: string) => void
}) {
  return (
    <form
      onSubmit={onSubmit}
      className={joinClasses('w-full', formClassName)}
    >
      <label htmlFor={inputId} className="sr-only">
        Ask Oz
      </label>
      <div
        className={joinClasses(
          'flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-white',
          'border-zinc-200/90 shadow-sm transition-shadow',
          'focus-within:border-zinc-300/90 focus-within:shadow',
          'focus-within:ring-2 focus-within:ring-zinc-300/20',
        )}
      >
        {contextRowTags && contextRowTags.length > 0 ? (
          <div
            className="flex min-h-0 flex-wrap content-start gap-1.5 border-b border-zinc-200/60 bg-sky-50/40 px-2 py-1.5 pl-2.5"
            role="list"
            aria-label="Context from activity table"
          >
            {contextRowTags.map((tag) => (
              <span key={tag.id} role="listitem" className="inline-flex">
                <button
                  type="button"
                  onClick={() => onRemoveContextRowTag?.(tag.id)}
                  className={joinClasses(
                    'inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-md border border-sky-300/60 bg-white/90 px-1.5 py-0.5',
                    'text-left font-mono text-[10px] font-semibold leading-tight text-sky-900',
                    'shadow-sm transition-colors hover:border-sky-400/80 hover:bg-sky-50/95',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500/50',
                  )}
                  title="Remove from context"
                >
                  <span className="min-w-0">{tag.label}</span>
                  <span className="shrink-0 text-zinc-400" aria-hidden>
                    ×
                  </span>
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div
          className={joinClasses(
            'flex w-full min-w-0 items-end gap-0.5',
            size === 'hero' ? 'p-1.5 pl-4' : 'p-1 pl-2.5',
          )}
        >
        <textarea
          id={inputId}
          name="oz-message"
          ref={textareaRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          autoComplete="off"
          enterKeyHint="send"
          placeholder="Ask Oz…"
          className={joinClasses(
            'min-h-[2.75rem] max-h-40 flex-1 resize-none border-0 bg-transparent text-sm leading-snug',
            'text-zinc-900 placeholder:text-zinc-400',
            'focus:outline-none',
            size === 'hero' && 'text-[15px] placeholder:text-zinc-400/90',
            size === 'compact' && 'py-2 pr-0.5',
            size === 'hero' && 'py-2.5 pr-1',
          )}
        />
        <div className="flex shrink-0 self-end pb-0.5 pr-0.5">
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className={joinClasses(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
              canSend
                ? 'bg-zinc-900 text-white shadow-sm hover:bg-zinc-800'
                : 'bg-zinc-200 text-zinc-400',
            )}
          >
            <ArrowUpIcon className="h-4 w-4" />
          </button>
        </div>
        </div>
      </div>
    </form>
  )
}

function buildInitialTranscript(
  seed: OzAssistantMessage[],
  hideWelcome: boolean,
): OzAssistantMessage[] {
  if (seed.length > 0) return seed
  if (hideWelcome) return []
  return [{ id: 'oz-welcome', role: 'oz', content: OZ_DEFAULT_WELCOME }]
}

/** Stable when `[]` is passed inline each render, so the seed effect only runs when content or welcome flag actually changes. */
function assistantSeedSignature(msgs: OzAssistantMessage[]): string {
  if (msgs.length === 0) return ''
  return msgs
    .map((m) => `${m.id}\0${m.role}\0${asString(m.content)}`)
    .join('\n')
}

export const OZ_KNOWLEDGE_PLACEHOLDER = '__knowledge_base__' as const
export const OZ_KNOWLEDGE_WEB_PLACEHOLDER = '__knowledge_web__' as const
export const OZ_KNOWLEDGE_CRM_PLACEHOLDER = '__knowledge_crm__' as const
export const OZ_KNOWLEDGE_CRM_LIKELY_BUYERS_PLACEHOLDER = '__knowledge_crm_likely_buyers__' as const
export const OZ_KNOWLEDGE_CUSTOMER_DEMAND_PLACEHOLDER = '__knowledge_customer_demand__' as const

/** Which in-chat “knowledge” loading pill is shown; passed to `onKnowledgePreambleStart` when a pill opens. */
export type OzKnowledgePillKind =
  | 'knowledge_base'
  | 'knowledge_web'
  | 'knowledge_crm'
  | 'knowledge_crm_likely_buyers'
  | 'knowledge_customer_demand'
type KnowledgePillKind = OzKnowledgePillKind
type PendingKind = 'thinking' | KnowledgePillKind

function isKnowledgePillKind(k: PendingKind): k is KnowledgePillKind {
  return (
    k === 'knowledge_base' ||
    k === 'knowledge_web' ||
    k === 'knowledge_crm' ||
    k === 'knowledge_crm_likely_buyers' ||
    k === 'knowledge_customer_demand'
  )
}

function placeholderForPendingKind(k: PendingKind): string {
  if (k === 'knowledge_base') return OZ_KNOWLEDGE_PLACEHOLDER
  if (k === 'knowledge_web') return OZ_KNOWLEDGE_WEB_PLACEHOLDER
  if (k === 'knowledge_crm_likely_buyers') return OZ_KNOWLEDGE_CRM_LIKELY_BUYERS_PLACEHOLDER
  if (k === 'knowledge_crm') return OZ_KNOWLEDGE_CRM_PLACEHOLDER
  if (k === 'knowledge_customer_demand') return OZ_KNOWLEDGE_CUSTOMER_DEMAND_PLACEHOLDER
  return '__thinking__'
}

interface KnowledgePillVariant {
  label: string
  /** Per-variant stagger so a slow remote call (e.g. lumberyard intel LLM, ~3-5s) is masked
   *  by a longer pill animation; fast variants (CRM filter) keep a snappy default. */
  staggerMs: number
  icons: { src: string; widthClass?: string; maxClass?: string }[]
  /**
   * Extra time after the last source icon is visible, before the assistant message may stream in.
   * (See `variantSequenceMs` and `earliestReplyAt` in the send handler.)
   */
  postSequencePadMs?: number
}

const KNOWLEDGE_PILL_VARIANTS: Record<KnowledgePillKind, KnowledgePillVariant> = {
  knowledge_base: {
    label: 'Loading Data from Knowledge Base',
    // 3 icons × 600ms = 1.8s — closer to typical lumberyard-intel LLM round-trip so the
    // pill is still animating when the reply arrives instead of "freezing" at full state.
    staggerMs: 600,
    icons: [
      { src: '/knowledge-excel.png' },
      { src: '/lead-source-logos/outlook.png' },
      { src: '/endeavor-logo.png', widthClass: 'h-5 w-auto', maxClass: 'max-h-5 min-w-0 max-w-[28px]' },
    ],
  },
  knowledge_web: {
    label: 'Searching the web',
    staggerMs: 320,
    icons: [{ src: '/lead-source-logos/internet.png' }],
  },
  knowledge_crm: {
    label: 'Searching CRM',
    staggerMs: 320,
    icons: [
      { src: '/lead-source-logos/outlook.png' },
      { src: '/lead-source-logos/salesforce.png' },
      { src: '/lead-source-logos/hubspot.png' },
      { src: '/lead-source-logos/apollo.png' },
    ],
  },
  /** Slower than `knowledge_crm` so the right-hand lead grid can stage after a steadier “lookup” beat. */
  knowledge_crm_likely_buyers: {
    label: 'Scoring likely buyers',
    staggerMs: 700,
    icons: [
      { src: '/lead-source-logos/outlook.png' },
      { src: '/lead-source-logos/salesforce.png' },
      { src: '/lead-source-logos/hubspot.png' },
      { src: '/lead-source-logos/apollo.png' },
    ],
  },
  /** Oz home: customer demand / P&L charts — Excel + Endeavor only; long stagger + hold before the reply. */
  knowledge_customer_demand: {
    label: 'Loading customer demand from knowledge',
    staggerMs: 1100,
    postSequencePadMs: 1200,
    icons: [
      { src: '/knowledge-excel.png' },
      { src: '/endeavor-logo.png', widthClass: 'h-5 w-auto', maxClass: 'max-h-5 min-w-0 max-w-[28px]' },
    ],
  },
}

function variantStepsFor(kind: KnowledgePillKind): number {
  return KNOWLEDGE_PILL_VARIANTS[kind].icons.length
}

function variantSequenceMs(kind: KnowledgePillKind): number {
  const v = KNOWLEDGE_PILL_VARIANTS[kind]
  return v.icons.length * v.staggerMs + (v.postSequencePadMs ?? 0)
}

/**
 * Short buffer after the sequence window so the last icon is visibly “settled”
 * (plus `postSequencePadMs` on a variant, if any, which is included in `variantSequenceMs`).
 */
const KNOWLEDGE_STREAM_AFTER_LAST_LOGO_MS = 180

export function OzAssistantPanel({
  contextSummary,
  messages: seed,
  className,
  onUserMessage,
  pendingAssistantPlaceholder,
  composerContextAttachments,
  onRemoveComposerContextAttachment,
  layout = 'center',
  hideWelcome = false,
  onKnowledgePreambleStart,
  onKnowledgePreambleComplete: onKnowledgePreambleCompleteFromParent,
  onAfterUserMessage,
}: OzAssistantPanelProps) {
  const [transcript, setTranscript] = useState<OzAssistantMessage[]>(() =>
    buildInitialTranscript(seed, hideWelcome),
  )
  const [draft, setDraft] = useState('')
  const [historyCursor, setHistoryCursor] = useState<number | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const reducedMotion = usePrefersReducedMotion()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const prevBusyRef = useRef(false)
  const knowledgePreambleFallbackTimerRef = useRef<number | null>(null)
  const knowledgePreambleNotifiedRef = useRef(false)
  const knowledgePreambleT0Ref = useRef(0)

  const seedSignature = assistantSeedSignature(seed)
  useEffect(() => {
    setTranscript(buildInitialTranscript(seed, hideWelcome))
    setDraft('')
    setHistoryCursor(null)
    setPendingId(null)
    setStreamingId(null)
    // `seed` omitted on purpose: `messages={[]}` from parents is a new `[]` each render, but
    // `seedSignature` is stable for the same content.
  }, [hideWelcome, seedSignature])

  useEffect(() => {
    return () => {
      if (knowledgePreambleFallbackTimerRef.current != null) {
        clearTimeout(knowledgePreambleFallbackTimerRef.current)
        knowledgePreambleFallbackTimerRef.current = null
      }
    }
  }, [])

  const isPending = pendingId !== null || streamingId !== null

  const notifyKnowledgePreambleComplete = useCallback(() => {
    if (knowledgePreambleNotifiedRef.current) return
    knowledgePreambleNotifiedRef.current = true
    if (knowledgePreambleFallbackTimerRef.current != null) {
      clearTimeout(knowledgePreambleFallbackTimerRef.current)
      knowledgePreambleFallbackTimerRef.current = null
    }
    onKnowledgePreambleCompleteFromParent?.()
  }, [onKnowledgePreambleCompleteFromParent])

  const onStreamEnd = useCallback((id: string) => {
    setStreamingId(null)
    setTranscript((t) => t.map((m) => (m.id === id && m.streamIn ? { ...m, streamIn: false } : m)))
  }, [])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [transcript, streamingId])

  /** Return focus to the composer when a reply finishes (keyboard and AT users). */
  useEffect(() => {
    const busy = pendingId !== null || streamingId !== null
    if (prevBusyRef.current && !busy) {
      const id = requestAnimationFrame(() => {
        textareaRef.current?.focus({ preventScroll: true })
      })
      prevBusyRef.current = false
      return () => cancelAnimationFrame(id)
    }
    prevBusyRef.current = busy
  }, [pendingId, streamingId])

  const resizeTextarea = useCallback(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    const max = 6 * 22
    const h = Math.min(node.scrollHeight, max)
    node.style.height = `${Math.max(44, h)}px`
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [draft, resizeTextarea])

  const userHistory = transcript
    .filter((message) => message.role === 'user')
    .map((message) => asString(message.content))

  const send = useCallback(
    async (rawInput: string) => {
      const value = rawInput.trim()
      if (!value || isPending) return

      if (knowledgePreambleFallbackTimerRef.current != null) {
        clearTimeout(knowledgePreambleFallbackTimerRef.current)
        knowledgePreambleFallbackTimerRef.current = null
      }

      const att = composerContextAttachments
      const turnCtx: OzChatTurnContext = {
        ...transcriptToContext(transcript),
        tableContextAttachments: att?.length ? att : undefined,
      }
      const userMessage: OzAssistantMessage = {
        id: makeId(),
        role: 'user',
        content: value,
        rowAttachments: att?.map((a) => ({ id: a.key, label: a.label })),
      }
      const pendingKind: PendingKind = pendingAssistantPlaceholder?.(value) ?? 'thinking'
      const placeholder: OzAssistantMessage = {
        id: makeId(),
        role: 'oz',
        content: placeholderForPendingKind(pendingKind),
      }
      const isKnowledgePreamble = isKnowledgePillKind(pendingKind)
      const knowledgeSequenceMs = isKnowledgePreamble ? variantSequenceMs(pendingKind) : 0
      if (isKnowledgePreamble) {
        knowledgePreambleNotifiedRef.current = false
        knowledgePreambleT0Ref.current = Date.now()
        onKnowledgePreambleStart?.(pendingKind)
      }
      setPendingId(placeholder.id)
      setTranscript((t) => [...t, userMessage, placeholder])
      setDraft('')
      setHistoryCursor(null)

      const t0 = Date.now()
      let fromParent: { reply: string; delayMs?: number; stream?: boolean } | void
      try {
        fromParent = await Promise.resolve(onUserMessage?.(value, turnCtx))
      } catch {
        fromParent = {
          reply: 'I could not complete that just now. Try again in a moment.',
          delayMs: 0,
        }
      }
      const replyText =
        fromParent && typeof fromParent === 'object' && 'reply' in fromParent
          ? fromParent.reply
          : buildScriptedReply(value, contextSummary, turnCtx)
      const wantDelay =
        fromParent && typeof fromParent === 'object' && 'delayMs' in fromParent && fromParent.delayMs != null
          ? fromParent.delayMs
          : 140
      const afterNetwork = Date.now() - t0
      const paddedDelay = Math.max(0, wantDelay - afterNetwork)
      const extra = (() => {
        if (!isKnowledgePreamble) return paddedDelay
        const sequenceMs = reducedMotion ? 0 : knowledgeSequenceMs
        const earliestReplyAt =
          knowledgePreambleT0Ref.current + sequenceMs + KNOWLEDGE_STREAM_AFTER_LAST_LOGO_MS
        const untilAfterLastLogo = Math.max(0, earliestReplyAt - Date.now())
        return Math.max(paddedDelay, untilAfterLastLogo)
      })()
      const doStream =
        fromParent && typeof fromParent === 'object' && 'stream' in fromParent && fromParent.stream === false
          ? false
          : !reducedMotion
      const instantOptOut =
        fromParent && typeof fromParent === 'object' && 'stream' in fromParent && fromParent.stream === false

      window.setTimeout(() => {
        setTranscript((t) =>
          t.map((entry) =>
            entry.id === placeholder.id
              ? {
                  ...entry,
                  content: replyText,
                  streamIn: doStream,
                  ...(instantOptOut ? { instantReply: true } : {}),
                }
              : entry,
          ),
        )
        setPendingId(null)
        if (doStream) setStreamingId(placeholder.id)
        onAfterUserMessage?.()
        if (isKnowledgePreamble && !knowledgePreambleNotifiedRef.current) {
          const targetMs = reducedMotion ? 0 : knowledgeSequenceMs
          const remain = Math.max(0, targetMs - (Date.now() - knowledgePreambleT0Ref.current))
          knowledgePreambleFallbackTimerRef.current = window.setTimeout(() => {
            knowledgePreambleFallbackTimerRef.current = null
            notifyKnowledgePreambleComplete()
          }, remain)
        }
      }, extra)
    },
    [
      composerContextAttachments,
      contextSummary,
      isPending,
      notifyKnowledgePreambleComplete,
      onAfterUserMessage,
      onKnowledgePreambleStart,
      onUserMessage,
      pendingAssistantPlaceholder,
      reducedMotion,
      transcript,
    ],
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

  const canSend = draft.trim().length > 0 && !isPending

  const isDocked = layout === 'dock'
  const isCentered = layout === 'center'
  const hasThread = transcript.length > 0

  const onDraft = (v: string) => {
    setDraft(v)
    if (historyCursor !== null) setHistoryCursor(null)
  }

  const contextRowTags = composerContextAttachments?.map((a) => ({ id: a.key, label: a.label }))

  const sharedComposer = (opts: { size: 'hero' | 'compact'; className?: string; inputId?: string }) => (
    <ChatComposerRow
      textareaRef={textareaRef}
      draft={draft}
      onDraftChange={onDraft}
      onKeyDown={handleKeyDown}
      onSubmit={handleSubmit}
      canSend={canSend}
      size={opts.size}
      formClassName={opts.className}
      inputId={opts.inputId}
      contextRowTags={contextRowTags}
      onRemoveContextRowTag={onRemoveComposerContextAttachment}
    />
  )

  if (isCentered && !hasThread) {
    return (
      <aside
        className={joinClasses(
          'flex h-full min-h-0 w-full max-w-2xl flex-col justify-center bg-transparent',
          className,
        )}
        aria-label="Oz chat"
      >
        <h2 className="sr-only">Start a conversation with Oz</h2>
        <div
          role="region"
          className="flex w-full flex-col items-center justify-center gap-2 px-2"
          aria-label="Oz conversation"
        >
          {sharedComposer({
            size: 'hero',
            className: 'max-w-md md:max-w-lg',
            inputId: 'oz-chat-input-hero',
          })}
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={joinClasses(
        isDocked
          ? 'flex max-h-[min(38vh,360px)] min-h-[200px] shrink-0 flex-col overflow-hidden border-t border-zinc-200 bg-white text-zinc-900'
          : isCentered
            ? 'flex h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden bg-transparent text-zinc-900'
            : 'flex h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden bg-white text-zinc-900',
        className,
      )}
      aria-label="Oz chat"
    >
      <div
        ref={scrollerRef}
        role="log"
        className={joinClasses(
          'min-h-0 min-w-0 flex-1 basis-0 overflow-y-auto overscroll-y-contain',
          isDocked ? 'px-3 pt-2 pb-1' : 'px-4 pb-2 pt-3',
        )}
        aria-label="Oz conversation"
        aria-describedby="oz-conversation-log-hint"
        aria-relevant="additions text"
      >
        <p id="oz-conversation-log-hint" className="sr-only">
          New messages appear at the bottom of this chat.
        </p>
        {transcript.length > 0 && (
          <div
            className={joinClasses(
              'mx-auto flex w-full max-w-2xl flex-col gap-3',
              isCentered && 'items-center pt-0',
            )}
          >
            {transcript.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onStreamEnd={message.streamIn ? onStreamEnd : undefined}
                onKnowledgePreambleSequenceComplete={notifyKnowledgePreambleComplete}
                align={isCentered ? 'center' : 'sides'}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className={joinClasses(
          'shrink-0',
          isDocked
            ? 'border-t border-zinc-200/80 bg-zinc-50/90 px-3 py-2.5'
            : isCentered
              ? 'px-3 pb-8 pt-1'
              : 'border-t border-zinc-200/90 bg-zinc-50/80 px-3 py-3',
        )}
      >
        {sharedComposer({
          size: 'compact',
          className: isCentered ? 'mx-auto w-full max-w-2xl' : 'w-full',
          inputId: 'oz-chat-input',
        })}
      </div>
    </aside>
  )
}

/**
 * Label first, then icons appear one per `KB_PREAMBLE_STAGGER_MS`.
 * Variants: `knowledge_base` (Excel→Outlook→Endeavor), `knowledge_web` (Chrome),
 * `knowledge_crm` / `knowledge_crm_likely_buyers` (Outlook→Salesforce→HubSpot→Apollo). Reveal-after timing in App
 * uses `variantSequenceMs(kind)` after t0. When `reducedMotion`, all icons at once.
 */
function KnowledgeBaseLoadingPill({
  kind,
  reducedMotion,
  onSequenceComplete,
}: {
  kind: KnowledgePillKind
  reducedMotion: boolean
  onSequenceComplete?: () => void
}) {
  const variant = KNOWLEDGE_PILL_VARIANTS[kind]
  const totalSteps = variant.icons.length
  const staggerMs = variant.staggerMs
  const [phase, setPhase] = useState(() => (reducedMotion ? totalSteps : 0))
  const sequenceFired = useRef(false)

  const fireSequenceComplete = useCallback(() => {
    if (sequenceFired.current) return
    sequenceFired.current = true
    onSequenceComplete?.()
  }, [onSequenceComplete])

  useEffect(() => {
    if (reducedMotion) {
      setPhase(totalSteps)
    }
  }, [reducedMotion, totalSteps])

  useEffect(() => {
    if (reducedMotion) return
    if (phase >= totalSteps) return
    const id = window.setTimeout(() => setPhase((p) => p + 1), staggerMs)
    return () => clearTimeout(id)
  }, [phase, reducedMotion, totalSteps, staggerMs])

  useLayoutEffect(() => {
    if (reducedMotion) {
      fireSequenceComplete()
      return
    }
    if (phase >= totalSteps) {
      fireSequenceComplete()
    }
  }, [reducedMotion, phase, totalSteps, fireSequenceComplete])

  return (
    <div
      className={joinClasses(
        'flex max-w-[min(100%,32rem)] flex-row flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50/95 to-white px-3 py-2.5 text-left shadow-sm',
      )}
      role="status"
      aria-live="polite"
      aria-busy={phase < totalSteps}
    >
      <p className="m-0 max-w-full shrink-0 text-sm font-medium leading-snug text-zinc-800">
        {variant.label}
      </p>
      <div
        className="flex min-h-6 shrink-0 flex-row flex-nowrap items-center gap-1.5"
        aria-hidden
      >
        {variant.icons.map((icon, i) =>
          phase >= i + 1 ? (
            <img
              key={icon.src}
              src={icon.src}
              alt=""
              width={20}
              height={20}
              className={joinClasses(
                icon.widthClass ?? 'h-5 w-5',
                'shrink-0 object-contain',
                icon.maxClass,
              )}
              loading="eager"
              decoding="async"
            />
          ) : null,
        )}
      </div>
    </div>
  )
}

function ChatMessage({
  message,
  onStreamEnd,
  onKnowledgePreambleSequenceComplete,
  align = 'sides',
  reducedMotion = false,
}: {
  message: OzAssistantMessage
  onStreamEnd?: (id: string) => void
  /** Fires when the knowledge pill label + icon sequence has finished (used to show the right-hand table). */
  onKnowledgePreambleSequenceComplete?: () => void
  /** `center` — thread is one centered column; `sides` — user right, assistant left. */
  align?: 'sides' | 'center'
  reducedMotion?: boolean
}) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isThinking = message.role === 'oz' && message.content === '__thinking__'
  const knowledgePillKind: KnowledgePillKind | null =
    message.role === 'oz' && message.content === OZ_KNOWLEDGE_PLACEHOLDER
      ? 'knowledge_base'
      : message.role === 'oz' && message.content === OZ_KNOWLEDGE_WEB_PLACEHOLDER
        ? 'knowledge_web'
        : message.role === 'oz' && message.content === OZ_KNOWLEDGE_CRM_LIKELY_BUYERS_PLACEHOLDER
          ? 'knowledge_crm_likely_buyers'
          : message.role === 'oz' && message.content === OZ_KNOWLEDGE_CRM_PLACEHOLDER
            ? 'knowledge_crm'
            : message.role === 'oz' && message.content === OZ_KNOWLEDGE_CUSTOMER_DEMAND_PLACEHOLDER
              ? 'knowledge_customer_demand'
              : null
  const isKnowledgeLoading = knowledgePillKind !== null
  const body = asString(message.content)
  const useTypewriter =
    message.role === 'oz' &&
    !isThinking &&
    !isKnowledgeLoading &&
    !message.instantReply &&
    typeof message.content === 'string' &&
    body.length > 0

  const roleLabel = isUser ? 'You' : isSystem ? 'System' : 'Oz'
  const centered = align === 'center'

  const pillSrLabel =
    knowledgePillKind === 'knowledge_web'
      ? ' · Searching the web'
      : knowledgePillKind === 'knowledge_crm_likely_buyers'
        ? ' · Scoring likely buyers; Outlook, Salesforce, HubSpot, Apollo'
        : knowledgePillKind === 'knowledge_crm'
          ? ' · Searching CRM; Outlook, Salesforce, HubSpot, Apollo'
          : ' · Searching company knowledge; Excel, Outlook, Endeavor'

  return (
    <article
      className={joinClasses(
        'cursor-chat-message flex w-full max-w-2xl flex-col gap-0.5',
        !centered && isUser && 'items-end',
        centered && isUser && 'items-end',
        centered && !isUser && 'items-center text-center',
      )}
    >
      <span className="sr-only">
        {roleLabel}
        {isUser && message.rowAttachments?.length
          ? ` · Context: ${message.rowAttachments.map((r) => r.label).join(', ')}`
          : null}
        {isThinking && ' · Thinking'}
        {isKnowledgeLoading && pillSrLabel}
      </span>
      {knowledgePillKind ? (
        <div
          className={joinClasses(
            !centered && 'self-start',
            centered && 'w-full min-w-0',
          )}
        >
          <KnowledgeBaseLoadingPill
            kind={knowledgePillKind}
            reducedMotion={reducedMotion}
            onSequenceComplete={onKnowledgePreambleSequenceComplete}
          />
        </div>
      ) : isThinking ? (
        <div
          className={joinClasses(
            'flex h-5 items-center px-1',
            centered && 'w-full min-w-0 justify-center',
          )}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="sr-only">Oz is replying</span>
          <span className="cursor-chat-dot" aria-hidden="true" />
          <span className="cursor-chat-dot" aria-hidden="true" />
          <span className="cursor-chat-dot" aria-hidden="true" />
        </div>
      ) : (
        <div
          className={joinClasses(
            'text-sm leading-relaxed',
            centered && isUser
              ? 'max-w-[90%]'
              : centered
                ? 'w-full min-w-0 max-w-2xl'
                : 'max-w-[90%]',
            isUser
              ? 'rounded-2xl bg-zinc-100 px-3 py-2 text-zinc-900'
              : isSystem
                ? 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900'
                : 'text-zinc-800',
            !isUser && !isSystem && 'cursor-chat-reply-bubble rounded-2xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2',
            centered && 'text-left', // long replies stay left-aligned in the block for readability
          )}
        >
          {isUser && message.rowAttachments?.length ? (
            <div
              className="mb-1.5 flex flex-wrap justify-end gap-1.5"
              aria-hidden
            >
              {message.rowAttachments.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex max-w-full min-w-0 rounded-md border border-sky-300/50 bg-white/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-900"
                >
                  {r.label}
                </span>
              ))}
            </div>
          ) : null}
          {useTypewriter ? (
            <span aria-live="off" className="block">
              <StreamedText
                text={body}
                reducedMotion={reducedMotion}
                onComplete={() => onStreamEnd?.(message.id)}
              />
            </span>
          ) : !isUser && !isSystem && typeof message.content === 'string' ? (
            <SimpleAssistantMarkdown text={body} />
          ) : (
            message.content
          )}
        </div>
      )}
    </article>
  )
}
