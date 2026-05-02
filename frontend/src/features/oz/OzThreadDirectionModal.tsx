import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { sanitizeThreadDirectionPut } from '../../../../backend/oz/threadDirectionNormalize'
import { joinClasses } from '../../shared/ui/visualSystem'
import { fetchThreadDirection, putThreadDirection, type OzThreadDirectionRow } from './threadDirectionApi'

export type OzThreadDirectionModalProps = {
  open: boolean
  threadId: string
  onClose: () => void
  /** Called after a successful PUT */
  onSaved?: (row: OzThreadDirectionRow) => void
}

const TOKEN_CAP = 800
/** Rough tokenizer for UI warning (aligned with server-side cap messaging). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function structuredRefsFromRow(row: OzThreadDirectionRow | null): Record<string, string> {
  const raw = row?.structured_refs
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { bd_issue: '', acceptance_criteria: '', wiki_url: '', upload_id: '' }
  }
  const o = raw as Record<string, unknown>
  return {
    bd_issue: typeof o.bd_issue === 'string' ? o.bd_issue : '',
    acceptance_criteria: typeof o.acceptance_criteria === 'string' ? o.acceptance_criteria : '',
    wiki_url: typeof o.wiki_url === 'string' ? o.wiki_url : '',
    upload_id: typeof o.upload_id === 'string' ? o.upload_id : '',
  }
}

function buildStructuredRefsPayload(parts: Record<string, string>): unknown {
  const out: Record<string, string> = {}
  const k = ['bd_issue', 'acceptance_criteria', 'wiki_url', 'upload_id'] as const
  for (const key of k) {
    const v = parts[key]?.trim()
    if (v) out[key] = v
  }
  return Object.keys(out).length ? out : []
}

const QUICK_DIRECTIONS = [
  'Prioritize shipping dates and delivery logistics for the active RFQs in this thread.',
  'Research competitor pricing on the products we discussed and summarize gaps vs our line card.',
  'Draft a concise customer follow-up email that matches the tone of our last exchange.',
] as const

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function OzThreadDirectionModal({ open, threadId, onClose, onSaved }: OzThreadDirectionModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const lastFocusRef = useRef<HTMLElement | null>(null)

  const [directionText, setDirectionText] = useState('')
  const [structuredParts, setStructuredParts] = useState(() =>
    structuredRefsFromRow(null),
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !threadId) return
    let cancelled = false
    setLoadError(null)
    setSaveError(null)
    setLoading(true)
    ;(async () => {
      try {
        const row = await fetchThreadDirection(threadId)
        if (cancelled) return
        setDirectionText(row?.direction_text ?? '')
        setStructuredParts(structuredRefsFromRow(row))
      } catch (e) {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : String(e))
        setDirectionText('')
        setStructuredParts(structuredRefsFromRow(null))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, threadId])

  useLayoutEffect(() => {
    if (!open) return
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      lastFocusRef.current?.focus?.({ preventScroll: true })
      lastFocusRef.current = null
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function focusables(): HTMLElement[] {
      const el = panelRef.current
      if (!el) return []
      return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    }

    const firstFocus = () => {
      const els = focusables()
      const preferred = els.find((el) => el.tagName === 'TEXTAREA') ?? els[0]
      preferred?.focus({ preventScroll: true })
    }

    const id = window.requestAnimationFrame(() => firstFocus())

    function onKeyDownCapture(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Tab') return
      const els = focusables()
      if (els.length === 0) return
      const first = els[0]!
      const last = els[els.length - 1]!
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    const trapRoot = panelRef.current
    if (!trapRoot) return

    trapRoot.addEventListener('keydown', onKeyDownCapture, true)
    return () => {
      cancelAnimationFrame(id)
      trapRoot.removeEventListener('keydown', onKeyDownCapture, true)
    }
  }, [open, loading])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const tokenEstimate = estimateTokens(directionText.trim())
  const overTokenGuide = tokenEstimate > TOKEN_CAP

  const onConfirm = useCallback(async () => {
    setSaveError(null)
    const sanitized = sanitizeThreadDirectionPut({
      direction_text: directionText,
      structured_refs: buildStructuredRefsPayload(structuredParts),
      set_by: 'oz-chat-ui',
    })
    setSaving(true)
    try {
      const row = await putThreadDirection(threadId, {
        direction_text: sanitized.direction_text,
        structured_refs: sanitized.structured_refs,
        set_by: sanitized.set_by,
      })
      onSaved?.(row)
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }, [directionText, onClose, onSaved, structuredParts, threadId])

  function handlePanelKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && e.target instanceof HTMLTextAreaElement) {
      const ta = e.target
      if (ta.getAttribute('data-direction-primary') === 'true') {
        e.preventDefault()
        void onConfirm()
      }
    }
  }

  const emptyQuickPicks = directionText.trim().length === 0

  if (!open) return null

  const body = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="oz-thread-direction-modal"
      onKeyDown={handlePanelKeyDown}
      className={joinClasses(
        'relative z-10 flex max-h-[min(92vh,900px)] w-full flex-col overflow-hidden border-zinc-200 bg-white shadow-xl',
        'max-md:fixed max-md:inset-0 max-md:max-h-none max-md:rounded-none max-md:border-0',
        'md:max-h-[85vh] md:max-w-lg md:rounded-2xl md:border',
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 md:px-5 md:py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-zinc-900">
            Task direction
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Tell Oz what you want out of this thread. Saved per transcript scope and injected into the system prompt
            (server-enforced cap).
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 20 20"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <line x1="5" y1="5" x2="15" y2="15" />
            <line x1="15" y1="5" x2="5" y2="15" />
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-5 md:py-4">
        {loadError ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            {loadError}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading saved direction…</p>
        ) : (
          <>
            {emptyQuickPicks ? (
              <div className="mb-4 rounded-xl border border-zinc-200/90 bg-zinc-50/80 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Quick starts
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {QUICK_DIRECTIONS.map((text) => (
                    <button
                      key={text}
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-800 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                      onClick={() => setDirectionText(text)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Direction (free text)
              </span>
              <textarea
                data-direction-primary="true"
                value={directionText}
                onChange={(e) => setDirectionText(e.target.value)}
                rows={5}
                disabled={loading}
                placeholder="What should Oz optimize for in this thread?"
                className="mt-1.5 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
              />
            </label>

            <p
              className={joinClasses(
                'mt-1 text-xs',
                overTokenGuide ? 'font-medium text-amber-800' : 'text-zinc-500',
              )}
            >
              ~{Math.min(tokenEstimate, 9999)} / {TOKEN_CAP} tokens (estimate).{' '}
              {overTokenGuide
                ? 'Content beyond the cap will be truncated server-side.'
                : null}
            </p>

            <div className="mt-4 grid gap-3 border-t border-zinc-100 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Structured refs (optional)
              </p>
              <label className="block text-sm">
                <span className="text-zinc-600">Beads issue id</span>
                <input
                  type="text"
                  value={structuredParts.bd_issue}
                  onChange={(e) => setStructuredParts((p) => ({ ...p, bd_issue: e.target.value }))}
                  placeholder="e.g. Oz-Demo-i4c"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600">Acceptance criteria (paste)</span>
                <textarea
                  value={structuredParts.acceptance_criteria}
                  onChange={(e) =>
                    setStructuredParts((p) => ({ ...p, acceptance_criteria: e.target.value }))
                  }
                  rows={2}
                  placeholder="Bullets or checklist…"
                  className="mt-1 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600">Notion / wiki URL</span>
                <input
                  type="url"
                  value={structuredParts.wiki_url}
                  onChange={(e) => setStructuredParts((p) => ({ ...p, wiki_url: e.target.value }))}
                  placeholder="https://…"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600">Upload id (cross-reference)</span>
                <input
                  type="text"
                  value={structuredParts.upload_id}
                  onChange={(e) => setStructuredParts((p) => ({ ...p, upload_id: e.target.value }))}
                  placeholder="Artifact or upload id"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                />
              </label>
            </div>

            {saveError ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
                {saveError}
              </p>
            ) : null}
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3 md:px-5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200/80"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void onConfirm()}
          className={joinClasses(
            'rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors',
            saving || loading ? 'cursor-not-allowed bg-zinc-400' : 'bg-zinc-900 hover:bg-zinc-800',
          )}
        >
          {saving ? 'Saving…' : 'Save direction'}
        </button>
      </footer>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center md:px-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default bg-zinc-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {body}
    </div>
  )
}
