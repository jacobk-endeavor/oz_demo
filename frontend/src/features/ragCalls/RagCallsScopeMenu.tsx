import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { joinClasses } from '../../shared/ui/visualSystem'
import {
  RAG_CALLS_SCOPE_OPTIONS,
  type RagCallsScope,
} from './ragCallsClient'

function labelFor(scope: RagCallsScope): string {
  return scope === 'admin' ? 'Admin' : scope
}

const MENU_EDGE_GAP_PX = 6

export function RagCallsScopeMenu({
  value,
  disabled,
  onPick,
  rootClassName,
  triggerLabel,
}: {
  value: RagCallsScope
  disabled: boolean
  onPick: (scope: RagCallsScope) => void
  /** Default `flex-1` (sidebar). Use e.g. `inline-flex shrink-0` in Settings. */
  rootClassName?: string
  /** When set, shown on the trigger instead of the scope display name (e.g. account email). */
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const [menuPos, setMenuPos] = useState<{ bottom: number; left: number; minWidth: number }>({
    bottom: 0,
    left: 0,
    minWidth: 160,
  })

  const otherOptions = RAG_CALLS_SCOPE_OPTIONS.filter((opt) => opt !== value)

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return
    function place() {
      const el = rootRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const h = typeof window !== 'undefined' ? window.innerHeight : 0
      // Open above the trigger (`bottom` is distance from viewport bottom to menu bottom).
      setMenuPos({
        bottom: h - r.top + MENU_EDGE_GAP_PX,
        left: r.left,
        minWidth: Math.max(r.width, 160),
      })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onScroll() {
      setOpen(false)
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open])

  const menu =
    open && otherOptions.length > 0 ? (
      <ul
        ref={menuRef}
        role="listbox"
        aria-label="Choose transcript scope"
        style={{
          position: 'fixed',
          bottom: menuPos.bottom,
          left: menuPos.left,
          minWidth: menuPos.minWidth,
        }}
        className="z-[400] m-0 list-none rounded-lg border border-zinc-200 bg-white p-0 py-1 shadow-xl ring-1 ring-black/5"
      >
        {otherOptions.map((opt) => (
          <li key={opt} role="presentation">
            <button
              type="button"
              role="option"
              className={joinClasses(
                'w-full px-3 py-2 text-left text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50',
              )}
              onClick={() => {
                setOpen(false)
                onPick(opt)
              }}
            >
              {labelFor(opt)}
            </button>
          </li>
        ))}
      </ul>
    ) : null

  return (
    <div ref={rootRef} className={joinClasses('relative min-w-0', rootClassName ?? 'flex-1')}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Transcript scope: ${triggerLabel ?? labelFor(value)}. Click to choose another.`}
        onClick={() => {
          if (disabled) return
          setOpen((o) => !o)
        }}
        className={joinClasses(
          'rounded-md px-1.5 py-1 text-left text-sm font-medium whitespace-nowrap text-zinc-600',
          'transition-colors hover:bg-zinc-200/50 hover:text-zinc-900',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
          disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent hover:text-zinc-600',
        )}
      >
        {triggerLabel ?? labelFor(value)}
      </button>
      {typeof document !== 'undefined' && menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
