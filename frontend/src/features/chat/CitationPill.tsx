import { useRef, useState } from 'react'
import type { Citation } from './types'

interface CitationPillProps {
  citation: Citation
  onClick?: (citation: Citation) => void
}

const LAYER_COLOR: Record<number, string> = {
  1: 'bg-blue-100 text-blue-900',
  2: 'bg-blue-50 text-blue-800',
  3: 'bg-sky-50 text-sky-800',
  4: 'bg-zinc-100 text-zinc-700',
}

const LAYER_LABEL: Record<number, string> = {
  1: 'L1 · category',
  2: 'L2 · topical',
  3: 'L3 · family',
  4: 'L4 · observation',
}

export function CitationPill({ citation, onClick }: CitationPillProps) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)

  // Small open-delay so sweeping the cursor across a row of pills
  // doesn't flash cards.  Close has a longer delay so the user can
  // move cursor from pill into the card itself.
  function openSoon() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpen(true)
  }
  function closeSoon() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
    }
    closeTimer.current = window.setTimeout(() => {
      setOpen(false)
      closeTimer.current = null
    }, 180)
  }

  const badgeColor =
    citation.kind === 'obs'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-emerald-100 text-emerald-800'

  const layerClass = LAYER_COLOR[citation.layer] ?? 'bg-zinc-100 text-zinc-700'
  const layerLabel = LAYER_LABEL[citation.layer] ?? `L${citation.layer}`

  return (
    <span
      className="relative inline-block"
      onMouseEnter={openSoon}
      onMouseLeave={closeSoon}
      onFocus={openSoon}
      onBlur={closeSoon}
    >
      <button
        type="button"
        onClick={() => onClick?.(citation)}
        className={[
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5',
          'text-[13px] font-medium border border-zinc-200 bg-zinc-50',
          'hover:bg-zinc-100 transition-colors cursor-pointer',
        ].join(' ')}
      >
        <span
          className={[
            'inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold uppercase',
            badgeColor,
          ].join(' ')}
        >
          {citation.kind}
        </span>
        <span className="text-zinc-700">{citation.id}</span>
      </button>

      {open && (
        <div
          role="tooltip"
          onMouseEnter={openSoon}
          onMouseLeave={closeSoon}
          className={[
            'absolute z-50 left-0 bottom-full mb-2',
            'w-80 max-w-[min(22rem,calc(100vw-2rem))]',
            'rounded-lg border border-zinc-200 bg-white p-3 shadow-xl shadow-black/10',
            'text-left',
          ].join(' ')}
        >
          {/* Header: id + badges */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">
              {citation.id}
            </span>
            <span
              className={[
                'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                badgeColor,
              ].join(' ')}
            >
              {citation.kind}
            </span>
            <span
              className={[
                'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
                layerClass,
              ].join(' ')}
            >
              {layerLabel}
            </span>
            <span className="text-[10px] text-zinc-400">{citation.category}</span>
          </div>

          {/* Statement */}
          <p className="text-[13px] leading-relaxed text-zinc-800">
            {citation.statement}
          </p>

          {/* Source footer */}
          {citation.doc_slug ? (
            <div className="mt-2 border-t border-zinc-100 pt-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                Source
              </span>
              <p className="mt-0.5 font-mono text-[11px] text-zinc-600">
                {citation.doc_slug}
              </p>
            </div>
          ) : null}

          {/* Wikilink (mono, subtle) */}
          <div className="mt-2 truncate font-mono text-[10px] text-zinc-400">
            {citation.wikilink}
          </div>
        </div>
      )}
    </span>
  )
}
