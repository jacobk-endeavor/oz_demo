import { Button } from '../../shared/ui'
import { TrashIcon } from '../../shared/ui/icons'
import { BackgroundAgentConnectionRow } from './BackgroundAgentConnectionRow'
import { connectionsForAgentRecord } from './backgroundAgentConnections'
import {
  backgroundAgentDisplayName,
  type BackgroundAgentCompany,
  type BackgroundAgentRecord,
} from './backgroundAgentModel'

export interface BackgroundAgentsPageProps {
  agents: ReadonlyArray<{
    id: string
    createdAt: string
    assignment: string
    schedule: string
    taskTitle?: string
    taskDetail?: string
    deliverable?: string
    companies?: BackgroundAgentCompany[]
  }>
  onNewAgent: () => void
  onDeleteAgent: (id: string) => void
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function BackgroundAgentsPage({ agents, onNewAgent, onDeleteAgent }: BackgroundAgentsPageProps) {
  return (
    <div
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-auto px-1 py-2 md:px-2"
      data-testid="background-agents-workflow"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Your Background Agents</h2>
        </div>
        <Button type="button" variant="primary" onClick={onNewAgent} className="shrink-0">
          New Background Agent
        </Button>
      </div>
      {agents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 px-6 py-10 text-center text-sm text-zinc-600">
          No background agents yet. Open <strong className="font-medium text-zinc-800">Oz</strong> and ask Oz to{' '}
          <strong className="font-medium text-zinc-800">Create a Background Agent</strong> with a task and a
          schedule, or use the button above to jump there.
        </div>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0" aria-label="Background Agents list">
          {agents.map((a) => {
            const title = backgroundAgentDisplayName(a as BackgroundAgentRecord)
            const detail = a.taskDetail?.trim() || a.assignment
            const outcome = a.deliverable?.trim()
            const connections = connectionsForAgentRecord(a as BackgroundAgentRecord)
            return (
              <li
                key={a.id}
                className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600/90">
                      Agent
                    </p>
                    <h3 className="mt-1 text-base font-semibold capitalize text-zinc-900 [text-wrap:balance]">
                      {title}
                    </h3>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                    <p className="text-xs text-zinc-400">Created {formatDate(a.createdAt)}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onDeleteAgent(a.id)}
                      className="h-8 shrink-0 gap-1.5 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                      aria-label={`Delete background agent: ${title}`}
                      data-testid="background-agent-delete"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_minmax(0,auto)] sm:items-start">
                  <div className="min-w-0 space-y-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                        Scope &amp; Behavior
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-800">{detail}</p>
                    </div>
                    {outcome ? (
                      <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800/80">
                          Outcome Each Run
                        </p>
                        <p className="mt-1 text-sm font-medium text-emerald-950">{outcome}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Schedule</p>
                      <p className="mt-1 text-sm font-medium text-zinc-900">{a.schedule}</p>
                    </div>
                  </div>

                  {connections.length > 0 ? (
                    <div className="w-full min-w-0 sm:max-w-[220px]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                        Connections
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-zinc-500">
                        Integrations this run uses
                      </p>
                      <ul className="m-0 mt-2 list-none p-0">
                        {connections.map((c) => (
                          <li
                            key={c.domain}
                            className="border-b border-zinc-100 py-1.5 first:pt-0 last:border-0"
                          >
                            <BackgroundAgentConnectionRow name={c.name} domain={c.domain} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
