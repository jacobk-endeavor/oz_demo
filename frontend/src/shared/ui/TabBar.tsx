import type { ReactNode } from 'react'

export interface TabDef<T extends string> {
  id: T
  label: string
  icon?: ReactNode
}

interface TabBarProps<T extends string> {
  tabs: TabDef<T>[]
  active: T
  onChange: (tab: T) => void
  /** When true, the tab strip uses edge-to-edge padding to match a
      full-bleed AppShell (no card wrapper to cancel).  Default false. */
  fullBleed?: boolean
}

/**
 * In-page tab strip.
 *
 * Rendered at the top of the main content card so switching between
 * the three surfaces (Chat / Graph / Ingest) feels like swapping tabs
 * within a single window, rather than navigating between pages.  The
 * sidebar keeps the same nav entries for muscle memory but this bar
 * gives the primary affordance.
 */
export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  fullBleed = false,
}: TabBarProps<T>) {
  const layoutClass = fullBleed
    ? 'flex items-center gap-1 border-b border-white/10 bg-[#030407]/92 px-4 pt-2 flex-shrink-0'
    : '-mx-6 -mt-6 mb-6 flex items-center gap-1 border-b border-white/10 bg-[#030407]/92 px-4 pt-2'
  return (
    <div
      className={layoutClass}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={[
              'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
              isActive
                ? 'text-[#F5F7FF]'
                : 'text-[#8B93A7] hover:text-[#F5F7FF]',
            ].join(' ')}
          >
            {tab.icon ? <span className="text-[#23B8FF]">{tab.icon}</span> : null}
            <span>{tab.label}</span>
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#FF3B00] shadow-[0_0_16px_rgba(255,59,0,0.7)]"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
