import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { OzThreadDirectionModal } from '../../features/oz/OzThreadDirectionModal'
import { getOzPanelPayload } from '../../features/oz/useOzChatStream'
import { matchStockUpLikelyBuyersIntent } from '../../features/leadGen/stockUpBuyerIntents'
import {
  isKbPromotableFilename,
  postOzChatUploadsIfAvailable,
  validateComposerUploadFiles,
} from '../../features/oz/ozChatUploadsApi'
import type { TableContextScope, TableRowContextAttachment } from '../tableRowContext'
import { ArrowUpIcon, PaperclipIcon } from './icons'
import { SimpleAssistantMarkdown, type AssistantMarkdownInlineRenderer } from './SimpleAssistantMarkdown'
import {
  OzChatPanelMessageContext,
  OzChatPanelShellContext,
  createOzPanelAwareInlineRenderer,
  type OzChatPanelShellState,
} from './ozChatPanelUi'
import { SlideOutPanel } from './SlideOutPanel'
import { joinClasses, type Tone } from './visualSystem'

function OzSlideOutMount({
  threadId,
  openPanel,
  onClose,
}: {
  threadId: string
  openPanel: OzChatPanelShellState['openPanel']
  onClose: () => void
}) {
  const payloadRecord = openPanel ? getOzPanelPayload(threadId, openPanel.messageId) : undefined
  const result = payloadRecord?.result as Record<string, unknown> | undefined
  const kind =
    openPanel?.kind ?? (typeof result?.kind === 'string' && result.kind.trim() ? result.kind : 'table')
  const propsPayload =
    payloadRecord?.tool === 'display_panel' &&
    result &&
    typeof result.props === 'object' &&
    result.props !== null &&
    !Array.isArray(result.props)
      ? result.props
      : result
  const propsObj =
    result && typeof result.props === 'object' && result.props !== null && !Array.isArray(result.props)
      ? (result.props as Record<string, unknown>)
      : undefined
  const title =
    (typeof result?.title === 'string' && result.title.trim() ? result.title : '') ||
    (propsObj && typeof propsObj.title === 'string' ? propsObj.title : '') ||
    String(kind).replace(/_/g, ' ')
  const open = openPanel != null
  const payload =
    openPanel && payloadRecord?.ok === false
      ? null
      : openPanel
        ? (propsPayload ?? result ?? null)
        : null

  return (
    <SlideOutPanel
      open={open}
      onClose={onClose}
      panelKind={kind}
      payload={payload}
      title={title.trim() ? title : undefined}
    />
  )
}

export type OzMessageRole = 'user' | 'oz' | 'system'

/** What we know before handling the current user line (excludes the line being sent). */
export interface OzChatTurnContext {
  /** Prior user message texts, oldest first (current input not included). */
  priorUserMessages: string[]
  /** User + assistant lines with plain string bodies (thinking placeholders skipped). */
  priorExchanges: { role: 'user' | 'oz' | 'system'; text: string }[]
  /** Current-turn focused table rows (from composer); not in transcript until send. */
  tableContextAttachments?: TableRowContextAttachment[]
  /**
   * Transcript / RAG thread scope (e.g. rep pick). With {@link assistantMessageId}, keys panel
   * payloads from `display_table` / `display_panel` so scope switches cannot collide.
   */
  threadId?: string
  /** Assistant placeholder message id for this send; correlates streamed tool_result with panels. */
  assistantMessageId?: string
  /** Upload ids returned from `POST /api/oz/chat/uploads` when that route is deployed. */
  composerUploadIds?: string[]
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
  /** Files staged on this line from the composer upload strip. */
  fileAttachments?: { id: string; label: string }[]
  /** When true, show a badge that this assistant reply consumed composer uploads for this turn. */
  usedUploadedContext?: boolean
  /** Inline KB-promotion prompt under this assistant message (§12.1.3). */
  kbPromotion?: OzAssistantKbPromotion
}

/** Payload for the KB-promotion inline card (docs/code-sandbox-and-artifact-generation.md §12.1.3). */
export interface OzAssistantKbPromotion {
  items: { uploadId: string; fileLabel: string }[]
  trigger: 'explicit' | 'automatic'
}

export interface OzAssistantAction {
  id: string
  label: string
  variant?: OzActionVariant
  disabled?: boolean
  onClick?: () => void
}

/** Return shape from {@link OzAssistantPanelProps.onUserMessage} (unified chat may add sandbox flags). */
export type OzUserMessageResult = {
  reply: string
  delayMs?: number
  stream?: boolean
  ozSandboxToolsUnavailable?: string[]
  ozSandboxUnavailableReason?: 'runner_unreachable' | 'feature_disabled'
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
  ) => OzUserMessageResult | void | Promise<OzUserMessageResult | void>
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
  /** Rendered above the chat composer (e.g. Russin call DB scope). */
  composerAccessory?: ReactNode
  /**
   * When this value changes, the thread resets to the initial seed (e.g. welcome line only).
   * Use when switching contexts such as transcript/RAG user scope so prior messages are not reused.
   */
  transcriptResetKey?: string | number
  /**
   * Custom inline markdown renderer (e.g. Track C `[doc:…]` / `[[wiki:…]]` citation affordances).
   * When unset, chat uses the default bold/italic/link pass only.
   */
  renderAssistantInline?: AssistantMarkdownInlineRenderer
  /**
   * When set, forwarded as {@link OzChatTurnContext.threadId} so unified chat can key slide-out
   * panel payloads per transcript scope.
   */
  chatThreadId?: string
  /**
   * Show the attach-files strip under the composer and support optional `POST /api/oz/chat/uploads`.
   * When false, the panel behaves as before (no upload UI).
   */
  enableComposerUploads?: boolean
  /** Pin/unpin rows from Oz `display_table` slide-outs into the composer (sandbox/catalog/recs/calls chips). */
  onToggleComposerSandboxRow?: (attachment: TableRowContextAttachment) => void
  /**
   * KB-promotion consent until `viteKbIngestApi` wiring lands (`Oz-Demo-u4j`).
   * Stub with logging if unset.
   */
  onKbPromotionConsent?: (uploadId: string, consent: boolean) => void
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function replyReferencesUpload(reply: string, fileLabels: string[], uploadIds: string[]): boolean {
  const lower = reply.toLowerCase()
  for (const id of uploadIds) {
    const t = id.trim()
    if (t.length >= 6 && lower.includes(t.toLowerCase())) return true
  }
  for (const label of fileLabels) {
    const base = label.includes('/') ? label.slice(label.lastIndexOf('/') + 1) : label
    if (base.length >= 3 && lower.includes(base.toLowerCase())) return true
    const dot = base.lastIndexOf('.')
    const stem = dot > 0 ? base.slice(0, dot) : base
    if (stem.length >= 3 && lower.includes(stem.toLowerCase())) return true
  }
  return false
}

function buildKbPromotionPayload(args: {
  fileSnapshot: { file: File }[]
  composerUploadIds: string[] | undefined
  replyText: string
  explicitSaveToKb: boolean
  enableComposerUploads: boolean
}): OzAssistantKbPromotion | undefined {
  const { fileSnapshot, composerUploadIds, replyText, explicitSaveToKb, enableComposerUploads } = args
  if (!enableComposerUploads || !composerUploadIds?.length || !fileSnapshot.length) return undefined

  const items: { uploadId: string; fileLabel: string }[] = []
  for (let i = 0; i < composerUploadIds.length; i++) {
    const f = fileSnapshot[i]?.file
    const uploadId = composerUploadIds[i]
    if (!f || !uploadId?.trim() || !isKbPromotableFilename(f.name)) continue
    items.push({ uploadId: uploadId.trim(), fileLabel: f.name })
  }
  if (!items.length) return undefined

  const labels = fileSnapshot.map((x) => x.file.name)
  const referenced = replyReferencesUpload(replyText, labels, composerUploadIds)
  if (explicitSaveToKb) return { items, trigger: 'explicit' }
  if (referenced) return { items, trigger: 'automatic' }
  return undefined
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
      const fa = m.fileAttachments
      let withCtx = t
      if (fa?.length) {
        withCtx = `[Attached files: ${fa.map((f) => f.label).join(', ')}] ${withCtx}`.trim()
      }
      if (ra?.length) {
        withCtx = `[Context: ${ra.map((r) => r.label).join(', ')}] ${withCtx}`.trim()
      }
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
  return 'Alright. Tell me a bit more about the outcome you want, and I will answer in-thread—sorting, follow-ups, or the lead table, for example.'
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
  renderAssistantInline,
}: {
  text: string
  onComplete: () => void
  className?: string
  /** When set, one-shot render with no per-line delay (e.g. system prefers reduced motion). */
  reducedMotion?: boolean
  renderAssistantInline?: AssistantMarkdownInlineRenderer
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
        <SimpleAssistantMarkdown
          text={shown}
          streamMode
          renderInline={renderAssistantInline}
        />
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

function ComposerUploadStrip({
  entries,
  onRemove,
  onFilesChosen,
  onRequestSaveToKb,
  errorText,
  disabled,
}: {
  entries: { id: string; label: string }[]
  onRemove: (id: string) => void
  onFilesChosen: (files: File[]) => void
  /** Marks the next sent message as an explicit KB-promotion request (§12.1.3). */
  onRequestSaveToKb?: () => void
  errorText: string | null
  disabled: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const pick = () => {
    if (disabled) return
    inputRef.current?.click()
  }

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (list?.length) onFilesChosen(Array.from(list))
    e.target.value = ''
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (disabled) return
    if (e.dataTransfer.files?.length) onFilesChosen(Array.from(e.dataTransfer.files))
  }

  return (
    <div
      className={joinClasses(
        'flex min-h-0 flex-col gap-1 border-t border-zinc-200/60 bg-violet-50/25 px-2 py-1.5 pl-2.5',
        dragActive && 'bg-violet-100/40 ring-1 ring-inset ring-violet-300/50',
      )}
      onDragEnter={(e) => {
        e.preventDefault()
        if (!disabled) setDragActive(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        multiple
        accept=".csv,.json,.xlsx,.pdf,.txt,.png,.jpg,.jpeg"
        data-testid="oz-composer-upload-input"
        disabled={disabled}
        onChange={onInputChange}
      />
      <div className="flex min-h-[1.75rem] flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={pick}
          disabled={disabled}
          className={joinClasses(
            'inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors',
            disabled
              ? 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400'
              : 'border-violet-300/70 bg-white/90 text-violet-900 hover:border-violet-400 hover:bg-violet-50',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-500/50',
          )}
          aria-label="Attach files"
        >
          <PaperclipIcon className="h-3.5 w-3.5 shrink-0 opacity-90" />
          Attach
        </button>
        {entries.length > 0 && onRequestSaveToKb ? (
          <button
            type="button"
            onClick={() => onRequestSaveToKb()}
            disabled={disabled}
            className={joinClasses(
              'inline-flex shrink-0 items-center rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors',
              disabled
                ? 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400'
                : 'border-emerald-300/70 bg-white/90 text-emerald-900 hover:border-emerald-400 hover:bg-emerald-50',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500/50',
            )}
          >
            Save to KB
          </button>
        ) : null}
        {entries.map((e) => (
          <span key={e.id} className="inline-flex max-w-full min-w-0">
            <button
              type="button"
              onClick={() => onRemove(e.id)}
              disabled={disabled}
              className={joinClasses(
                'inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-md border border-violet-300/60 bg-white/90 px-1.5 py-0.5',
                'text-left font-mono text-[10px] font-semibold leading-tight text-violet-950',
                'shadow-sm transition-colors hover:border-violet-400/80 hover:bg-violet-50/95',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-500/50',
                disabled && 'opacity-50',
              )}
              title="Remove attachment"
            >
              <span className="min-w-0 truncate">{e.label}</span>
              <span className="shrink-0 text-zinc-400" aria-hidden>
                ×
              </span>
            </button>
          </span>
        ))}
        {entries.length === 0 ? (
          <span className="text-[11px] text-zinc-500">Drop files here or use Attach</span>
        ) : null}
      </div>
      {errorText ? (
        <p className="text-[11px] leading-snug text-red-600" role="alert">
          {errorText}
        </p>
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
  composerUploadStrip,
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
  contextRowTags?: { id: string; label: string; scope?: TableContextScope }[]
  onRemoveContextRowTag?: (rowId: string) => void
  composerUploadStrip?: ReactNode
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
                    'inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-md border px-1.5 py-0.5',
                    'text-left font-mono text-[10px] font-semibold leading-tight',
                    'shadow-sm transition-colors',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1',
                    composerChipToneClasses(tag.scope ?? 'lumberyard'),
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
        {composerUploadStrip}
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

function ThreadDirectionToolbar({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex w-full max-w-2xl shrink-0 items-center justify-end border-b border-zinc-200/80 bg-white/70 px-3 py-1.5 backdrop-blur-sm md:px-4">
      <button
        type="button"
        data-testid="oz-thread-direction-open"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-100"
      >
        <span>Direction</span>
        <kbd className="hidden rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline">
          ⌘K
        </kbd>
      </button>
    </div>
  )
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

function composerChipToneClasses(scope: TableContextScope): string {
  switch (scope) {
    case 'sandbox':
      return 'border-amber-300/60 bg-white/90 text-amber-950 hover:border-amber-400/80 hover:bg-amber-50/95 focus-visible:outline-amber-500/50'
    case 'lead':
      return 'border-emerald-300/60 bg-white/90 text-emerald-950 hover:border-emerald-400/80 hover:bg-emerald-50/95 focus-visible:outline-emerald-500/50'
    case 'competitor':
      return 'border-rose-300/60 bg-white/90 text-rose-950 hover:border-rose-400/80 hover:bg-rose-50/95 focus-visible:outline-rose-500/50'
    case 'lumberyard':
    default:
      return 'border-sky-300/60 bg-white/90 text-sky-900 hover:border-sky-400/80 hover:bg-sky-50/95 focus-visible:outline-sky-500/50'
  }
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
  composerAccessory,
  transcriptResetKey,
  renderAssistantInline,
  chatThreadId,
  enableComposerUploads = true,
  onToggleComposerSandboxRow,
  onKbPromotionConsent,
}: OzAssistantPanelProps) {
  const [transcript, setTranscript] = useState<OzAssistantMessage[]>(() =>
    buildInitialTranscript(seed, hideWelcome),
  )
  const [draft, setDraft] = useState('')
  const [composerFiles, setComposerFiles] = useState<{ id: string; file: File }[]>([])
  const [composerUploadError, setComposerUploadError] = useState<string | null>(null)
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
  const [directionModalOpen, setDirectionModalOpen] = useState(false)
  const autoDirOpenedForRef = useRef<string | null>(null)
  /** Next send will treat KB promotion as explicitly requested (Save to KB). */
  const explicitKbSaveNextTurnRef = useRef(false)

  const [sandboxRunnerUnreachableActive, setSandboxRunnerUnreachableActive] = useState(false)
  const [sandboxRunnerBannerDismissed, setSandboxRunnerBannerDismissed] = useState(false)

  const [panelShellOpen, setPanelShellOpen] = useState<OzChatPanelShellState['openPanel']>(null)

  const shellApi = useMemo(
    (): OzChatPanelShellState => ({
      threadId: chatThreadId ?? '',
      openPanel: panelShellOpen,
      togglePanel: (messageId, panelId, kind) => {
        setPanelShellOpen((prev) =>
          prev?.messageId === messageId && prev.panelId === panelId ? null : { messageId, panelId, kind },
        )
      },
      closePanel: () => setPanelShellOpen(null),
      pinDisplayTableRow: onToggleComposerSandboxRow,
    }),
    [chatThreadId, panelShellOpen, onToggleComposerSandboxRow],
  )

  const assistantInline = useMemo(
    () => createOzPanelAwareInlineRenderer(renderAssistantInline),
    [renderAssistantInline],
  )

  const seedSignature = assistantSeedSignature(seed)
  useEffect(() => {
    setTranscript(buildInitialTranscript(seed, hideWelcome))
    setDraft('')
    setHistoryCursor(null)
    setPendingId(null)
    setStreamingId(null)
    setComposerFiles([])
    setComposerUploadError(null)
    // `seed` omitted on purpose: `messages={[]}` from parents is a new `[]` each render, but
    // `seedSignature` is stable for the same content.
  }, [hideWelcome, seedSignature, transcriptResetKey])

  useEffect(() => {
    autoDirOpenedForRef.current = null
  }, [transcriptResetKey])

  useEffect(() => {
    setSandboxRunnerBannerDismissed(false)
    setSandboxRunnerUnreachableActive(false)
  }, [transcriptResetKey])

  useEffect(() => {
    if (!chatThreadId) return
    if (autoDirOpenedForRef.current === chatThreadId) return
    const onlyWelcome =
      transcript.length === 1 &&
      transcript[0]?.role === 'oz' &&
      transcript[0]?.id === 'oz-welcome'
    if (!onlyWelcome) return
    autoDirOpenedForRef.current = chatThreadId
    setDirectionModalOpen(true)
  }, [chatThreadId, transcript])

  useEffect(() => {
    if (!chatThreadId) return
    function onDirShortcut(ev: globalThis.KeyboardEvent) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault()
        setDirectionModalOpen(true)
      }
    }
    window.addEventListener('keydown', onDirShortcut)
    return () => window.removeEventListener('keydown', onDirShortcut)
  }, [chatThreadId])

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

  const addComposerFiles = useCallback(
    (picked: File[]) => {
      if (!enableComposerUploads || picked.length === 0) return
      const combined = [...composerFiles.map((c) => c.file), ...picked]
      const v = validateComposerUploadFiles(combined)
      if (!v.ok) {
        setComposerUploadError(v.detail)
        return
      }
      setComposerUploadError(null)
      setComposerFiles((prev) => [...prev, ...picked.map((file) => ({ id: makeId(), file }))])
    },
    [composerFiles, enableComposerUploads],
  )

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

      const fileSnapshot = enableComposerUploads ? [...composerFiles] : []
      if (fileSnapshot.length) {
        const v = validateComposerUploadFiles(fileSnapshot.map((x) => x.file))
        if (!v.ok) {
          setComposerUploadError(v.detail)
          return
        }
      }

      let composerUploadIds: string[] | undefined
      if (fileSnapshot.length) {
        const up = await postOzChatUploadsIfAvailable(fileSnapshot.map((x) => x.file))
        if (!up.ok) {
          if (up.reason !== 'unavailable') {
            setComposerUploadError(up.detail ?? 'Could not upload attachments.')
            return
          }
        } else if (up.uploadIds.length) {
          composerUploadIds = up.uploadIds
        }
      }

      const explicitKbSave = explicitKbSaveNextTurnRef.current
      explicitKbSaveNextTurnRef.current = false

      const att = composerContextAttachments
      const userMessage: OzAssistantMessage = {
        id: makeId(),
        role: 'user',
        content: value,
        rowAttachments: att?.map((a) => ({ id: a.key, label: a.label })),
        ...(fileSnapshot.length
          ? {
              fileAttachments: fileSnapshot.map((x) => ({ id: x.id, label: x.file.name })),
            }
          : {}),
      }
      const pendingKind: PendingKind = pendingAssistantPlaceholder?.(value) ?? 'thinking'
      const placeholder: OzAssistantMessage = {
        id: makeId(),
        role: 'oz',
        content: placeholderForPendingKind(pendingKind),
      }
      const markUploadedReply = fileSnapshot.length > 0
      const turnCtx: OzChatTurnContext = {
        ...transcriptToContext(transcript),
        tableContextAttachments: att?.length ? att : undefined,
        assistantMessageId: placeholder.id,
        ...(chatThreadId ? { threadId: chatThreadId } : {}),
        ...(composerUploadIds?.length ? { composerUploadIds } : {}),
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
      setComposerFiles([])
      setComposerUploadError(null)

      const t0 = Date.now()
      let fromParent: OzUserMessageResult | void
      try {
        fromParent = await Promise.resolve(onUserMessage?.(value, turnCtx))
      } catch {
        fromParent = {
          reply: 'I could not complete that just now. Try again in a moment.',
          delayMs: 0,
        }
      }
      if (fromParent && typeof fromParent === 'object') {
        const tools = fromParent.ozSandboxToolsUnavailable
        const r = fromParent.ozSandboxUnavailableReason
        const showRunnerBanner =
          Array.isArray(tools) && tools.includes('run_python') && r === 'runner_unreachable'
        if (showRunnerBanner) {
          setSandboxRunnerUnreachableActive(true)
        } else {
          setSandboxRunnerUnreachableActive(false)
          setSandboxRunnerBannerDismissed(false)
        }
      } else {
        setSandboxRunnerUnreachableActive(false)
        setSandboxRunnerBannerDismissed(false)
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
        const kbPromotion = buildKbPromotionPayload({
          fileSnapshot,
          composerUploadIds,
          replyText,
          explicitSaveToKb: explicitKbSave,
          enableComposerUploads,
        })
        setTranscript((t) =>
          t.map((entry) =>
            entry.id === placeholder.id
              ? {
                  ...entry,
                  content: replyText,
                  streamIn: doStream,
                  ...(instantOptOut ? { instantReply: true } : {}),
                  ...(markUploadedReply ? { usedUploadedContext: true } : {}),
                  ...(kbPromotion ? { kbPromotion } : {}),
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
      chatThreadId,
      composerContextAttachments,
      composerFiles,
      contextSummary,
      enableComposerUploads,
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

  const contextRowTags = composerContextAttachments?.map((a) => ({
    id: a.key,
    label: a.label,
    scope: a.scope,
  }))

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
      composerUploadStrip={
        enableComposerUploads ? (
          <ComposerUploadStrip
            entries={composerFiles.map((c) => ({ id: c.id, label: c.file.name }))}
            onRemove={(id) => {
              setComposerFiles((p) => p.filter((x) => x.id !== id))
              setComposerUploadError(null)
            }}
            onFilesChosen={addComposerFiles}
            onRequestSaveToKb={
              enableComposerUploads ? () => { explicitKbSaveNextTurnRef.current = true } : undefined
            }
            errorText={composerUploadError}
            disabled={isPending}
          />
        ) : undefined
      }
    />
  )

  const showSandboxRunnerBanner = sandboxRunnerUnreachableActive && !sandboxRunnerBannerDismissed
  const sandboxRunnerBanner =
    showSandboxRunnerBanner ? (
      <div
        role="status"
        className="flex shrink-0 items-start gap-2 border-b border-amber-200/90 bg-amber-50/95 px-3 py-2 text-sm leading-snug text-amber-950"
      >
        <span className="min-w-0 flex-1">
          Sandbox temporarily unavailable — typed exports still work.
        </span>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-amber-900/80 hover:bg-amber-200/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-500"
          aria-label="Dismiss sandbox notice"
          onClick={() => setSandboxRunnerBannerDismissed(true)}
        >
          <span aria-hidden>×</span>
        </button>
      </div>
    ) : null

  if (isCentered && !hasThread) {
    return (
      <>
        <OzChatPanelShellContext.Provider value={shellApi}>
          <aside
            className={joinClasses(
              'flex h-full min-h-0 w-full max-w-2xl flex-col justify-center bg-transparent',
              className,
            )}
            aria-label="Oz chat"
          >
            <h2 className="sr-only">Start a conversation with Oz</h2>
            {chatThreadId ? (
              <ThreadDirectionToolbar onOpen={() => setDirectionModalOpen(true)} />
            ) : null}
            {sandboxRunnerBanner}
            <div
              role="region"
              className="flex w-full flex-col items-center justify-center gap-2 px-2"
              aria-label="Oz conversation"
            >
              {composerAccessory ? (
                <div className="w-full max-w-md md:max-w-lg">{composerAccessory}</div>
              ) : null}
              {sharedComposer({
                size: 'hero',
                className: 'max-w-md md:max-w-lg',
                inputId: 'oz-chat-input-hero',
              })}
            </div>
            {chatThreadId ? (
              <OzThreadDirectionModal
                open={directionModalOpen}
                threadId={chatThreadId}
                onClose={() => setDirectionModalOpen(false)}
              />
            ) : null}
          </aside>
        </OzChatPanelShellContext.Provider>
        <OzSlideOutMount
          threadId={chatThreadId ?? ''}
          openPanel={panelShellOpen}
          onClose={() => setPanelShellOpen(null)}
        />
      </>
    )
  }

  return (
    <>
      <OzChatPanelShellContext.Provider value={shellApi}>
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
      {chatThreadId ? (
        <ThreadDirectionToolbar onOpen={() => setDirectionModalOpen(true)} />
      ) : null}
      {sandboxRunnerBanner}
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
                renderAssistantInline={assistantInline}
                onKbPromotionConsent={onKbPromotionConsent}
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
        <div className={joinClasses('flex flex-col gap-2', isCentered && 'mx-auto w-full max-w-2xl')}>
          {composerAccessory}
          {sharedComposer({
            size: 'compact',
            className: isCentered ? 'w-full' : 'w-full',
            inputId: 'oz-chat-input',
          })}
        </div>
      </div>
      {chatThreadId ? (
        <OzThreadDirectionModal
          open={directionModalOpen}
          threadId={chatThreadId}
          onClose={() => setDirectionModalOpen(false)}
        />
      ) : null}
        </aside>
      </OzChatPanelShellContext.Provider>
      <OzSlideOutMount
        threadId={chatThreadId ?? ''}
        openPanel={panelShellOpen}
        onClose={() => setPanelShellOpen(null)}
      />
    </>
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

function KbPromotionInlineCards({
  messageId,
  promotion,
  align,
  onKbPromotionConsent,
}: {
  messageId: string
  promotion: OzAssistantKbPromotion
  align: 'sides' | 'center'
  onKbPromotionConsent?: (uploadId: string, consent: boolean) => void
}) {
  const [hidden, setHidden] = useState(false)
  const centered = align === 'center'
  const headingId = `oz-kb-promo-heading-${messageId}`
  const multiple = promotion.items.length > 1
  const title = multiple
    ? 'Add these files to the knowledge base?'
    : 'Add this file to the knowledge base?'
  const body = multiple
    ? 'Future conversations in this workspace will be able to cite them. Indexing takes a few minutes. You can remove them later from the Knowledge Base page.'
    : 'Future conversations in this workspace will be able to cite it. Indexing takes a few minutes. You can remove it later from the Knowledge Base page.'

  const applyConsent = (consent: boolean) => {
    for (const it of promotion.items) {
      if (onKbPromotionConsent) onKbPromotionConsent(it.uploadId, consent)
      else console.info('[Oz KB promotion]', { uploadId: it.uploadId, consent, fileLabel: it.fileLabel })
    }
    setHidden(true)
  }

  if (hidden) return null

  return (
    <div
      className={joinClasses(
        'mt-2 flex w-full max-w-2xl',
        centered ? 'justify-center' : 'justify-start',
      )}
    >
      <section
        role="region"
        aria-labelledby={headingId}
        className="w-full max-w-2xl rounded-xl border border-violet-200/80 bg-violet-50/50 px-3 py-2.5 text-left shadow-sm"
        data-testid="oz-kb-promotion-card"
      >
        <h3 id={headingId} className="m-0 text-sm font-semibold text-zinc-900">
          {title}
        </h3>
        {!multiple && promotion.items[0] ? (
          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{promotion.items[0].fileLabel}</p>
        ) : null}
        {multiple ? (
          <ul className="mb-1.5 mt-1 list-inside list-disc text-xs text-zinc-600">
            {promotion.items.map((it) => (
              <li key={it.uploadId}>{it.fileLabel}</li>
            ))}
          </ul>
        ) : null}
        <p className="m-0 text-xs leading-relaxed text-zinc-600">{body}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center rounded-lg border border-violet-400/80 bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            onClick={() => applyConsent(true)}
          >
            Add to knowledge base
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500/50"
            onClick={() => applyConsent(false)}
          >
            Not now
          </button>
        </div>
      </section>
    </div>
  )
}

function ChatMessage({
  message,
  onStreamEnd,
  onKnowledgePreambleSequenceComplete,
  align = 'sides',
  reducedMotion = false,
  renderAssistantInline,
  onKbPromotionConsent,
}: {
  message: OzAssistantMessage
  onStreamEnd?: (id: string) => void
  /** Fires when the knowledge pill label + icon sequence has finished (used to show the right-hand table). */
  onKnowledgePreambleSequenceComplete?: () => void
  /** `center` — thread is one centered column; `sides` — user right, assistant left. */
  align?: 'sides' | 'center'
  reducedMotion?: boolean
  renderAssistantInline?: AssistantMarkdownInlineRenderer
  onKbPromotionConsent?: (uploadId: string, consent: boolean) => void
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

  const wrapOzAssistantMarkdown =
    !isUser && !isSystem && message.role === 'oz'
      ? (node: ReactNode) => (
          <OzChatPanelMessageContext.Provider value={{ messageId: message.id }}>{node}</OzChatPanelMessageContext.Provider>
        )
      : (node: ReactNode) => node

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
        {isUser && message.fileAttachments?.length
          ? ` · Attached files: ${message.fileAttachments.map((f) => f.label).join(', ')}`
          : null}
        {isUser && message.rowAttachments?.length
          ? ` · Context: ${message.rowAttachments.map((r) => r.label).join(', ')}`
          : null}
        {!isUser && !isSystem && message.usedUploadedContext ? ' · Used composer uploads in this reply' : null}
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
        <>
          {!isUser && !isSystem && message.usedUploadedContext ? (
            <div
              className={joinClasses(
                'flex w-full max-w-2xl',
                centered ? 'justify-center' : 'justify-start',
              )}
            >
              <span className="inline-flex items-center rounded-full border border-violet-200/90 bg-violet-50/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900 shadow-sm">
                Used in this reply
              </span>
            </div>
          ) : null}
          {wrapOzAssistantMarkdown(
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
                centered && 'text-left',
              )}
            >
              {isUser && message.rowAttachments?.length ? (
                <div className="mb-1.5 flex flex-wrap justify-end gap-1.5" aria-hidden>
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
              {isUser && message.fileAttachments?.length ? (
                <div className="mb-1.5 flex flex-wrap justify-end gap-1.5" aria-hidden>
                  {message.fileAttachments.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex max-w-full min-w-0 rounded-md border border-violet-300/55 bg-white/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-violet-950"
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
                    renderAssistantInline={renderAssistantInline}
                  />
                </span>
              ) : !isUser && !isSystem && typeof message.content === 'string' ? (
                <SimpleAssistantMarkdown text={body} renderInline={renderAssistantInline} />
              ) : (
                message.content
              )}
            </div>,
          )}
          {!isUser && !isSystem && message.kbPromotion ? (
            <KbPromotionInlineCards
              messageId={message.id}
              promotion={message.kbPromotion}
              align={align}
              onKbPromotionConsent={onKbPromotionConsent}
            />
          ) : null}
        </>
      )}
    </article>
  )
}
