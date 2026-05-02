import { useEffect, useRef } from 'react'
import { resolveOzPanelComponent } from '../../features/oz/panelRegistry'
import { joinClasses } from './visualSystem'
import { useOzSlideOutMobileSheetLayout } from './useOzSlideOutMobileSheetLayout'

function collectFocusables(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  return [...nodes].filter((el) => !el.closest('[inert]'))
}

export type SlideOutPanelProps = {
  open: boolean
  onClose: () => void
  /** `display_panel` / `<panel kind="…"/>` discriminator; drives {@link resolveOzPanelComponent}. */
  panelKind: string
  payload: unknown
}

/**
 * Right-edge drawer (&lt;768px: bottom sheet) hosting registered panel bodies from {@link resolveOzPanelComponent}.
 * Focus trap + Escape match {@link Modal} behavior.
 */
export function SlideOutPanel({ open, onClose, panelKind, payload }: SlideOutPanelProps) {
  const reducedTrapScopeRef = useRef<HTMLDivElement>(null)
  const isMobileSheet = useOzSlideOutMobileSheetLayout()

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const root = reducedTrapScopeRef.current
    if (!root) return
    const focusables = collectFocusables(root)
    const preferred = focusables[0]
    preferred?.focus()

    function onKeyDownTab(event: KeyboardEvent) {
      if (event.key !== 'Tab' || event.defaultPrevented) return
      const panel = reducedTrapScopeRef.current
      if (!panel) return
      const list = collectFocusables(panel)
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    root.addEventListener('keydown', onKeyDownTab as EventListener)
    return () => root.removeEventListener('keydown', onKeyDownTab as EventListener)
  }, [open, panelKind])

  if (!open) return null

  const Body = resolveOzPanelComponent(panelKind)

  const variant = isMobileSheet ? 'sheet' : 'drawer'

  return (
    <div
      className={joinClasses(
        'fixed inset-0 z-50 flex',
        isMobileSheet ? 'flex-col justify-end' : 'justify-end',
      )}
      data-oz-slideout-root
      data-oz-slideout-variant={variant}
    >
      <button
        type="button"
        aria-label="Close panel backdrop"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-zinc-900/35 backdrop-blur-[1px]"
      />
      <div
        ref={reducedTrapScopeRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Oz panel: ${panelKind}`}
        className={joinClasses(
          'relative z-10 flex max-h-full min-h-0 flex-col overflow-hidden border-zinc-200 bg-white shadow-2xl',
          isMobileSheet
            ? 'mt-auto max-h-[min(88vh,920px)] w-full rounded-t-2xl border-x border-t'
            : 'h-full w-[min(100vw-12px,440px)] border-l',
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50/95 px-4 py-3">
          <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Panel
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
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
              aria-hidden="true"
            >
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
          <Body payload={payload} />
        </div>
      </div>
    </div>
  )
}
