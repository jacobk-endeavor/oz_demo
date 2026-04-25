import type { ReactNode } from 'react'
import { Tag } from './Tag'
import { joinClasses, type Tone } from './visualSystem'

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

const statusTone: Record<BackgroundTaskStatus, Tone> = {
  queued: 'zinc',
  running: 'blue',
  complete: 'emerald',
  blocked: 'red',
}

const nodeClasses: Record<BackgroundTaskStatus, string> = {
  queued: 'border-zinc-300 bg-white',
  running: 'border-blue-500 bg-blue-500',
  complete: 'border-emerald-500 bg-emerald-500',
  blocked: 'border-red-500 bg-red-500',
}

export function BackgroundTaskRail({
  tasks,
  title = 'Background tasks',
  subtitle = 'Steps Oz is coordinating now.',
  className,
}: BackgroundTaskRailProps) {
  return (
    <section
      className={joinClasses(
        'rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm',
        className,
      )}
      aria-label={title}
    >
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {title}
        </p>
        <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
      </div>
      <ol className="relative space-y-3">
        {tasks.map((task, index) => (
          <li key={task.id} className="relative grid grid-cols-[1.25rem_1fr] gap-3">
            {index < tasks.length - 1 && (
              <span
                className="absolute left-[0.563rem] top-5 h-[calc(100%+0.75rem)] w-px bg-zinc-200"
                aria-hidden="true"
              />
            )}
            <span
              className={joinClasses(
                'relative z-10 mt-0.5 h-4 w-4 rounded-full border',
                nodeClasses[task.status],
                task.status === 'running' && 'animate-pulse',
              )}
              aria-hidden="true"
            />
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{task.label}</p>
                  {task.detail !== undefined && (
                    <p className="mt-0.5 text-xs text-zinc-600">{task.detail}</p>
                  )}
                </div>
                <Tag tone={statusTone[task.status]}>{statusCopy[task.status]}</Tag>
              </div>
              {(task.sourceCount !== undefined || task.eta !== undefined) && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                  {task.sourceCount !== undefined && (
                    <span>{task.sourceCount} sources</span>
                  )}
                  {task.eta !== undefined && <span>{task.eta}</span>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
