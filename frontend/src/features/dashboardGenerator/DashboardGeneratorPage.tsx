import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button, joinClasses } from '../../shared/ui'
import { CloseIcon, ShareIcon, TrashIcon } from '../../shared/ui/icons'
import {
  cloneDashboardChartSpecsForExport,
  type DashboardChartSpec,
  buildDefaultChartsFromData,
  generateChartsFromPrompt,
  newBatchId,
} from './dashboardChartFromPrompt'
import { takeQueuedDashboardChartGroups } from './dashboardImportBridge'
import {
  PublishDashboardModal,
  type PublishedDashboardSnapshot,
} from './PublishDashboardModal'

/** Short workspace title from the user’s build prompt (first non-empty line). */
export function deriveDashboardTitleFromPrompt(prompt: string): string {
  const first =
    prompt
      .split(/\n/)
      .map((s) => s.trim())
      .find((line) => line.length > 0) ?? ''
  const oneLine = first.replace(/\s+/g, ' ').trim()
  if (!oneLine) return 'Dashboard'
  const max = 56
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

/**
 * Shared “insight card” table styling: {@link BarChartDataTable} (sheet) and
 * `CustomerDemandAndProfitContextPanel` (P&L, realized) stay visually aligned.
 */
export const insightChartTable = {
  wrap: 'overflow-x-auto bg-white px-4 pb-3',
  table:
    'w-full min-w-[240px] border-collapse text-left [border-spacing:0] text-[13px] leading-snug',
  thead: 'sticky top-0 z-[1] border-b border-slate-200/90 bg-white/90 backdrop-blur-[2px]',
  thLeft:
    'py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 first:pl-0 last:pr-0',
  thRight:
    'py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 first:pl-0 last:pr-0',
  tdProduct:
    'min-w-0 border-b border-slate-100 py-2.5 align-top text-[13px] font-medium leading-snug first:pl-0 last:pr-0 text-slate-800',
  /** Numeric / measure column: inner `div.tabular-nums` for main figure (+ optional data bar). */
  tdValue:
    'border-b border-slate-100 py-2.5 align-top text-right text-[13px] font-mono tabular-nums leading-snug first:pl-0 last:pr-0 text-slate-700',
  tr: 'transition-colors last:[&>td]:border-b-0 hover:bg-slate-50/90',
  dataBarTrack: 'mt-1 h-[3px] w-full overflow-hidden rounded-full bg-slate-200/80',
  dataBarFill: 'h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500',
} as const

/** After building charts, user can submit this (alone or after a build line) to focus the P&L chart in the right-hand display. */
const DISPLAY_PNL_CMD = /put\s+it\s+in\s+(the\s+)?display\s*p\s*&\s*l/i

const DASHBOARD_CHART_DRAG_MIME = 'application/x-oz-dashboard-chart'

function parseChartDragPayload(raw: string): { chartId: string; batchId: string } | null {
  try {
    const o = JSON.parse(raw) as unknown
    if (typeof o !== 'object' || o === null) return null
    const chartId = (o as { chartId?: unknown }).chartId
    const batchId = (o as { batchId?: unknown }).batchId
    if (typeof chartId === 'string' && typeof batchId === 'string') return { chartId, batchId }
  } catch {
    return null
  }
  return null
}

function pickChartForDisplayPnl(chartList: DashboardChartSpec[]): DashboardChartSpec | null {
  if (chartList.length === 0) return null
  const byTitle = chartList.find((c) => /p\s*&\s*l|profit|realized|warehouse|margin/i.test(c.title))
  return byTitle ?? chartList[chartList.length - 1]!
}

export type DashboardChartBatch = {
  id: string
  /** Shown as a **Your charts** group title (card) on the Dashboards page. */
  label: string
  charts: DashboardChartSpec[]
}

const CARD_ACCENTS: { from: string; to: string }[] = [
  { from: 'from-teal-400', to: 'to-cyan-700' },
  { from: 'from-indigo-400', to: 'to-violet-700' },
  { from: 'from-amber-400', to: 'to-orange-600' },
  { from: 'from-fuchsia-400', to: 'to-pink-700' },
]

function chartDescription(c: DashboardChartSpec): string {
  const n = c.series.length
  if (c.kind === 'line') {
    return `Line chart · ${n} period${n === 1 ? '' : 's'} of demand.`
  }
  return `Bar chart · ${n} product or source categories.`
}

function microSparklineValues(chart: DashboardChartSpec): number[] {
  return chart.series.map((p) => p.value).slice(0, 12)
}

function MicroChartGlyph({ chart }: { chart: DashboardChartSpec }) {
  const vals = microSparklineValues(chart)
  if (vals.length === 0) return null
  const max = Math.max(...vals, 1)
  const w = 48
  const h = 20
  if (chart.kind === 'line') {
    const n = vals.length
    const pts = vals
      .map((v, i) => {
        const x = n <= 1 ? w / 2 : (i / (n - 1)) * w
        const y = h - 2 - (v / max) * (h - 4)
        return { x, y }
      })
      .map((p) => `${p.x},${p.y}`)
      .join(' ')
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="h-5 w-12 text-white" aria-hidden>
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          points={pts}
        />
      </svg>
    )
  }
  const barW = w / Math.min(vals.length, 8)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-5 w-12" aria-hidden>
      {vals.slice(0, 8).map((v, i) => {
        const bh = (v / max) * (h - 2)
        return (
          <rect
            key={i}
            x={i * barW + 1}
            y={h - bh}
            width={barW - 2}
            height={Math.max(1, bh)}
            fill="rgb(255 255 255 / 0.92)"
            rx="0.5"
          />
        )
      })}
    </svg>
  )
}

function BarChartDataTable({
  chart,
  compact = false,
  sheetStyle = false,
  showValueDataBars = false,
  sheetClipTop = false,
}: {
  chart: DashboardChartSpec
  compact?: boolean
  /** “Insight card” look (slate + indigo data bars) used in the customer-demand context panel. */
  sheetStyle?: boolean
  showValueDataBars?: boolean
  /** When a sheet title row sits above, omit the table’s top border so the frame is continuous. */
  sheetClipTop?: boolean
}) {
  /** First data column (product / source). */
  const thFirst = compact ? 'py-1 pr-1 pl-2 text-[10px] leading-tight' : 'py-2.5 pr-2 pl-3'
  const thNum = compact ? 'px-1 py-1 text-[10px] leading-tight' : 'px-2 py-2.5'
  const tdFirst = compact ? 'py-0.5 pr-1 pl-2' : 'py-2 pr-2 pl-3'
  const tdNum = compact ? 'px-1 py-0.5' : 'px-2 py-2'
  const wrap = sheetStyle
    ? joinClasses(
        insightChartTable.wrap,
        sheetClipTop
          ? ''
          : 'overflow-hidden rounded-2xl ring-1 ring-slate-200/80 shadow-sm shadow-slate-900/5',
        compact && 'shrink-0',
      )
    : joinClasses('overflow-x-auto rounded-2xl border border-stone-200/90 bg-white shadow-sm shadow-stone-900/5', compact && 'shrink-0')
  const maxVal = Math.max(...chart.series.map((b) => b.value), 1)
  return (
    <div
      className={joinClasses(
        wrap,
        compact && !sheetStyle && 'max-h-[min(40vh,220px)] overflow-y-auto [scrollbar-gutter:stable]',
      )}
    >
      <table
        className={joinClasses(
          'w-full min-w-[240px] border-collapse text-left [border-spacing:0]',
          sheetStyle ? insightChartTable.table : compact ? 'text-[11px]' : 'text-sm',
        )}
        data-testid="dashboard-bar-chart-data-table"
      >
        <thead
          className={joinClasses(
            'sticky top-0 z-[1]',
            sheetStyle
              ? insightChartTable.thead
              : 'border-b border-stone-200/90 bg-stone-50/95 text-[11px] uppercase tracking-[0.12em] text-stone-500',
          )}
        >
          <tr>
            <th
              scope="col"
              className={joinClasses(
                sheetStyle ? insightChartTable.thLeft : 'border-b border-stone-200/90 text-left font-bold text-stone-600',
                !sheetStyle && thFirst,
              )}
            >
              {chart.title.toLowerCase().includes('source') ? 'Source' : 'Product line'}
            </th>
            <th
              scope="col"
              className={joinClasses(
                sheetStyle
                  ? insightChartTable.thRight
                  : 'border-b border-stone-200/90 text-right font-bold text-stone-600',
                !sheetStyle && thNum,
              )}
            >
              Units requested
            </th>
          </tr>
        </thead>
        <tbody className={sheetStyle ? '' : 'divide-y divide-stone-200'}>
          {chart.series.map((row, i) => (
            <tr
              key={row.label}
              className={
                sheetStyle
                  ? insightChartTable.tr
                  : i % 2 === 0
                    ? 'bg-white'
                    : 'bg-stone-50/70'
              }
            >
              <td
                className={joinClasses(
                  'font-medium',
                  sheetStyle
                    ? insightChartTable.tdProduct
                    : 'text-stone-900',
                  !sheetStyle && (compact ? 'text-[11px]' : 'text-sm'),
                  !sheetStyle && tdFirst,
                )}
              >
                {row.label}
              </td>
              <td
                className={joinClasses(
                  sheetStyle
                    ? insightChartTable.tdValue
                    : 'font-mono tabular-nums text-stone-700',
                  compact ? (sheetStyle ? 'text-[13px]' : 'text-[10px]') : 'text-sm',
                  !sheetStyle && tdNum,
                )}
              >
                {showValueDataBars && sheetStyle ? (
                  <div>
                    <div className="tabular-nums">{row.value}</div>
                    <div className={insightChartTable.dataBarTrack}>
                      <div
                        className={insightChartTable.dataBarFill}
                        style={{ width: `${Math.max(4, (row.value / maxVal) * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  row.value
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BarChartBlock({
  chart,
  compact = false,
  sheetStyle = false,
  sheetDataTableClipTop = false,
  /** Preview rail: horizontal bars only (no data table). */
  visualOnly = false,
}: {
  chart: DashboardChartSpec
  compact?: boolean
  sheetStyle?: boolean
  sheetDataTableClipTop?: boolean
  visualOnly?: boolean
}) {
  if (sheetStyle) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-w-0 flex-1">
          <BarChartDataTable
            chart={chart}
            compact={compact}
            sheetStyle
            showValueDataBars
            sheetClipTop={sheetDataTableClipTop}
          />
        </div>
      </div>
    )
  }
  const max = Math.max(...chart.series.map((b) => b.value), 1)
  const barH = compact ? 'h-1.5' : 'h-2'
  const gap = compact ? 'space-y-1' : 'space-y-2.5'
  const pad = compact ? 'p-2.5' : 'p-4'
  const barPanel = (
    <div
      className={joinClasses(
        'min-w-0 rounded-2xl border border-stone-200/90 bg-white shadow-sm shadow-stone-900/5 ring-1 ring-stone-900/[0.04]',
        pad,
        visualOnly && 'w-full max-w-full',
      )}
    >
      {!visualOnly ? (
        <p className={joinClasses('font-medium text-stone-500', compact ? 'mb-1.5 text-[10px]' : 'mb-3 text-xs')}>
          Chart
        </p>
      ) : null}
      <ul
        className={joinClasses(
          gap,
          'min-h-0 min-w-0',
          visualOnly
            ? 'max-h-[min(52vh,360px)] overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]'
            : compact && 'max-h-[min(38vh,200px)] overflow-y-auto [scrollbar-gutter:stable]',
        )}
        aria-label={chart.title}
      >
        {chart.series.map((row) => (
          <li key={row.label}>
            <div
              className={joinClasses(
                'mb-0.5 flex items-center justify-between gap-1 text-stone-600',
                compact ? 'text-[10px] leading-tight' : 'text-xs',
              )}
            >
              <span className="min-w-0 truncate font-medium text-stone-800">{row.label}</span>
              <span className="shrink-0 font-mono tabular-nums text-stone-500">{row.value}</span>
            </div>
            <div className={joinClasses('overflow-hidden rounded-full bg-stone-200/90', barH)}>
              <div
                className={joinClasses('h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500', barH)}
                style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )

  if (visualOnly) {
    return <div className="min-h-0 min-w-0 w-full max-w-full overflow-x-hidden">{barPanel}</div>
  }

  return (
    <div
      className={joinClasses(
        'flex min-h-0 min-w-0 flex-1',
        compact ? 'flex-col gap-2' : 'flex-col gap-4 lg:flex-row lg:items-stretch',
      )}
    >
      <div
        className={joinClasses('min-w-0 flex-1', !compact && 'lg:max-w-md lg:shrink-0', compact && 'max-h-[min(42vh,240px)]')}
      >
        <BarChartDataTable chart={chart} compact={compact} />
      </div>
      <div className="min-w-0 flex-1">{barPanel}</div>
    </div>
  )
}

function LineChartBlock({ chart }: { chart: DashboardChartSpec }) {
  const s = chart.series
  const max = Math.max(...s.map((b) => b.value), 1)
  const w = 400
  const h = 140
  const padL = 28
  const padR = 12
  const padT = 10
  const padB = 24
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const n = s.length
  const points = s.map((p, i) => {
    const x = n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW
    const y = padT + innerH * (1 - p.value / max)
    return { x, y, label: p.label, value: p.value }
  })
  const d = points.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <div className="rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm shadow-stone-900/5 ring-1 ring-stone-900/[0.04]">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-auto w-full min-w-[280px] max-w-full"
          role="img"
          aria-label={chart.title}
        >
          <line x1={padL} y1={padT + innerH} x2={w - padR} y2={padT + innerH} stroke="#e7e5e4" strokeWidth="1" />
          <polyline
            fill="none"
            stroke="rgb(99 102 241)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={d}
          />
          {points.map((p) => (
            <circle key={p.label} cx={p.x} cy={p.y} r="3.5" fill="rgb(99 102 241)" />
          ))}
        </svg>
        <div className="mt-1 flex flex-wrap justify-between gap-1 text-[10px] text-stone-500">
          {points.map((p) => (
            <span key={p.label} className="min-w-0 max-w-[3.5rem] truncate" title={p.label}>
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChartDetailView({ chart, visualOnly = false }: { chart: DashboardChartSpec; visualOnly?: boolean }) {
  return chart.kind === 'line' ? (
    <div className="min-h-0 min-w-0 w-full max-w-full overflow-x-hidden">
      <LineChartBlock chart={chart} />
    </div>
  ) : (
    <BarChartBlock chart={chart} visualOnly={visualOnly} />
  )
}

type ChartTileProps = {
  chart: DashboardChartSpec
  index: number
  selected: boolean
  published: boolean
  onSelect: () => void
  onDelete: () => void
}

function ChartTileCard({
  chart,
  index,
  selected,
  published,
  onSelect,
  onDelete,
}: ChartTileProps) {
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length]
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onSelect}
        className={joinClasses(
          'group relative z-0 flex w-full flex-col rounded-2xl border border-stone-200/85 bg-white px-3.5 pb-3.5 pt-10 text-left shadow-sm shadow-stone-900/[0.04] ring-1 ring-stone-900/[0.03] transition',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500/45',
          selected
            ? 'border-indigo-400/90 ring-2 ring-indigo-200/90 shadow-md shadow-indigo-900/10'
            : 'hover:border-stone-300 hover:shadow-md hover:shadow-stone-900/6',
        )}
        aria-pressed={selected}
        aria-label={`${chart.title}. ${chartDescription(chart)}${published ? ' Published.' : ''}`}
        data-testid="dashboard-chart-tile"
      >
        <div
          className={joinClasses(
            'mb-2.5 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br shadow-inner',
            accent.from,
            accent.to,
          )}
        >
          <MicroChartGlyph chart={chart} />
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold tracking-tight text-stone-900">{chart.title}</h3>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-stone-500">{chartDescription(chart)}</p>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onDelete()
        }}
        className="pointer-events-auto absolute right-1.5 top-1.5 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition hover:bg-red-50 hover:text-red-700"
        title="Remove this chart"
        aria-label={`Delete ${chart.title}`}
        data-testid="dashboard-chart-tile-delete"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

/**
 * Dashboard Studio layout: hero prompt, chart tiles, preview rail, published list.
 */
export function DashboardGeneratorPage() {
  /** Auto-set from the latest **Build charts** prompt, chat import, or starter default. */
  const [dashboardTitle, setDashboardTitle] = useState('Customer demand')
  const [batches, setBatches] = useState<DashboardChartBatch[]>(() => [
    { id: newBatchId(), label: 'Starter', charts: buildDefaultChartsFromData() },
  ])
  const [draft, setDraft] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [lastBuildLine, setLastBuildLine] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** When set, the right preview shows every chart in that batch (vs a single tile). */
  const [previewBatchId, setPreviewBatchId] = useState<string | null>(null)
  /** True after “put it in the display P&L” until the user picks another tile or group. */
  const [displayPnlHighlight, setDisplayPnlHighlight] = useState(false)
  const importConsumed = useRef(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishChartId, setPublishChartId] = useState<string | null>(null)
  const [publishedByChartId, setPublishedByChartId] = useState<Record<string, PublishedDashboardSnapshot>>(
    {},
  )

  const charts = useMemo(() => batches.flatMap((b) => b.charts), [batches])

  const selected = useMemo(
    () => charts.find((c) => c.id === selectedId) ?? null,
    [charts, selectedId],
  )

  const previewBatch = useMemo(
    () => batches.find((b) => b.id === previewBatchId) ?? null,
    [batches, previewBatchId],
  )

  const showPreviewPanel = selected !== null || previewBatch !== null

  const defaultModalTitle = useMemo(() => {
    const ch = publishChartId ? charts.find((c) => c.id === publishChartId) : null
    if (ch) {
      return `${ch.title} — ${dashboardTitle}`
    }
    return `${dashboardTitle} · ${new Date().toLocaleDateString()}`
  }, [charts, publishChartId, dashboardTitle])

  const modalPublished = publishChartId ? (publishedByChartId[publishChartId] ?? null) : null

  useEffect(() => {
    if (selectedId && !charts.some((c) => c.id === selectedId)) {
      setSelectedId(null)
    }
  }, [charts, selectedId])

  useEffect(() => {
    if (previewBatchId && !batches.some((b) => b.id === previewBatchId)) {
      setPreviewBatchId(null)
    }
  }, [batches, previewBatchId])

  useEffect(() => {
    const live = new Set(charts.map((c) => c.id))
    setPublishedByChartId((pub) => {
      const next = { ...pub }
      let changed = false
      for (const id of Object.keys(next)) {
        if (!live.has(id)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : pub
    })
  }, [charts])

  useEffect(() => {
    if (importConsumed.current) return
    importConsumed.current = true
    const queued = takeQueuedDashboardChartGroups()
    if (queued.length === 0) return
    const appended: DashboardChartBatch[] = queued.map((g) => ({
      id: newBatchId(),
      label: g.label || 'From chat',
      charts: cloneDashboardChartSpecsForExport(g.charts),
    }))
    setBatches((prev) => [...prev, ...appended])
    const last = queued[queued.length - 1]!
    if (last.lastBuildLine) setLastBuildLine(last.lastBuildLine)
    if (last.dashboardTitle) {
      setDashboardTitle(last.dashboardTitle)
    } else if (last.label?.trim()) {
      setDashboardTitle(deriveDashboardTitleFromPrompt(last.label))
    }
  }, [])

  const runBuild = useCallback(async (userText: string) => {
    const raw = userText.trim()
    const stripped = raw.replace(DISPLAY_PNL_CMD, '').trim()
    const hasDisplayCmd = DISPLAY_PNL_CMD.test(raw)
    const onlyDisplayCmd = hasDisplayCmd && stripped.length === 0

    if (onlyDisplayCmd) {
      setChatBusy(true)
      try {
        const list = batches.flatMap((b) => b.charts)
        const pick = pickChartForDisplayPnl(list)
        if (pick) {
          setPreviewBatchId(null)
          setSelectedId(pick.id)
          setDisplayPnlHighlight(true)
          setLastBuildLine(
            'Showing that chart in Display · P&L. Click a tile or group title to change the preview.',
          )
        } else {
          setLastBuildLine('No charts yet—use **Build charts** first, then **put it in the display P&L**.')
        }
      } finally {
        setChatBusy(false)
      }
      return
    }

    setChatBusy(true)
    setLastBuildLine(null)
    try {
      const prompt = stripped.length > 0 ? stripped : raw
      if (!prompt) return
      const next = await generateChartsFromPrompt(prompt)
      const label = `Build · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      setDashboardTitle(deriveDashboardTitleFromPrompt(prompt))
      setBatches((prev) => [...prev, { id: newBatchId(), label, charts: next }])
      let line = `Added ${next.length} chart(s) in a new group: ${next.map((c) => `${c.title} (${c.kind})`).join(' · ')}`
      line += ' Click a **chart tile** or the **group title** to open the preview panel.'
      if (hasDisplayCmd) {
        const pick = pickChartForDisplayPnl(next)
        if (pick) {
          setPreviewBatchId(null)
          setSelectedId(pick.id)
          setDisplayPnlHighlight(true)
          line += ' Placed the P&L-focused chart in Display · P&L.'
        }
      }
      setLastBuildLine(line)
    } finally {
      setChatBusy(false)
    }
  }, [batches])

  const handleSubmitPrompt = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const t = draft.trim()
      if (!t || chatBusy) return
      setDraft('')
      await runBuild(t)
    },
    [draft, chatBusy, runBuild],
  )

  const openPublish = useCallback((chartId: string) => {
    setPublishChartId(chartId)
    setPublishOpen(true)
  }, [])

  const handleModalPublish = useCallback(
    (snap: PublishedDashboardSnapshot) => {
      if (!publishChartId) return
      setPublishedByChartId((prev) => ({ ...prev, [publishChartId]: snap }))
    },
    [publishChartId],
  )

  const handleModalUnpublish = useCallback(() => {
    if (!publishChartId) return
    setPublishedByChartId((prev) => {
      const next = { ...prev }
      delete next[publishChartId!]
      return next
    })
  }, [publishChartId])

  const closePreview = useCallback(() => {
    setSelectedId(null)
    setPreviewBatchId(null)
    setDisplayPnlHighlight(false)
  }, [])

  const removeChart = useCallback((chartId: string) => {
    setBatches((prev) =>
      prev
        .map((b) => ({ ...b, charts: b.charts.filter((c) => c.id !== chartId) }))
        .filter((b) => b.charts.length > 0),
    )
  }, [])

  const removeBatch = useCallback((batchId: string) => {
    setBatches((prev) => prev.filter((b) => b.id !== batchId))
    setPreviewBatchId((pid) => (pid === batchId ? null : pid))
  }, [])

  const moveChartToBatch = useCallback((chartId: string, fromBatchId: string, toBatchId: string) => {
    if (fromBatchId === toBatchId) return
    setBatches((prev) => {
      let extracted: DashboardChartSpec | null = null
      const afterPull = prev.map((b) => {
        if (b.id !== fromBatchId) return b
        const c = b.charts.find((x) => x.id === chartId)
        if (!c) return b
        extracted = c
        return { ...b, charts: b.charts.filter((x) => x.id !== chartId) }
      })
      if (!extracted) return prev
      return afterPull
        .map((b) => (b.id === toBatchId ? { ...b, charts: [...b.charts, extracted!] } : b))
        .filter((b) => b.charts.length > 0)
    })
  }, [])

  return (
    <div
      className="relative mx-auto flex min-h-full w-full min-w-0 max-w-[1680px] flex-col bg-[radial-gradient(ellipse_120%_80%_at_50%_-30%,rgb(99_102_241/0.11),transparent_55%)] px-4 py-6 pb-12 sm:px-6"
      data-testid="dashboard-workflow"
    >
      <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-10">
        <div
          className={joinClasses(
            'mx-auto flex min-w-0 w-full flex-col gap-10',
            showPreviewPanel && 'lg:max-w-[760px]',
          )}
        >
      <section>
        <div className="mb-3">
          <h1 className="text-base font-semibold tracking-tight text-stone-900 sm:text-lg">
            Describe the charts you want in natural language
          </h1>
        </div>
        <form
          onSubmit={handleSubmitPrompt}
          className="rounded-2xl border border-stone-200/80 bg-white/80 p-1 shadow-md shadow-stone-900/[0.06] ring-1 ring-stone-900/[0.04] backdrop-blur-sm"
          data-testid="dashboard-builder-chat"
        >
          <label htmlFor="dashboard-hero-prompt" className="sr-only">
            Chart instructions
          </label>
          <textarea
            id="dashboard-hero-prompt"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            disabled={chatBusy}
            placeholder="Describe your task in natural language and we will generate dashboard charts for you… (e.g. bar of product lines, line chart of monthly demand, demand by lead source.)"
            className="w-full resize-none rounded-xl border-0 bg-transparent px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:ring-0 focus:outline-none disabled:opacity-50"
          />
          <div className="flex flex-col gap-2 border-t border-stone-200/80 px-2 py-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="submit"
              disabled={chatBusy || !draft.trim()}
              className="shrink-0"
            >
              {chatBusy ? 'Building…' : '→ Build charts'}
            </Button>
          </div>
        </form>
        {lastBuildLine && (
          <p className="mt-2 text-sm text-stone-600" role="status">
            {lastBuildLine}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Your charts</h2>
        {charts.length === 0 ? (
          <p className="text-sm text-stone-500">No charts yet. Add a prompt above and use Build charts.</p>
        ) : (
          <div className="flex flex-col gap-4" data-testid="dashboard-your-charts-batches">
            {batches.map((batch) => {
              const batchIdx = batches.findIndex((b) => b.id === batch.id)
              const indexBase = batches
                .slice(0, batchIdx)
                .reduce((sum, b) => sum + b.charts.length, 0)
              if (batch.charts.length === 0) return null
              const publishTargetId = (() => {
                const sel = selectedId && batch.charts.some((c) => c.id === selectedId) ? selectedId : null
                return sel ?? batch.charts[0]!.id
              })()
              return (
                <article
                  key={batch.id}
                  className={joinClasses(
                    'rounded-2xl border bg-white/70 p-3.5 shadow-sm shadow-stone-900/[0.05] ring-1 ring-stone-900/[0.04] backdrop-blur-[2px] transition',
                    previewBatchId === batch.id
                      ? 'border-indigo-400/90 ring-2 ring-indigo-200/85 shadow-md shadow-indigo-900/10'
                      : 'border-stone-200/85',
                  )}
                  data-testid="dashboard-your-charts-group"
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const payload = parseChartDragPayload(e.dataTransfer.getData(DASHBOARD_CHART_DRAG_MIME))
                    if (!payload) return
                    moveChartToBatch(payload.chartId, payload.batchId, batch.id)
                  }}
                >
                  <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-xl text-left transition hover:bg-stone-50/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500/45"
                      onClick={() => {
                        setPreviewBatchId(batch.id)
                        setSelectedId(null)
                        setDisplayPnlHighlight(false)
                      }}
                      aria-pressed={previewBatchId === batch.id}
                      aria-label={`Preview all ${batch.charts.length} charts in ${batch.label}`}
                    >
                      <h3 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{batch.label}</h3>
                      <p className="mt-0.5 text-[10px] font-normal normal-case tracking-normal text-stone-400">
                        Preview entire set ({batch.charts.length} charts)
                      </p>
                    </button>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 gap-1 px-2.5 text-xs text-red-700 ring-red-200/80 hover:bg-red-50"
                        onClick={() => removeBatch(batch.id)}
                        data-testid="dashboard-your-charts-group-delete"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        Delete group
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
                        onClick={() => openPublish(publishTargetId)}
                        data-testid="dashboard-your-charts-group-publish"
                      >
                        <ShareIcon className="h-3.5 w-3.5" />
                        Publish
                      </Button>
                    </div>
                  </div>
                  <ul
                    className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 min-[900px]:grid-cols-3 xl:grid-cols-4"
                    role="list"
                  >
                    {batch.charts.map((c, i) => (
                      <li
                        key={c.id}
                        draggable
                        className="cursor-grab active:cursor-grabbing"
                        title="Drag to another chart group"
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            DASHBOARD_CHART_DRAG_MIME,
                            JSON.stringify({ chartId: c.id, batchId: batch.id }),
                          )
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                      >
                        <ChartTileCard
                          chart={c}
                          index={indexBase + i}
                          selected={selectedId === c.id}
                          published={!!publishedByChartId[c.id]}
                          onSelect={() => {
                            setPreviewBatchId(null)
                            setDisplayPnlHighlight(false)
                            setSelectedId(c.id === selectedId ? null : c.id)
                          }}
                          onDelete={() => removeChart(c.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="border-t border-stone-200/80 pt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Published charts</h2>
          <input
            type="search"
            placeholder="Search (demo)"
            className="max-w-xs rounded-xl border border-stone-200/90 bg-white px-2.5 py-1 text-xs text-stone-600 shadow-sm"
            disabled
            title="Not wired in the demo"
          />
        </div>
        {Object.keys(publishedByChartId).length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-400">You have not published any charts yet.</p>
        ) : (
          <ul className="space-y-2" role="list">
            {Object.entries(publishedByChartId).map(([id, snap]) => {
              const t = charts.find((c) => c.id === id)
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200/90 bg-white/80 px-3 py-2 text-sm shadow-sm shadow-stone-900/[0.04]"
                >
                  <span className="font-medium text-stone-800">{t?.title ?? 'Chart'}</span>
                  <code className="min-w-0 max-w-full truncate text-xs text-stone-500">{snap.shareUrl}</code>
                </li>
              )
            })}
          </ul>
        )}
      </section>
        </div>

        {showPreviewPanel ? (
          <aside
            className={joinClasses(
              'flex min-h-0 w-full shrink-0 flex-col border-stone-200/85 bg-white/75',
              'lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:w-[min(440px,38vw)] lg:min-w-[300px] lg:overflow-hidden',
              'lg:border-l lg:border-t-0 lg:shadow-[-12px_0_32px_-12px_rgb(28_25_23/0.08)]',
              'border-t pt-6 backdrop-blur-md lg:pt-0',
            )}
            aria-label="Chart preview"
            data-testid="dashboard-display-panel"
          >
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-6 sm:px-5">
            {previewBatch ? (
              <div className="min-h-0 min-w-0 space-y-6">
                <div className="mb-1 flex flex-nowrap items-center justify-between gap-3 border-b border-stone-200/70 pb-3">
                  <h2 className="min-w-0 shrink text-xs font-semibold uppercase leading-none tracking-[0.14em] text-stone-500">
                    Chart set
                  </h2>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => openPublish(previewBatch.charts[0]!.id)}
                      className="h-8 shrink-0 gap-1 text-xs"
                    >
                      <ShareIcon className="h-3.5 w-3.5" />
                      Publish
                    </Button>
                    <button
                      type="button"
                      onClick={closePreview}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200/90 bg-white text-stone-500 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-800"
                      aria-label="Close preview"
                      title="Close preview"
                      data-testid="dashboard-display-close"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="text-xs leading-snug text-stone-500">{previewBatch.label}</p>
                {previewBatch.charts.map((c) => (
                  <div key={c.id} className="min-h-0 border-b border-stone-200/70 pb-6 last:border-b-0 last:pb-0">
                    <p className="mb-2 text-sm font-semibold leading-snug text-stone-900">{c.title}</p>
                    <ChartDetailView chart={c} visualOnly />
                  </div>
                ))}
              </div>
            ) : selected ? (
              <div className="min-h-0 min-w-0">
                <div className="mb-3 flex flex-nowrap items-center justify-between gap-3 border-b border-stone-200/70 pb-3">
                  <h2 className="min-w-0 shrink text-xs font-semibold uppercase leading-none tracking-[0.14em] text-stone-500">
                    {displayPnlHighlight ? 'Display · P&L' : 'Selected chart'}
                  </h2>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => openPublish(selected.id)}
                      className="h-8 shrink-0 gap-1 text-xs"
                    >
                      <ShareIcon className="h-3.5 w-3.5" />
                      Publish
                    </Button>
                    <button
                      type="button"
                      onClick={closePreview}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200/90 bg-white text-stone-500 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-800"
                      aria-label="Close preview"
                      title="Close preview"
                      data-testid="dashboard-display-close"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mb-3 text-sm font-semibold leading-snug text-stone-900">{selected.title}</p>
                <div className="min-h-0 min-w-0">
                  <ChartDetailView chart={selected} visualOnly />
                </div>
              </div>
            ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      <PublishDashboardModal
        open={publishOpen}
        onClose={() => {
          setPublishOpen(false)
          setPublishChartId(null)
        }}
        defaultTitle={defaultModalTitle}
        published={modalPublished}
        onPublish={handleModalPublish}
        onUnpublish={handleModalUnpublish}
      />
    </div>
  )
}
