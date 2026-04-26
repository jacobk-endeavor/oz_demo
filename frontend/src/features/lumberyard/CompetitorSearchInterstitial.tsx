import { useEffect, useState } from 'react'
import { CloseIcon, SearchIcon } from '../../shared/ui/icons'
import { joinClasses } from '../../shared/ui'

const STEPS = [
  'Reaching out to public retailer catalog pages',
  'Matching product names from the top five activity rows',
  'Pulling list prices where available (demo or web-backed)',
] as const

export function CompetitorSearchInterstitial({
  rowLineHints,
  onBackToActivity,
  onClose,
}: {
  /** Short lines from the activity grid (e.g. call titles) to make the search feel specific. */
  rowLineHints: string[]
  onBackToActivity: () => void
  onClose?: () => void
}) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const id = window.setInterval(() => {
      setStepIndex((i) => (i + 1) % STEPS.length)
    }, 1_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div
      className="group/table flex h-full min-h-0 w-full min-w-0 flex-col bg-white text-zinc-900 antialiased"
      data-testid="competitor-search-interstitial"
    >
      <div className="shrink-0 border-b border-zinc-200/90 bg-zinc-50/95 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-bold tracking-tight text-zinc-900">Competitor product search</h2>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onBackToActivity}
              className="inline-flex h-8 items-center rounded-lg border border-zinc-200/90 bg-white px-2.5 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              Back to activity
            </button>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200/90 bg-white/95 text-zinc-500 shadow-sm hover:bg-zinc-50/90 hover:text-zinc-800"
                aria-label="Close"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative h-20 w-20">
            <div className="pulse-orb absolute left-0 top-0 h-20 w-20">
              <div className="pulse-orb__core h-8 w-8 rounded-full" />
              <div className="pulse-orb__ring h-20 w-20" />
            </div>
            <div className="absolute inset-0 z-20 flex items-center justify-center text-white">
              <SearchIcon className="h-4 w-4" />
            </div>
          </div>
          <div>
            <p className="text-base font-semibold text-zinc-900">Searching the web</p>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-500">
              We’re looking up public retailer and marketplace results that match your top activity lines.
            </p>
            {rowLineHints.length > 0 ? (
              <p className="mt-3 line-clamp-2 text-xs text-zinc-400" title={rowLineHints.join(' · ')}>
                From activity: {rowLineHints.slice(0, 3).join(' · ')}
                {rowLineHints.length > 3 ? '…' : ''}
              </p>
            ) : null}
          </div>
        </div>

        <ul className="w-full max-w-md space-y-2 text-left">
          {STEPS.map((line, i) => (
            <li
              key={line}
              className={joinClasses(
                'flex items-center gap-2.5 rounded-lg border border-zinc-200/80 px-3 py-2.5 text-xs transition-colors duration-500',
                i === stepIndex ? 'border-sky-200/90 bg-sky-50/80 text-sky-950' : 'bg-zinc-50/50 text-zinc-500',
              )}
            >
              <span
                className={joinClasses(
                  'inline-flex h-1.5 w-1.5 shrink-0 rounded-full',
                  i === stepIndex ? 'animate-pulse bg-sky-500' : 'bg-zinc-300',
                )}
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <p className="text-center text-xs text-zinc-400">
          <span className="inline-flex items-center gap-0.5">
            <span className="cursor-chat-dot" />
            <span className="cursor-chat-dot" />
            <span className="cursor-chat-dot" />
          </span>
          <span className="ml-1.5">Querying the internet for competitor listings and prices</span>
        </p>
      </div>
    </div>
  )
}
