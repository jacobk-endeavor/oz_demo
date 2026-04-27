import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { ChevronRightIcon, CloseIcon, SparkleIcon } from './icons'
import { ENDEAVOR_LOGO_SRC } from './brand'
import { OzAssistantPanel, type OzAssistantPanelProps } from './OzAssistantPanel'
import {
  isWorkflowPage,
  topNavItems,
  workflowAccentClass,
  workflowNavItems,
  workspaceNavItems,
} from './OzWorkflowShell.contract'
import { joinClasses } from './visualSystem'

export interface OzWorkflowShellProps {
  activeNavItem: string
  onNavItemChange?: (item: string) => void
  /** Right-hand context / workflow surface title. */
  title: ReactNode
  subtitle?: ReactNode
  eyebrow?: ReactNode
  headerActions?: ReactNode
  children: ReactNode
  /**
   * Center column is always the chat when `assistantProps` is set. Pass messages,
   * context, etc. here (sim.ai “Mothership”-style).
   */
  assistant?: ReactNode
  assistantProps?: OzAssistantPanelProps
  /**
   * Label above the center chat (e.g. Mothership). Omitted when the chat column
   * is hidden.
   */
  commandCenterLabel?: ReactNode
  fullBleed?: boolean
  /** When set, the center chat column is omitted entirely. */
  hideAssistant?: boolean
  /**
   * `centered` — one column, chat is horizontally centered (home). `rail` — fixed-width or flex chat column.
   * Ignored when `hideAssistant` / no assistant.
   */
  commandCenterMode?: 'rail' | 'centered'
  /** `false` hides the small label bar (sparkle + title) above the chat column. */
  showCommandBar?: boolean
  /**
   * When the chat is a fixed-width rail with the context panel open (e.g. table on the
   * right) and `showCommandBar` is false, a compact title bar is shown above the thread
   * so the column does not look empty. Pass `null` to omit. Default label: "Conversation".
   */
  splitChatHeader?: ReactNode | null
  /**
   * Right “context” column (title + `children`). When false, only the nav + chat
   * show and the chat column grows. Default: closed.
   */
  contextPanelOpen?: boolean
  onContextPanelClose?: () => void
  className?: string
  /**
   * Prototype: Field App mobile voice workflows in the left nav. Omit or pass [] when
   * this section should not appear.
   */
  fieldMobileNavItems?: ReadonlyArray<{ id: string; label: string }>
  /**
   * Hides the context column title block (eyebrow, title, subtitle). Use for surfaces
   * that are self-explanatory (e.g. a full-width generated table). Close / `headerActions`
   * still render in a minimal top bar when provided.
   */
  hideContextHeader?: boolean
  /** Full-width context body (e.g. lead grid edge-to-edge). */
  contextWide?: boolean
  /** Fixed top-right status (e.g. in-app toasts). Rendered above the main layout. */
  topRightNotification?: ReactNode
  /**
   * Replaces the default title + subtitle block in the context header (eyebrow unchanged).
   * Use for a single compact row (e.g. quote id, timestamp, back action).
   */
  contextHeaderDetailRow?: ReactNode
}

const SIDEBAR_KEY = 'oz-demo-sidebar-collapsed'
const WORKFLOWS_OPEN_KEY = 'oz-demo-workflows-expanded'
const CHAT_RAIL_WIDTH_KEY = 'oz-demo-chat-rail-px'
const CHAT_RAIL_DEFAULT_PX = 420
const CHAT_RAIL_MIN_PX = 280
const CONTEXT_PANEL_MIN_PX = 240

function readInitialChatRailWidth(): number {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return CHAT_RAIL_DEFAULT_PX
    const raw = window.localStorage.getItem(CHAT_RAIL_WIDTH_KEY)
    if (raw === null) return CHAT_RAIL_DEFAULT_PX
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return CHAT_RAIL_DEFAULT_PX
    return Math.max(CHAT_RAIL_MIN_PX, n)
  } catch {
    return CHAT_RAIL_DEFAULT_PX
  }
}

function useStoredFlag(
  storageKey: string,
  fallback: boolean,
): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(fallback)
  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      const stored = window.localStorage.getItem(storageKey)
      if (stored !== null) setValue(stored === '1')
    } catch {
      // ignore
    }
  }, [storageKey])

  const update = useCallback(
    (next: boolean) => {
      setValue(next)
      try {
        if (typeof window === 'undefined' || !window.localStorage) return
        window.localStorage.setItem(storageKey, next ? '1' : '0')
      } catch {
        // ignore
      }
    },
    [storageKey],
  )

  return [value, update]
}

function SectionLabel({ collapsed, children }: { collapsed: boolean; children: string }) {
  if (collapsed) {
    return <div className="h-2 shrink-0" aria-hidden="true" />
  }
  return (
    <p className="mb-1.5 mt-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 first:mt-0">
      {children}
    </p>
  )
}

function SidebarIconButton({
  collapsed,
  active,
  label,
  icon: Icon,
  onClick,
}: {
  collapsed: boolean
  active: boolean
  label: string
  icon: typeof topNavItems[number]['icon']
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={joinClasses(
        'group flex w-full items-center gap-2.5 rounded-lg text-sm transition-colors',
        collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-2',
        active
          ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200'
          : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900',
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

function WorkflowNavButton({
  collapsed,
  active,
  label,
  accentClass,
  onClick,
}: {
  collapsed: boolean
  active: boolean
  label: string
  accentClass: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={joinClasses(
        'group flex w-full items-center gap-2.5 rounded-lg text-left text-sm transition-colors',
        collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-1.5',
        active
          ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200'
          : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900',
      )}
    >
      <span
        className={joinClasses(
          'h-2.5 w-2.5 shrink-0 rounded-[2px] shadow-sm',
          accentClass,
          !collapsed && 'mt-0.5 self-start',
        )}
        aria-hidden="true"
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate font-medium leading-tight">{label}</span>}
    </button>
  )
}

function FooterButton({
  collapsed,
  label,
  onClick,
}: {
  collapsed: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={joinClasses(
        'w-full rounded-lg text-left text-sm text-zinc-500 transition-colors hover:bg-zinc-200/50 hover:text-zinc-800',
        collapsed ? 'px-0 py-2 text-center' : 'px-2.5 py-2',
      )}
      title={collapsed ? label : undefined}
    >
      {collapsed ? <span className="text-xs font-semibold text-zinc-500">{label[0]}</span> : label}
    </button>
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
  commandCenterLabel = 'Mothership',
  fullBleed = false,
  hideAssistant = false,
  contextPanelOpen = false,
  onContextPanelClose,
  className,
  fieldMobileNavItems = [],
  hideContextHeader = false,
  contextWide = false,
  commandCenterMode: commandCenterModeProp = 'rail',
  showCommandBar: showCommandBarProp,
  splitChatHeader,
  topRightNotification,
  contextHeaderDetailRow,
}: OzWorkflowShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useStoredFlag(SIDEBAR_KEY, false)
  const [workflowsOpen, setWorkflowsOpen] = useStoredFlag(WORKFLOWS_OPEN_KEY, false)
  const hasAssistant = !hideAssistant && (assistant !== undefined || assistantProps !== undefined)
  const commandCenterMode = hasAssistant ? commandCenterModeProp : 'rail'
  const showCommandBar = showCommandBarProp ?? (commandCenterMode === 'rail')
  const showContextPanel = contextPanelOpen
  const isCenteredHome = hasAssistant && commandCenterMode === 'centered' && !showContextPanel
  const isRailWithSplit = hasAssistant && commandCenterMode === 'rail' && showContextPanel
  const isRailSolo = hasAssistant && commandCenterMode === 'rail' && !showContextPanel
  const splitRef = useRef<HTMLDivElement>(null)
  const chatRailWidthRef = useRef(readInitialChatRailWidth())
  const [chatRailWidthPx, setChatRailWidthPx] = useState(() => readInitialChatRailWidth())
  const [chatSplitDragging, setChatSplitDragging] = useState(false)
  const dragRef = useRef<{ pointerId: number; startX: number; startW: number } | null>(null)

  const chatSectionStyle: CSSProperties | undefined = useMemo(() => {
    if (!hasAssistant) return undefined
    if (isRailWithSplit) {
      return {
        width: chatRailWidthPx,
        minWidth: CHAT_RAIL_MIN_PX,
        maxWidth: '100%',
        transition: chatSplitDragging ? 'none' : undefined,
      }
    }
    return { width: '100%', minWidth: 0, transition: chatSplitDragging ? 'none' : undefined }
  }, [hasAssistant, isRailWithSplit, chatRailWidthPx, chatSplitDragging])

  const clampChatWidth = useCallback((w: number) => {
    const row = splitRef.current
    if (!row) return Math.max(CHAT_RAIL_MIN_PX, w)
    const available = row.getBoundingClientRect().width
    const maxChat = Math.max(CHAT_RAIL_MIN_PX, available - CONTEXT_PANEL_MIN_PX)
    return Math.max(CHAT_RAIL_MIN_PX, Math.min(maxChat, w))
  }, [])

  useEffect(() => {
    if (!isRailWithSplit) return
    setChatRailWidthPx((w) => clampChatWidth(w))
  }, [isRailWithSplit, clampChatWidth])

  useEffect(() => {
    if (!isRailWithSplit) return
    const row = splitRef.current
    if (!row || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setChatRailWidthPx((w) => clampChatWidth(w))
    })
    ro.observe(row)
    return () => ro.disconnect()
  }, [isRailWithSplit, clampChatWidth])

  const onChatSplitPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      setChatSplitDragging(true)
      const startW = chatRailWidthRef.current
      dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startW }
      e.currentTarget.setPointerCapture(e.pointerId)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [],
  )

  const onChatSplitPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      const next = d.startW + (e.clientX - d.startX)
      const clamped = clampChatWidth(next)
      chatRailWidthRef.current = clamped
      setChatRailWidthPx(clamped)
    },
    [clampChatWidth],
  )

  const endChatSplitDrag = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current
      if (d && e.pointerId === d.pointerId) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
      }
      dragRef.current = null
      setChatSplitDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(CHAT_RAIL_WIDTH_KEY, String(chatRailWidthRef.current))
        }
      } catch {
        // ignore
      }
    },
    [],
  )

  useEffect(() => {
    chatRailWidthRef.current = chatRailWidthPx
  }, [chatRailWidthPx])
  // Open the list when the user lands on a workflow route (e.g. deep link) so the active item is visible.
  useEffect(() => {
    if (isWorkflowPage(activeNavItem)) {
      setWorkflowsOpen(true)
    }
  }, [activeNavItem, setWorkflowsOpen])

  const showWorkflowList = workflowsOpen

  return (
    <div
      className={joinClasses('relative flex h-screen overflow-hidden bg-zinc-100 text-zinc-900', className)}
    >
      {topRightNotification != null && topRightNotification !== false ? (
        <div
          className="pointer-events-none absolute right-3 top-3 z-50 max-w-sm min-w-0 pl-2"
          role="status"
        >
          <div className="pointer-events-auto min-w-0">{topRightNotification}</div>
        </div>
      ) : null}
      <nav
        aria-label="Primary navigation"
        className={joinClasses(
          'flex h-full shrink-0 flex-col border-r border-zinc-200 bg-white transition-[width] duration-200',
          sidebarCollapsed ? 'w-[56px]' : 'w-[220px]',
        )}
      >
        <div
          className={joinClasses(
            'flex items-center border-b border-zinc-200 px-2.5 py-2.5',
            sidebarCollapsed ? 'justify-center' : 'justify-start',
          )}
        >
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={joinClasses(
              'flex min-w-0 items-center rounded-md transition-colors hover:bg-zinc-200/50',
              sidebarCollapsed
                ? 'w-full justify-center p-1'
                : 'flex-1 justify-start p-1 pl-0.5 pr-2',
            )}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <img
              src={ENDEAVOR_LOGO_SRC}
              alt="Endeavor"
              className={joinClasses(
                'object-contain opacity-90',
                sidebarCollapsed
                  ? 'h-6 w-6'
                  : 'h-7 w-auto max-w-[min(100%,150px)] object-left',
              )}
              draggable={false}
            />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 pt-1.5">
          {topNavItems.map((item) => (
            <SidebarIconButton
              key={item.id}
              collapsed={sidebarCollapsed}
              active={activeNavItem === item.id}
              label={item.label}
              icon={item.icon}
              onClick={() => onNavItemChange?.(item.id)}
            />
          ))}

          <SectionLabel collapsed={sidebarCollapsed}>Workspace</SectionLabel>
          {workspaceNavItems.map((item) => {
            const Icon = item.icon
            const active = activeNavItem === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavItemChange?.(item.id)}
                aria-current={active ? 'page' : undefined}
                title={sidebarCollapsed ? item.label : undefined}
                className={joinClasses(
                  'mb-0.5 flex w-full items-center gap-2.5 rounded-lg text-sm transition-colors',
                  sidebarCollapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-1.5',
                  active
                    ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200'
                    : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900',
                )}
              >
                <Icon
                  className={joinClasses(
                    'h-4 w-4 shrink-0',
                    active ? 'text-zinc-900' : 'text-zinc-500 group-hover:text-zinc-700',
                  )}
                />
                {!sidebarCollapsed && (
                  <span className="truncate font-medium leading-tight">{item.label}</span>
                )}
              </button>
            )
          })}

          {fieldMobileNavItems.length > 0 && (
            <>
              <SectionLabel collapsed={sidebarCollapsed}>Mobile workflows</SectionLabel>
              {fieldMobileNavItems.map((item) => {
                const active = activeNavItem === item.id
                return (
                  <WorkflowNavButton
                    key={item.id}
                    collapsed={sidebarCollapsed}
                    active={active}
                    label={item.label}
                    accentClass="bg-sky-500"
                    onClick={() => onNavItemChange?.(item.id)}
                  />
                )
              })}
            </>
          )}

          {sidebarCollapsed ? (
            <>
              <button
                type="button"
                onClick={() => setWorkflowsOpen(!workflowsOpen)}
                aria-expanded={showWorkflowList}
                title={showWorkflowList ? 'Hide workflows' : 'Show workflows'}
                className="flex w-full items-center justify-center rounded-lg py-2 text-zinc-500 transition-colors hover:bg-zinc-200/50 hover:text-zinc-900"
              >
                <ChevronRightIcon
                  className={joinClasses(
                    'h-4 w-4 transition-transform',
                    showWorkflowList && 'rotate-90',
                  )}
                />
              </button>
              {showWorkflowList && (
                <ul className="m-0 list-none space-y-0.5 p-0" aria-label="Workflows">
                  {workflowNavItems.map((wf) => {
                    const active = activeNavItem === wf.id
                    const swatch = wf.accentClass ?? workflowAccentClass[wf.accent]
                    return (
                      <li key={wf.id}>
                        <WorkflowNavButton
                          collapsed
                          active={active}
                          label={wf.label}
                          accentClass={swatch}
                          onClick={() => onNavItemChange?.(wf.id)}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setWorkflowsOpen(!workflowsOpen)}
                aria-expanded={showWorkflowList}
                className="mb-0.5 mt-2 flex w-full items-center justify-between gap-1 rounded-lg px-1.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 first:mt-0 hover:bg-zinc-200/50"
              >
                <span>Workflows</span>
                <ChevronRightIcon
                  className={joinClasses(
                    'h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform',
                    showWorkflowList && 'rotate-90',
                  )}
                />
              </button>
              {showWorkflowList && (
                <ul className="m-0 list-none space-y-0.5 p-0" aria-label="Workflows">
                  {workflowNavItems.map((wf) => {
                    const active = activeNavItem === wf.id
                    const swatch = wf.accentClass ?? workflowAccentClass[wf.accent]
                    return (
                      <li key={wf.id}>
                        <WorkflowNavButton
                          collapsed={false}
                          active={active}
                          label={wf.label}
                          accentClass={swatch}
                          onClick={() => onNavItemChange?.(wf.id)}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 px-1.5 py-1.5">
          <FooterButton
            collapsed={sidebarCollapsed}
            label="Help"
            onClick={() => onNavItemChange?.('help')}
          />
          <FooterButton
            collapsed={sidebarCollapsed}
            label="Settings"
            onClick={() => onNavItemChange?.('settings')}
          />
        </div>
      </nav>

      <div ref={splitRef} className="relative flex min-h-0 min-w-0 flex-1">
        {/* One <OzAssistantPanel> instance so moving between centered and split layout does not unmount the chat. */}
        {hasAssistant && (
          <>
            <section
              className={joinClasses(
                'flex h-full min-h-0 min-w-0 flex-col',
                (isCenteredHome || isRailSolo || isRailWithSplit) &&
                  'transition-[width] duration-700 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                isCenteredHome && 'relative z-0 flex-1 bg-zinc-50/90',
                isRailSolo && 'flex-1 border-r border-zinc-200/90 bg-zinc-50',
                isRailWithSplit && 'shrink-0 bg-zinc-50',
              )}
              style={chatSectionStyle}
              aria-label="Command center chat"
            >
              {showCommandBar && (isRailSolo || isRailWithSplit) && (
                <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-zinc-200/90 bg-white px-3 text-[12px] font-semibold text-zinc-800">
                  <SparkleIcon className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
                  <span className="min-w-0 truncate">{commandCenterLabel}</span>
                </div>
              )}
              {isRailWithSplit && !showCommandBar && splitChatHeader !== null && (
                <header
                  className="flex h-9 shrink-0 items-center border-b border-zinc-200/90 bg-zinc-50/95 px-3"
                  aria-label="Chat thread"
                >
                  <h2 className="min-w-0 truncate text-[12px] font-semibold text-zinc-800">
                    {splitChatHeader === undefined ? 'Conversation' : splitChatHeader}
                  </h2>
                </header>
              )}
              <div
                className={joinClasses(
                  'min-h-0 min-w-0 flex-1',
                  isCenteredHome &&
                    'flex min-h-0 flex-1 items-stretch justify-center p-4 md:px-6 md:py-10',
                )}
              >
                <div
                  className={joinClasses(
                    isCenteredHome
                      ? 'flex h-full min-h-0 w-full min-w-0 max-w-2xl shrink-0 flex-col overflow-hidden'
                      : 'pointer-events-auto flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
                  )}
                >
                  {assistant ??
                    (assistantProps ? <OzAssistantPanel {...assistantProps} layout="center" /> : null)}
                </div>
              </div>
            </section>
            {isRailWithSplit && (
              <button
                type="button"
                role="separator"
                aria-orientation="vertical"
                aria-label="Drag to resize chat and generated content"
                title="Drag to resize"
                className="group relative w-2 shrink-0 cursor-col-resize border-x border-zinc-200/80 bg-zinc-100/80 touch-none select-none transition-colors duration-200"
                onPointerDown={onChatSplitPointerDown}
                onPointerMove={onChatSplitPointerMove}
                onPointerUp={endChatSplitDrag}
                onPointerCancel={endChatSplitDrag}
              >
                <span
                  className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-zinc-300/90 group-hover:bg-zinc-400/90"
                  aria-hidden="true"
                />
              </button>
            )}
          </>
        )}

        {showContextPanel && (isRailWithSplit || !hasAssistant) && (
          <main
            className={joinClasses(
              'relative flex min-h-0 min-w-0 flex-1 flex-col bg-white',
              isRailWithSplit && 'oz-context-surface-in',
            )}
            aria-label="Context"
          >
            {/**
             * `fullBleed` used to skip the page header entirely; workflows need the same eyebrow + title
             * bar as other routes, with only the *body* running edge-to-edge below it.
             */}
            {fullBleed && hideContextHeader ? (
              <div className="flex h-full min-h-0 flex-1 flex-col">{children}</div>
            ) : (
              <>
                {hideContextHeader ? (
                  !contextWide &&
                  (onContextPanelClose !== undefined || headerActions) && (
                    <div className="flex shrink-0 items-center justify-end gap-1 border-b border-zinc-200/90 bg-white px-3 py-2">
                      {headerActions}
                      {onContextPanelClose !== undefined && (
                        <button
                          type="button"
                          onClick={onContextPanelClose}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                          aria-label="Close context panel"
                          title="Close"
                        >
                          <CloseIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  <header
                    className={joinClasses(
                      'flex shrink-0 justify-between gap-4 border-b border-zinc-200/90 bg-white px-5 py-3.5',
                      contextHeaderDetailRow ? 'items-center' : 'items-start',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      {eyebrow !== undefined && !contextHeaderDetailRow && (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                          {eyebrow}
                        </p>
                      )}
                      {contextHeaderDetailRow ? (
                        <div className="min-w-0">{contextHeaderDetailRow}</div>
                      ) : (
                        <>
                          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-900">{title}</h1>
                          {subtitle !== undefined && (
                            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-600">{subtitle}</p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {headerActions}
                      {onContextPanelClose !== undefined && (
                        <button
                          type="button"
                          onClick={onContextPanelClose}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                          aria-label="Close context panel"
                          title="Close"
                        >
                          <CloseIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </header>
                )}
                <div
                  className={joinClasses(
                    'min-h-0 flex-1',
                    contextWide || fullBleed
                      ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                      : 'overflow-auto',
                  )}
                >
                  <div
                    className={joinClasses(
                      'mx-auto w-full',
                      contextWide || fullBleed
                        ? 'h-full min-h-0 min-w-0 flex-1 overflow-hidden p-0'
                        : joinClasses('max-w-[1600px] px-5', hideContextHeader ? 'py-3' : 'py-5'),
                    )}
                  >
                    {children}
                  </div>
                </div>
              </>
            )}
          </main>
        )}
      </div>
    </div>
  )
}
