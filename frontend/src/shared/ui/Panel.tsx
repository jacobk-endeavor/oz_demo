import type { ReactNode } from 'react'
import { joinClasses } from './visualSystem'

interface PanelProps {
  /** Optional small label above the title. */
  eyebrow?: ReactNode
  /** Main panel title. */
  title?: ReactNode
  /** Description rendered just below the title. */
  description?: ReactNode
  /** Right-side header content (status pill, button, etc.). */
  action?: ReactNode
  children?: ReactNode
  className?: string
  /** Strip the inner padding when the body controls its own layout. */
  bodyClassName?: string
}

export function Panel({
  eyebrow,
  title,
  description,
  action,
  children,
  className = '',
  bodyClassName = 'p-5',
}: PanelProps) {
  const hasHeader =
    eyebrow !== undefined || title !== undefined || action !== undefined || description !== undefined

  return (
    <section
      className={joinClasses(
        'rounded-2xl border border-zinc-200 bg-white shadow-sm',
        className,
      )}
    >
      {hasHeader && (
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            {eyebrow !== undefined && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {eyebrow}
              </p>
            )}
            {title !== undefined && (
              <h2 className="mt-1 text-base font-semibold text-zinc-900">{title}</h2>
            )}
            {description !== undefined && (
              <p className="mt-1 text-sm text-zinc-600">{description}</p>
            )}
          </div>
          {action !== undefined && (
            <div className="flex shrink-0 items-center gap-2">{action}</div>
          )}
        </header>
      )}
      {children !== undefined && children !== null && (
        <div className={bodyClassName}>{children}</div>
      )}
    </section>
  )
}
