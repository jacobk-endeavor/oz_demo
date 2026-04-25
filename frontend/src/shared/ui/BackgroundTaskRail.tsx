import type { ReactNode } from 'react'
import { joinClasses, ozSurfaceClasses, ozToneClasses } from './visualSystem'

export type BackgroundTaskStatus = 'queued' | 'running' | 'complete' | 'blocked'

export interface BackgroundTaskItem {
  id: string
  label: string
  status: BackgroundTaskStatus
  detail?: ReactNode
  sourceCount?: number
  eta?: string
}

interface BackgroundTaskRailProps {
  tasks: BackgroundTaskItem[]
  title?: string
  subtitle?: string
  className?: string
}

const statusCopy: Record<BackgroundTaskStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  complete: 'Complete',
  blocked: 'Blocked',
}

const statusTone: Record<BackgroundTaskStatus, 'blue' | 'red' | 'white' | 'muted'> = {
  queued: 'muted',
  running: 'blue',
  complete: 'white',
  blocked: 'red',
}

const nodeClasses: Record<BackgroundTaskStatus, string> = {
  queued: 'border-white/20 bg-white/10',
  running:
    'oz-task-node--running border-[#23B8FF] bg-[#23B8FF] shadow-[0_0_24px_rgba(35,184,255,0.45)]',
  complete: 'border-white bg-white text-[#030407]',
  blocked: 'border-[#FF3B00] bg-[#E10600] shadow-[0_0_24px_rgba(225,6,0,0.36)]',
}

export function BackgroundTaskRail({
  tasks,
  title = 'Background agents',
  subtitle = 'Deterministic steps Oz is coordinating now.',
  className,
}: BackgroundTaskRailProps) {
  return (
    <section
      className={joinClasses(ozSurfaceClasses.panel, 'w-full overflow-hidden p-5', className)}
      aria-label={title}
    >
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#23B8FF]">{title}</p>
        <p className="mt-2 text-sm text-[#8B93A7]">{subtitle}</p>
      </div>

      <ol className="relative space-y-4">
        {tasks.map((task, index) => (
          <li key={task.id} className="relative grid grid-cols-[1.5rem_1fr] gap-3">
            {index < tasks.length - 1 && (
              <span
                className="absolute left-[0.6875rem] top-6 h-[calc(100%+1rem)] w-px bg-white/12"
                aria-hidden="true"
              />
            )}
            <span
              className={joinClasses(
                'relative z-10 mt-1 h-5 w-5 rounded-full border',
                nodeClasses[task.status],
              )}
              aria-hidden="true"
            />
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F7FF]">{task.label}</h3>
                  {task.detail !== undefined && (
                    <p className="mt-1 text-sm leading-6 text-[#8B93A7]">{task.detail}</p>
                  )}
                </div>
                <span
                  className={joinClasses(
                    'shrink-0 rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em]',
                    ozToneClasses[statusTone[task.status]],
                  )}
                >
                  {statusCopy[task.status]}
                </span>
              </div>

              {(task.sourceCount !== undefined || task.eta !== undefined) && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#8B93A7]">
                  {task.sourceCount !== undefined && (
                    <span className="rounded-full border border-white/10 bg-[#030407]/50 px-2.5 py-1">
                      {task.sourceCount} sources
                    </span>
                  )}
                  {task.eta !== undefined && (
                    <span className="rounded-full border border-white/10 bg-[#030407]/50 px-2.5 py-1">
                      {task.eta}
                    </span>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
