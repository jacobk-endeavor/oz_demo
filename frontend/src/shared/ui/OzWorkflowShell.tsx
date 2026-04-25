import type { ReactNode } from 'react'
import {
  BackgroundTaskRail,
  type BackgroundTaskItem,
} from './BackgroundTaskRail'
import {
  OzAssistantPanel,
  type OzAssistantPanelProps,
} from './OzAssistantPanel'
import {
  ozWorkflowNavItems,
  type OzWorkflowNavId,
} from './OzWorkflowShell.contract'
import { joinClasses, ozSurfaceClasses } from './visualSystem'

export interface OzWorkflowShellProps {
  activeNavItem: OzWorkflowNavId
  onNavItemChange?: (item: OzWorkflowNavId) => void
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  headerActions?: ReactNode
  children: ReactNode
  evidence?: ReactNode
  backgroundTasks?: BackgroundTaskItem[]
  assistant?: ReactNode
  assistantProps?: OzAssistantPanelProps
  className?: string
}

const defaultAssistantProps: OzAssistantPanelProps = {
  contextSummary: 'Oz stays beside every workflow with current context, evidence, and next actions.',
  contextItems: [
    { label: 'Mode', value: 'Workflow', tone: 'blue' },
    { label: 'System', value: 'Nebula', tone: 'white' },
  ],
  messages: [
    {
      id: 'oz-ready',
      role: 'oz',
      content: 'Select a workflow or drop evidence into the canvas to begin.',
    },
  ],
  suggestedPrompts: [{ id: 'summarize', label: 'Summarize current evidence' }],
}

function OzWorkflowNav({
  activeNavItem,
  onNavItemChange,
}: Pick<OzWorkflowShellProps, 'activeNavItem' | 'onNavItemChange'>) {
  return (
    <nav
      className="flex h-full w-[260px] shrink-0 flex-col border-r border-white/10 bg-[#030407]/92 px-4 py-5 text-[#F5F7FF] backdrop-blur-xl"
      aria-label="Oz workflow navigation"
    >
      <div className="mb-6 rounded-3xl border border-[#23B8FF]/24 bg-[#0674FF]/12 p-4 shadow-[0_0_32px_rgba(35,184,255,0.16)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#23B8FF]">Oz</p>
        <h1 className="mt-2 text-2xl font-semibold">Nebula</h1>
        <p className="mt-2 text-sm leading-6 text-[#8B93A7]">Workflow intelligence shell</p>
      </div>

      <div className="space-y-2">
        {ozWorkflowNavItems.map((item) => {
          const isActive = item.id === activeNavItem
          return (
            <button
              key={item.id}
              type="button"
              className={joinClasses(
                'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition',
                isActive
                  ? 'border-[#23B8FF]/55 bg-[#0674FF]/22 text-[#F5F7FF] shadow-[0_0_24px_rgba(35,184,255,0.2)]'
                  : 'border-white/10 bg-white/[0.035] text-[#B7C1D8] hover:border-white/20 hover:bg-white/[0.07] hover:text-[#F5F7FF]',
              )}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavItemChange?.(item.id)}
            >
              <span>{item.label}</span>
              {isActive && (
                <span
                  className="h-2 w-2 rounded-full bg-[#FF3B00] shadow-[0_0_16px_rgba(255,59,0,0.8)]"
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function OzWorkflowShell({
  activeNavItem,
  onNavItemChange,
  eyebrow = 'Workflow',
  title,
  subtitle,
  headerActions,
  children,
  evidence,
  backgroundTasks = [],
  assistant,
  assistantProps = defaultAssistantProps,
  className,
}: OzWorkflowShellProps) {
  const hasEvidenceArea = evidence !== undefined || backgroundTasks.length > 0

  return (
    <div className={joinClasses(ozSurfaceClasses.page, 'flex h-screen', className)}>
      <OzWorkflowNav activeNavItem={activeNavItem} onNavItemChange={onNavItemChange} />

      <section className="relative z-10 flex min-w-0 flex-1 gap-5 p-5" aria-label="Oz workflow shell">
        <main className="flex min-w-0 flex-1 flex-col gap-5">
          <header className={joinClasses(ozSurfaceClasses.panel, 'p-6')}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#23B8FF]">
                  {eyebrow}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#F5F7FF]">{title}</h2>
                {subtitle !== undefined && (
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[#8B93A7]">{subtitle}</p>
                )}
              </div>
              {headerActions !== undefined && <div className="flex items-center gap-2">{headerActions}</div>}
            </div>
          </header>

          <section
            className={joinClasses(ozSurfaceClasses.card, 'min-h-0 flex-1 overflow-auto p-6')}
            aria-label="Workflow canvas"
          >
            {children}
          </section>

          {hasEvidenceArea && (
            <aside className="grid gap-4 xl:grid-cols-2" aria-label="Evidence and background tasks">
              {evidence !== undefined && (
                <section className={joinClasses(ozSurfaceClasses.panel, 'p-5')} aria-label="Evidence">
                  {evidence}
                </section>
              )}
              {backgroundTasks.length > 0 && <BackgroundTaskRail tasks={backgroundTasks} />}
            </aside>
          )}
        </main>

        <div className="h-full w-[380px] shrink-0">
          {assistant ?? <OzAssistantPanel {...assistantProps} />}
        </div>
      </section>
    </div>
  )
}
