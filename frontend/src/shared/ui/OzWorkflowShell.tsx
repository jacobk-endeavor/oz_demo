import { useEffect, useState, type ReactNode } from 'react'
import { PanelLeftIcon, PanelRightIcon } from './icons'
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
  /** Suppress the right Oz panel for surfaces that explicitly do not want it.
      Most pages should leave this as the default so Oz is always present. */
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

function isFlatTopItem(group: OzNavGroup): boolean {
  return group.label === undefined && group.items.length === 1
}

function FlatNavItem({
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
        'group relative flex w-full items-center gap-2.5 rounded-lg text-sm transition-colors',
        collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2',
        active
          ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200'
          : 'text-zinc-700 hover:bg-zinc-200/60',
      )}
    >
      <Icon
        className={joinClasses(
          'h-4 w-4 shrink-0',
          active ? 'text-zinc-900' : 'text-zinc-500 group-hover:text-zinc-700',
        )}
      />
      {!collapsed && <span className="truncate font-medium">{label}</span>}
    </button>
  )
}

function GroupSection({
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
  const isActiveGroup = group.items.some((item) => item.id === activeNavItem)
  const Icon = group.icon

  if (collapsed) {
    // In collapsed mode, render each child as its own icon row so users can
    // still navigate. Skip the group label since there is no room for it.
    return (
      <div className="space-y-1">
        {group.items.map((item) => (
          <FlatNavItem
            key={item.id}
            collapsed
            active={item.id === activeNavItem}
            label={item.label}
            icon={item.icon}
            onClick={() => onNavItemChange?.(item.id)}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={joinClasses(
        'rounded-xl px-1.5 py-1 transition-colors',
        isActiveGroup ? 'bg-zinc-200/60' : 'bg-transparent',
      )}
    >
      {group.label && (
        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-zinc-900">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-zinc-700" aria-hidden="true" />}
          <span className="truncate">{group.label}</span>
        </div>
      )}
      <div className="space-y-0.5">
        {group.items.map((item) => {
          const active = item.id === activeNavItem
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavItemChange?.(item.id)}
              aria-current={active ? 'page' : undefined}
              className={joinClasses(
                'group flex w-full items-center gap-2.5 rounded-lg text-sm transition-colors',
                'px-3 py-1.5',
                active
                  ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200'
                  : 'text-zinc-700 hover:bg-white/60 hover:text-zinc-900',
              )}
            >
              {/* Sub-items inside a group are label-only in Ramp's pattern, but
                  we keep a tiny inline icon so the affordance matches the rest
                  of the workflow nav. */}
              <item.icon
                className={joinClasses(
                  'h-3.5 w-3.5 shrink-0',
                  active ? 'text-zinc-900' : 'text-zinc-400 group-hover:text-zinc-600',
                )}
                aria-hidden="true"
              />
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </div>
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

  const hasAssistant = !hideAssistant && (assistant !== undefined || assistantProps !== undefined)
  const showAssistant = hasAssistant && !assistantCollapsed

  return (
    <div className={joinClasses('relative flex h-screen bg-zinc-50 text-zinc-900', className)}>
      <nav
        aria-label="Primary navigation"
        className={joinClasses(
          'flex h-full shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 transition-[width] duration-200',
          sidebarCollapsed ? 'w-[64px]' : 'w-[244px]',
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Oz</p>
              <p className="text-sm font-semibold text-zinc-900">Nebula</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <PanelLeftIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-2 mb-2 h-px bg-zinc-200" aria-hidden="true" />

        <div className="flex-1 space-y-1 overflow-y-auto px-2 py-1">
          {navGroups.map((group) =>
            isFlatTopItem(group) ? (
              <FlatNavItem
                key={group.id}
                collapsed={sidebarCollapsed}
                active={group.items[0].id === activeNavItem}
                label={group.items[0].label}
                icon={group.items[0].icon}
                onClick={() => onNavItemChange?.(group.items[0].id)}
              />
            ) : (
              <GroupSection
                key={group.id}
                group={group}
                collapsed={sidebarCollapsed}
                activeNavItem={activeNavItem}
                onNavItemChange={onNavItemChange}
              />
            ),
          )}
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
              {headerActions !== undefined && (
                <div className="flex shrink-0 items-center gap-2 pr-12">{headerActions}</div>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="mx-auto max-w-[1400px] px-6 py-6">{children}</div>
            </div>
          </>
        )}
      </main>

      {showAssistant && (
        <aside
          className="flex h-full w-[360px] shrink-0 flex-col border-l border-zinc-200 bg-white"
          aria-label="Oz assistant rail"
        >
          {assistant ?? (assistantProps ? <OzAssistantPanel {...assistantProps} /> : null)}
        </aside>
      )}

      {hasAssistant && (
        <button
          type="button"
          onClick={() => setAssistantCollapsed(!assistantCollapsed)}
          aria-pressed={!assistantCollapsed}
          aria-label={assistantCollapsed ? 'Show Oz chat' : 'Hide Oz chat'}
          title={assistantCollapsed ? 'Show Oz chat' : 'Hide Oz chat'}
          className={joinClasses(
            'absolute right-2.5 top-2.5 z-50 rounded-md p-1.5 transition-colors',
            assistantCollapsed
              ? 'bg-white/90 text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-100 hover:text-zinc-900'
              : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900',
          )}
        >
          <PanelRightIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
