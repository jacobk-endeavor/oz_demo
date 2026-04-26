import { useCallback, useRef, useState } from 'react'
import { joinClasses } from '../../shared/ui'

interface NebulaHubPageProps {
  onNavigate: (page: string) => void
}

type StarKind = 'bowl' | 'handle' | 'polaris' | 'command'

type ConstellationStar = {
  id: string
  label: string
  x: number
  y: number
  kind: StarKind
  /** Tailwind background + ring/shadow (star body) */
  accent: string
}

/**
 * Big Dipper–inspired default layout (viewBox ≈ 0–200 × 0–100).
 * Positions are draggable; saved in localStorage under {@link NEBULA_POSITIONS_KEY}.
 */
const STARS: ConstellationStar[] = [
  { id: 'oz', label: 'Oz', x: 78, y: 9, kind: 'command', accent: 'bg-sky-300' },
  { id: 'knowledge-base', label: 'Knowledge base', x: 36, y: 32, kind: 'handle', accent: 'bg-cyan-300' },
  { id: 'field-app', label: 'Field App', x: 50, y: 44, kind: 'polaris', accent: 'bg-amber-200' },
  { id: 'field-notes', label: 'Field notes', x: 58, y: 54, kind: 'bowl', accent: 'bg-emerald-300' },
  { id: 'quotes-ready', label: 'Voice Quote Automation', x: 118, y: 50, kind: 'bowl', accent: 'bg-rose-300' },
  { id: 'dashboards', label: 'Dashboards', x: 124, y: 80, kind: 'bowl', accent: 'bg-sky-300' },
  { id: 'background-agents', label: 'Background agents', x: 52, y: 84, kind: 'bowl', accent: 'bg-violet-300' },
]

const NEBULA_POSITIONS_KEY = 'nebula-constellation-positions-v1'

const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = Object.fromEntries(
  STARS.map((s) => [s.id, { x: s.x, y: s.y }]),
) as Record<string, { x: number; y: number }>

function readStoredPositions(): Record<string, { x: number; y: number }> {
  if (typeof window === 'undefined') return { ...DEFAULT_POSITIONS }
  try {
    const raw = window.localStorage.getItem(NEBULA_POSITIONS_KEY)
    if (raw == null) return { ...DEFAULT_POSITIONS }
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed == null) return { ...DEFAULT_POSITIONS }
    const out = { ...DEFAULT_POSITIONS }
    for (const s of STARS) {
      const p = (parsed as Record<string, unknown>)[s.id]
      if (p == null || typeof p !== 'object') continue
      const ox = (p as { x?: unknown }).x
      const oy = (p as { y?: unknown }).y
      if (typeof ox === 'number' && Number.isFinite(ox) && typeof oy === 'number' && Number.isFinite(oy)) {
        out[s.id] = { x: clamp(ox, 0, 200), y: clamp(oy, 0, 100) }
      }
    }
    return out
  } catch {
    return { ...DEFAULT_POSITIONS }
  }
}

function writeStoredPositions(p: Record<string, { x: number; y: number }>) {
  try {
    window.localStorage.setItem(NEBULA_POSITIONS_KEY, JSON.stringify(p))
  } catch {
    // ignore
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

/** Line segments for the dipper + handle chain. */
const LINE_FROM_TO: [string, string][] = [
  ['oz', 'knowledge-base'],
  ['knowledge-base', 'field-app'],
  ['field-app', 'field-notes'],
  ['field-notes', 'quotes-ready'],
  ['quotes-ready', 'dashboards'],
  ['dashboards', 'background-agents'],
  ['background-agents', 'field-notes'],
]

function hashHref(id: string) {
  return `#/${id}`
}

export function NebulaHubPage({ onNavigate }: NebulaHubPageProps) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => readStoredPositions())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    id: string
    offX: number
    offY: number
    pointerId: number
  } | null>(null)

  const byId = Object.fromEntries(STARS.map((s) => [s.id, s])) as Record<string, ConstellationStar>

  const viewBoxFromClient = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current
    if (el == null) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return { x: 0, y: 0 }
    const x = ((clientX - r.left) / r.width) * 200
    const y = ((clientY - r.top) / r.height) * 100
    return { x: clamp(x, 0, 200), y: clamp(y, 0, 100) }
  }, [])

  const onStarPointerDown = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      const pos = positions[id] ?? DEFAULT_POSITIONS[id]!
      const v = viewBoxFromClient(e.clientX, e.clientY)
      dragRef.current = {
        id,
        offX: v.x - pos.x,
        offY: v.y - pos.y,
        pointerId: e.pointerId,
      }
      setDraggingId(id)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [positions, viewBoxFromClient],
  )

  const onStarPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current
      if (d == null || e.pointerId !== d.pointerId) return
      const v = viewBoxFromClient(e.clientX, e.clientY)
      const x = clamp(v.x - d.offX, 0, 200)
      const y = clamp(v.y - d.offY, 0, 100)
      setPositions((prev) => ({ ...prev, [d.id]: { x, y } }))
    },
    [viewBoxFromClient],
  )

  const endDrag = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current
    if (d == null || e.pointerId !== d.pointerId) return
    dragRef.current = null
    setDraggingId(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    setPositions((p) => {
      writeStoredPositions(p)
      return p
    })
  }, [])

  return (
    <div
      className="mx-auto flex min-h-0 w-full max-w-4xl flex-col px-2 py-6 sm:px-4"
      data-testid="nebula-hub-page"
    >
      <div
        ref={containerRef}
        className="relative aspect-[2/1] w-full min-h-[200px] touch-none overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-950 ring-1 ring-zinc-800/60 sm:min-h-[260px]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(30,58,138,0.15),transparent_50%),radial-gradient(ellipse_at_80%_100%,rgba(88,28,135,0.12),transparent_45%)]" />
        <svg
          className="pointer-events-none relative z-0 h-full w-full"
          viewBox="0 0 200 100"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          {LINE_FROM_TO.map(([a, b], i) => {
            const A = byId[a]
            const B = byId[b]
            if (A == null || B == null) return null
            const pa = positions[a] ?? DEFAULT_POSITIONS[a]!
            const pb = positions[b] ?? DEFAULT_POSITIONS[b]!
            return (
              <line
                key={`${a}-${b}-${i}`}
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                className="stroke-zinc-500/35"
                strokeWidth="0.35"
                strokeLinecap="round"
              />
            )
          })}
        </svg>

        <div className="pointer-events-auto absolute inset-0 z-10">
          <ul className="absolute inset-0 m-0 list-none p-0" role="list" aria-label="Workflow constellation">
            {STARS.map((s) => {
              const p = positions[s.id] ?? DEFAULT_POSITIONS[s.id]!
              const sizePctX = (p.x / 200) * 100
              const sizePctY = (p.y / 100) * 100
              const isPolaris = s.kind === 'polaris'
              const isCommand = s.kind === 'command'
              const isDragging = draggingId === s.id
              return (
                <li
                  key={s.id}
                  className="absolute m-0 -translate-x-1/2 -translate-y-1/2 p-0"
                  style={{ left: `${sizePctX}%`, top: `${sizePctY}%` }}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <button
                      type="button"
                      tabIndex={0}
                      aria-label={`Drag to move ${s.label}`}
                      onPointerDown={(e) => onStarPointerDown(s.id, e)}
                      onPointerMove={onStarPointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className={joinClasses(
                        'rounded-full p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400',
                        isDragging ? 'cursor-grabbing' : 'cursor-grab',
                      )}
                    >
                      <span
                        className={joinClasses(
                          'block rounded-full shadow-md ring-2 ring-white/40 transition group-hover:scale-110',
                          isDragging && 'scale-110 ring-white/80',
                          isPolaris
                            ? 'h-3.5 w-3.5 shadow-[0_0_16px_rgba(252,211,77,0.85)] sm:h-4 sm:w-4'
                            : isCommand
                              ? 'h-3 w-3 shadow-[0_0_12px_rgba(56,189,248,0.65)] sm:h-3.5 sm:w-3.5'
                              : 'h-2.5 w-2.5 shadow-[0_0_10px_rgba(255,255,255,0.35)] sm:h-3 sm:w-3',
                          s.accent,
                        )}
                      />
                    </button>
                    <a
                      href={hashHref(s.id)}
                      onClick={(e) => {
                        e.preventDefault()
                        onNavigate(s.id)
                      }}
                      className="text-center text-[9px] font-medium leading-tight text-zinc-200 underline-offset-2 hover:underline sm:max-w-[9rem] sm:text-[10px] max-w-[7.5rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                    >
                      <span
                        className={joinClasses(
                          isPolaris ? 'text-amber-100' : isCommand ? 'text-sky-100' : '',
                        )}
                      >
                        {s.label}
                      </span>
                    </a>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

/** For tests / docs: workflow ids shown on the map. */
export const NEBULA_CONSTELLATION_WORKFLOW_IDS = STARS.map((s) => s.id)
