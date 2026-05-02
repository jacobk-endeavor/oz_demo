import { useEffect, useId, useRef } from 'react'
import { resolveOzPanelComponent } from '../../features/oz/panelRegistry'
import { joinClasses } from './visualSystem'

export type SlideOutPanelProps = {
  open: boolean
  onClose: () => void
  /** Resolved `panel.kind` from `<panel kind="…"/>` / lookup oracle. */
  panelKind: string
  /** Structured payload passed through to the registered panel body (`OzPanelRendererProps.payload`). */
  payload: unknown
  /** Optional heading above the registered body. */
  title?: string
}

function focusableSelector(): string {
  return [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')
}

/**
 * Right-edge slide-out shell for model-callable panels. Inner body comes from
 * {@link resolveOzPanelComponent} (`frontend/src/features/oz/panelRegistry.ts`).
 */
export function SlideOutPanel({ open, onClose, panelKind, payload, title }: SlideOutPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const Body = resolveOzPanelComponent(panelKind)

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open || panelRef.current == null) return
    const root = panelRef.current
    const list = [...root.querySelectorAll<HTMLElement>(focusableSelector())]
    const first = list[0]
    const last = list[list.length - 1]
    first?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || list.length === 0) return
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        }
      } else if (document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    root.addEventListener('keydown', onKeyDown)
    return () => root.removeEventListener('keydown', onKeyDown)
  }, [open, panelKind, payload])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[210] flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 cursor-default bg-zinc-950/35 backdrop-blur-[2px] motion-reduce:backdrop-blur-none"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        data-testid="oz-slide-out-panel"
        tabIndex={-1}
        className={joinClasses(
          'relative z-10 flex h-full w-[min(100vw-1rem,28rem)] flex-col overflow-hidden border-l border-zinc-200 bg-white shadow-2xl',
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Panel</p>
            {title ? (
              <h2 id={titleId} className="mt-0.5 truncate text-sm font-semibold text-zinc-900">
                {title}
              </h2>
            ) : (
              <p id={titleId} className="mt-0.5 text-sm font-semibold capitalize text-zinc-900">
                {panelKind.replace(/_/g, ' ')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
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
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
          <Body payload={payload} />
        </div>
      </div>
    </div>
  )
}
