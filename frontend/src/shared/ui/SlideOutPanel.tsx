import { useEffect, type ReactNode } from 'react'
import { joinClasses } from './visualSystem'

export type SlideOutPanelProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  /** Optional test id for the body region. */
  bodyTestId?: string
}

/**
 * Right-edge overlay for Oz chat panels; on narrow viewports acts as a bottom sheet.
 */
export function SlideOutPanel({ open, onClose, title, children, bodyTestId }: SlideOutPanelProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-stretch justify-end md:flex-row md:justify-end"
      aria-hidden={false}
    >
      <button
        type="button"
        aria-label="Dismiss panel"
        className="absolute inset-0 bg-zinc-900/35 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="oz-slide-out-title"
        className={joinClasses(
          'relative z-10 flex max-h-[min(520px,85vh)] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-200/90 bg-white shadow-2xl',
          'md:h-full md:max-h-none md:w-[min(440px,calc(100vw-32px))] md:rounded-none md:rounded-l-2xl md:border-r-0 md:border-l md:shadow-xl',
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200/90 px-4 py-3">
          <h2 id="oz-slide-out-title" className="min-w-0 text-sm font-semibold text-zinc-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="shrink-0 rounded-md p-1.5 text-base leading-none text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-3" data-testid={bodyTestId}>
          {children}
        </div>
      </div>
    </div>
  )
}
