import { useCallback, useEffect, useRef, useState } from 'react'
import { BackgroundAgentConnectionRow, type ConnectionRowPhase } from './BackgroundAgentConnectionRow'
import type { BackgroundAgentCompany } from './backgroundAgentModel'

const STEP_MS = 1000
const ALL_DONE_MS = 500
const EMPTY_HOLD_MS = 1200

function connectionRowPhase(connections: readonly BackgroundAgentCompany[], index: number, i: number): ConnectionRowPhase {
  if (index === connections.length) return 'done'
  if (i < index) return 'done'
  if (i === index) return 'connecting'
  return 'pending'
}

/**
 * “Creating” card — same structure as the Background agents list, with a live connection list.
 */
export function BackgroundAgentConnectingToast({
  agentName,
  connections,
  onComplete,
}: {
  /** Line under “Creating Background Agent” — the title from the AI / heuristics (same as the saved card). */
  agentName: string
  connections: readonly BackgroundAgentCompany[]
  onComplete: () => void
}) {
  const [index, setIndex] = useState(0)
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const finish = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    onCompleteRef.current()
  }, [])

  useEffect(() => {
    if (connections.length > 0) return
    const t = window.setTimeout(finish, EMPTY_HOLD_MS)
    return () => window.clearTimeout(t)
  }, [connections.length, finish])

  useEffect(() => {
    if (connections.length === 0) return
    if (index < connections.length) {
      const t = window.setTimeout(() => setIndex((i) => i + 1), STEP_MS)
      return () => window.clearTimeout(t)
    }
    if (index === connections.length) {
      const t = window.setTimeout(finish, ALL_DONE_MS)
      return () => window.clearTimeout(t)
    }
  }, [index, connections.length, finish])

  const header = (
    <div className="border-b border-zinc-100 pb-3">
      <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600/90">Agent</p>
      <h3 className="m-0 mt-1 text-base font-semibold text-zinc-900 [text-wrap:balance]">Creating Background Agent</h3>
      <p className="m-0 mt-1.5 text-sm font-medium capitalize text-zinc-800 [text-wrap:balance]">{agentName}</p>
    </div>
  )

  if (connections.length === 0) {
    return (
      <div
        className="max-w-sm rounded-2xl border border-zinc-200/80 bg-white px-4 py-4 shadow-md"
        data-testid="background-agent-connecting-toast"
      >
        {header}
        <p className="m-0 mt-3 text-sm text-zinc-600">Wiring the workflow and saving your schedule…</p>
      </div>
    )
  }

  return (
    <div
      className="max-w-sm rounded-2xl border border-zinc-200/80 bg-white px-4 py-4 shadow-md"
      data-testid="background-agent-connecting-toast"
    >
      {header}
      <div className="mt-3 w-full min-w-0">
        <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Connections</p>
        <p className="m-0 mt-0.5 text-xs leading-snug text-zinc-500">Integrations this run uses</p>
        <ul className="m-0 mt-2 list-none p-0" aria-label="Connection progress">
          {connections.map((c, i) => (
            <li
              key={c.domain}
              className="border-b border-zinc-100 py-1.5 first:pt-0 last:border-0"
            >
              <BackgroundAgentConnectionRow
                name={c.name}
                domain={c.domain}
                phase={connectionRowPhase(connections, index, i)}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
