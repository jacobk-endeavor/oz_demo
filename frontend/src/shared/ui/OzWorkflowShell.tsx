import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PanelLeftIcon, PanelRightIcon } from './icons'
import { OzAssistantPanel, type OzAssistantPanelProps } from './OzAssistantPanel'
import {
  navGroups,
  type IconComponent,
  type OzNavGroup,
} from './OzWorkflowShell.contract'
import { joinClasses } from './visualSystem'

export interface OzWorkflowShellProps {
  activeNavItem: string
  onNavItemChange?: (item: string) => void
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  headerActions?: ReactNode
  children: ReactNode
  assistant?: ReactNode
  assistantProps?: OzAssistantPanelProps
  /** When true the main canvas takes the full content area without the
      framing card. The inner page is then responsible for its own layout. */
  fullBleed?: boolean
  /** Hide the right Oz panel for full-bleed legacy surfaces like Chat. */
  hideAssistant?: boolean
  className?: string
}

const SIDEBAR_KEY = 'oz-demo-sidebar-collapsed'
const ASSISTANT_KEY = 'oz-demo-assistant-collapsed'

function useStoredFlag(storageKey: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(fallback)
  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      const stored = window.localStorage.getItem(storageKey)
      if (stored !== null) setValue(stored === '1')
    } catch {
      // Storage may be unavailable in tests or sandbox; ignore gracefully.
    }
  }, [storageKey])

  function update(next: boolean) {
    setValue(next)
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      window.localStorage.setItem(storageKey, next ? '1' : '0')
    } catch {
      // Persisting is best-effort; the in-memory state still updates.
    }
  }

  return [value, update]
}

function NavButton({
  collapsed,
  active,
  label,
  icon: Icon,
  onClick,
}: {
  collapsed: boolean
  active: boolean
  label: string
  icon: IconComponent
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={joinClasses(
        'group flex w-full items-center gap-2 rounded-lg text-sm transition-colors',
        collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-2',
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-zinc-700 hover:bg-zinc-100',
      )}
    >
      <Icon
        className={joinClasses(
          'h-4 w-4 shrink-0',
          active ? 'text-blue-600' : 'text-zinc-500 group-hover:text-zinc-700',
        )}
      />
      {!collapsed && <span className="truncate font-medium">{label}</span>}
    </button>
  )
}

function NavGroup({
  group,
  collapsed,
  activeNavItem,
  onNavItemChange,
}: {
  group: OzNavGroup
  collapsed: boolean
  activeNavItem: string
  onNavItemChange?: (id: string) => void
}) {
  return (
    <div className="space-y-1">
      {!collapsed && (
        <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          {group.label}
        </p>
      )}
      {group.items.map((item) => (
        <NavButton
          key={item.id}
          collapsed={collapsed}
          active={item.id === activeNavItem}
          label={item.label}
          icon={item.icon}
          onClick={() => onNavItemChange?.(item.id)}
        />
      ))}
    </div>
  )
}

export function OzWorkflowShell({
  activeNavItem,
  onNavItemChange,
  eyebrow,
  title,
  subtitle,
  headerActions,
  children,
  assistant,
  assistantProps,
  fullBleed = false,
  hideAssistant = false,
  className,
}: OzWorkflowShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useStoredFlag(SIDEBAR_KEY, false)
  const [assistantCollapsed, setAssistantCollapsed] = useStoredFlag(ASSISTANT_KEY, false)

  const showAssistant = !hideAssistant && (assistant !== undefined || assistantProps !== undefined)

  return (
    <div className={joinClasses('flex h-screen bg-zinc-50 text-zinc-900', className)}>
      <nav
        aria-label="Primary navigation"
        className={joinClasses(
          'flex h-full shrink-0 flex-col border-r border-zinc-200 bg-white transition-[width] duration-200',
          sidebarCollapsed ? 'w-[64px]' : 'w-[232px]',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-3">
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Oz</p>
              <p className="text-sm font-semibold text-zinc-900">Nebula</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <PanelLeftIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
          {navGroups.map((group) => (
            <NavGroup
              key={group.id}
              group={group}
              collapsed={sidebarCollapsed}
              activeNavItem={activeNavItem}
              onNavItemChange={onNavItemChange}
            />
          ))}
        </div>
      </nav>

      <main className="flex min-w-0 flex-1 flex-col">
        {fullBleed ? (
          <div className="flex h-full min-h-0 flex-1 flex-col bg-white">{children}</div>
        ) : (
          <>
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-4">
              <div className="min-w-0">
                {eyebrow !== undefined && (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                    {eyebrow}
                  </p>
                )}
                <h1 className="mt-0.5 truncate text-xl font-semibold text-zinc-900">{title}</h1>
                {subtitle !== undefined && (
                  <p className="mt-1 max-w-3xl text-sm text-zinc-600">{subtitle}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {headerActions}
                {showAssistant && (
                  <button
                    type="button"
                    onClick={() => setAssistantCollapsed(!assistantCollapsed)}
                    className="rounded-md border border-zinc-300 bg-white p-1.5 text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                    aria-label={assistantCollapsed ? 'Show Oz assistant' : 'Hide Oz assistant'}
                    title={assistantCollapsed ? 'Show Oz assistant' : 'Hide Oz assistant'}
                  >
                    <PanelRightIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="mx-auto max-w-[1400px] px-6 py-6">{children}</div>
            </div>
          </>
        )}
      </main>

      {showAssistant && (
        <aside
          className={joinClasses(
            'relative flex h-full shrink-0 flex-col border-l border-zinc-200 bg-white transition-[width] duration-200',
            assistantCollapsed ? 'w-[44px]' : 'w-[360px]',
          )}
          aria-label="Oz assistant rail"
        >
          {assistantCollapsed ? (
            <button
              type="button"
              onClick={() => setAssistantCollapsed(false)}
              className="m-2 flex flex-1 flex-col items-center gap-2 rounded-md py-3 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Show Oz assistant"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              <span className="rotate-180 text-[11px] font-semibold uppercase tracking-[0.18em] [writing-mode:vertical-rl]">
                Oz Assistant
              </span>
            </button>
          ) : (
            <>
              <div className="flex items-center justify-end border-b border-zinc-200 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setAssistantCollapsed(true)}
                  className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  aria-label="Hide Oz assistant"
                  title="Hide Oz assistant"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {assistant ?? (assistantProps ? <OzAssistantPanel {...assistantProps} /> : null)}
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  )
}
