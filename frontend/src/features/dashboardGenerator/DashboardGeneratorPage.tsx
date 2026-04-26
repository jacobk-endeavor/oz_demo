import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button, Tag, joinClasses } from '../../shared/ui'
import { ShareIcon, SparkleIcon } from '../../shared/ui/icons'
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

function makeMsgId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** After building charts, user can submit this (alone or after a build line) to focus the P&L chart in the right-hand display. */
const DISPLAY_PNL_CMD = /put\s+it\s+in\s+(the\s+)?display\s*p\s*&\s*l/i

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
  { from: 'from-emerald-400', to: 'to-emerald-600' },
  { from: 'from-violet-400', to: 'to-violet-600' },
  { from: 'from-amber-300', to: 'to-amber-500' },
  { from: 'from-rose-400', to: 'to-rose-600' },
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

function BarChartDataTable({ chart, compact = false }: { chart: DashboardChartSpec; compact?: boolean }) {
  const th = compact ? 'py-1 pr-0.5 pl-2 text-[10px] leading-tight' : 'py-2.5 pr-1 pl-3'
  const thMid = compact ? 'py-1 pr-1 pl-0 text-[10px] leading-tight' : 'py-2.5 pr-2 pl-0'
  const thNum = compact ? 'px-1 py-1 text-[10px] leading-tight' : 'px-2 py-2.5'
  const td = compact ? 'py-0.5 pr-0.5 pl-2' : 'py-2 pr-1 pl-3'
  const tdMid = compact ? 'py-0.5 pr-1 pl-0' : 'py-2 pr-2 pl-0'
  const tdNum = compact ? 'px-1 py-0.5' : 'px-2 py-2'
  const wrap = joinClasses('overflow-x-auto rounded-2xl border border-zinc-200/80 bg-white', compact && 'shrink-0')
  return (
    <div className={joinClasses(wrap, compact && 'max-h-[min(40vh,220px)] overflow-y-auto [scrollbar-gutter:stable]')}>
      <table
        className={joinClasses(
          'w-full min-w-[240px] border-collapse text-left [border-spacing:0]',
          compact ? 'text-[11px]' : 'text-sm',
        )}
        data-testid="dashboard-bar-chart-data-table"
      >
        <thead className="sticky top-0 z-[1] border-b border-zinc-200/90 bg-zinc-50/95 text-[11px] uppercase tracking-[0.12em] text-zinc-500">
          <tr>
            <th
              scope="col"
              className={joinClasses(
                compact ? 'w-7' : 'w-10',
                'border-b border-zinc-200/90 text-left font-bold text-zinc-600',
                th,
              )}
            >
              #
            </th>
            <th
              scope="col"
              className={joinClasses('border-b border-zinc-200/90 text-left font-bold text-zinc-600', thMid)}
            >
              {chart.title.toLowerCase().includes('source') ? 'Source' : 'Product line'}
            </th>
            <th
              scope="col"
              className={joinClasses('border-b border-zinc-200/90 text-right font-bold text-zinc-600', thNum)}
            >
              <span title="Same synthetic demand index as the Milwaukee distributor demo">Demand index</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {chart.series.map((row, i) => (
            <tr
              key={row.label}
              className={i % 2 === 0 ? 'bg-white' : 'bg-zinc-50/55'}
            >
              <td
                className={joinClasses(
                  'text-right tabular-nums text-zinc-500',
                  compact ? 'text-[10px]' : 'text-xs',
                  td,
                )}
              >
                {i + 1}
              </td>
              <td
                className={joinClasses('font-medium text-zinc-900', compact ? 'text-[11px]' : 'text-sm', tdMid)}
              >
                {row.label}
              </td>
              <td
                className={joinClasses(
                  'text-right font-mono tabular-nums text-zinc-600',
                  compact ? 'text-[10px]' : 'text-sm',
                  tdNum,
                )}
              >
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BarChartBlock({ chart, compact = false }: { chart: DashboardChartSpec; compact?: boolean }) {
  const max = Math.max(...chart.series.map((b) => b.value), 1)
  const barH = compact ? 'h-1.5' : 'h-2'
  const gap = compact ? 'space-y-1' : 'space-y-2.5'
  const pad = compact ? 'p-2.5' : 'p-4'
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
      <div className={joinClasses('min-w-0 flex-1 rounded-2xl border border-zinc-200/80 bg-white', pad)}>
        <p className={joinClasses('font-medium text-zinc-500', compact ? 'mb-1.5 text-[10px]' : 'mb-3 text-xs')}>
          Chart
        </p>
        <ul className={joinClasses(gap, 'min-h-0', compact && 'max-h-[min(38vh,200px)] overflow-y-auto [scrollbar-gutter:stable]')} aria-label={chart.title}>
          {chart.series.map((row) => (
            <li key={row.label}>
              <div
                className={joinClasses(
                  'mb-0.5 flex items-center justify-between gap-1 text-zinc-600',
                  compact ? 'text-[10px] leading-tight' : 'text-xs',
                )}
              >
                <span className="min-w-0 truncate font-medium text-zinc-800">{row.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-zinc-500">{row.value}</span>
              </div>
              <div className={joinClasses('overflow-hidden rounded-full bg-zinc-200/90', barH)}>
                <div
                  className={joinClasses('h-full rounded-full bg-sky-500', barH)}
                  style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
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
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-auto w-full min-w-[280px] max-w-full"
          role="img"
          aria-label={chart.title}
        >
          <line x1={padL} y1={padT + innerH} x2={w - padR} y2={padT + innerH} stroke="#e4e4e7" strokeWidth="1" />
          <polyline
            fill="none"
            stroke="rgb(2 132 199)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={d}
          />
          {points.map((p) => (
            <circle key={p.label} cx={p.x} cy={p.y} r="3.5" fill="rgb(2 132 199)" />
          ))}
        </svg>
        <div className="mt-1 flex flex-wrap justify-between gap-1 text-[10px] text-zinc-500">
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

function ChartDetailView({ chart }: { chart: DashboardChartSpec }) {
  return chart.kind === 'line' ? (
    <LineChartBlock chart={chart} />
  ) : (
    <BarChartBlock chart={chart} />
  )
}

type ChartTileProps = {
  chart: DashboardChartSpec
  index: number
  selected: boolean
  published: boolean
  onSelect: () => void
  onPublishClick: () => void
}

function ChartTileCard({ chart, index, selected, published, onSelect, onPublishClick }: ChartTileProps) {
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length]
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onSelect}
        className={joinClasses(
          'group relative z-0 flex w-full flex-col rounded-2xl border bg-white p-3 text-left transition',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500/50',
          selected
            ? 'border-sky-400 ring-2 ring-sky-200/80'
            : 'border-zinc-200/90 hover:border-zinc-300 hover:shadow-sm',
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
        <h3 className="line-clamp-2 text-sm font-semibold text-zinc-900">{chart.title}</h3>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-500">{chartDescription(chart)}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <Tag tone="zinc" className="text-[10px]">
            {chart.kind}
          </Tag>
          {published ? (
            <Tag tone="emerald" dot className="text-[10px]">
              Live
            </Tag>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onPublishClick()
        }}
        className="pointer-events-auto absolute right-1.5 top-1.5 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-sky-700"
        title="Publish this chart"
        aria-label={`Publish ${chart.title}`}
        data-testid="dashboard-chart-tile-publish"
      >
        <ShareIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

/**
 * Clay-inspired layout: hero prompt, chart tiles, detail, browse published.
 */
export function DashboardGeneratorPage() {
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
    if (last.dashboardTitle) setDashboardTitle(last.dashboardTitle)
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

  return (
    <div
      className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-[1680px] flex-col overflow-hidden px-4 py-6 sm:px-6"
      data-testid="dashboard-workflow"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-8 lg:flex-row lg:items-start lg:gap-8">
        <div
          className={joinClasses(
            'mx-auto flex min-h-0 min-w-0 flex-1 flex-col gap-8 overflow-y-auto [scrollbar-gutter:stable]',
            showPreviewPanel && 'lg:max-w-[760px]',
          )}
        >
      <section>
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
            <SparkleIcon className="h-4 w-4" aria-hidden />
          </span>
          <h1 className="text-base font-semibold text-zinc-900 sm:text-lg">
            Describe the charts you want in natural language
          </h1>
        </div>
        <div className="mb-3 flex max-w-md flex-wrap items-center gap-2 text-sm text-zinc-600">
          <label htmlFor="dashboard-workspace-title" className="shrink-0">
            Title
          </label>
          <input
            id="dashboard-workspace-title"
            value={dashboardTitle}
            onChange={(e) => setDashboardTitle(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-800"
            aria-label="Dashboard workspace title"
          />
        </div>
        <form
          onSubmit={handleSubmitPrompt}
          className="rounded-2xl border border-zinc-200/90 bg-zinc-50/50 p-1 shadow-sm"
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
            className="w-full resize-none rounded-xl border-0 bg-transparent px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:ring-0 focus:outline-none disabled:opacity-50"
          />
          <div className="flex flex-col gap-2 border-t border-zinc-200/80 px-2 py-2 sm:flex-row sm:items-center sm:justify-end">
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
          <p className="mt-2 text-sm text-zinc-600" role="status">
            {lastBuildLine}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-800">Your charts</h2>
        {charts.length === 0 ? (
          <p className="text-sm text-zinc-500">No charts yet. Add a prompt above and use Build charts.</p>
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
                    'rounded-2xl border bg-zinc-50/50 p-3 shadow-sm transition',
                    previewBatchId === batch.id
                      ? 'border-sky-400 ring-2 ring-sky-200/80'
                      : 'border-zinc-200/80',
                  )}
                  data-testid="dashboard-your-charts-group"
                >
                  <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-lg text-left transition hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500/50"
                      onClick={() => {
                        setPreviewBatchId(batch.id)
                        setSelectedId(null)
                        setDisplayPnlHighlight(false)
                      }}
                      aria-pressed={previewBatchId === batch.id}
                      aria-label={`Preview all ${batch.charts.length} charts in ${batch.label}`}
                    >
                      <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{batch.label}</h3>
                      <p className="mt-0.5 text-[10px] font-normal normal-case tracking-normal text-zinc-400">
                        Preview entire set ({batch.charts.length} charts)
                      </p>
                    </button>
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
                  <ul
                    className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 min-[900px]:grid-cols-3 xl:grid-cols-4"
                    role="list"
                  >
                    {batch.charts.map((c, i) => (
                      <li key={c.id}>
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
                          onPublishClick={() => openPublish(c.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
        )}
        <p className="mt-2 text-center text-xs text-zinc-400">
          <strong>Click a group title</strong> to preview the whole set, or <strong>a tile</strong> for one chart—the
          preview column appears only while you are viewing something. After a build, type{' '}
          <strong>put it in the display P&L</strong> to focus the profit-style chart. Use the share icon to publish.
        </p>
      </section>

      <section className="border-t border-zinc-200/80 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800">Published charts</h2>
          <input
            type="search"
            placeholder="Search (demo)"
            className="max-w-xs rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600"
            disabled
            title="Not wired in the demo"
          />
        </div>
        {Object.keys(publishedByChartId).length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">You have not published any charts yet.</p>
        ) : (
          <ul className="space-y-2" role="list">
            {Object.entries(publishedByChartId).map(([id, snap]) => {
              const t = charts.find((c) => c.id === id)
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-zinc-800">{t?.title ?? 'Chart'}</span>
                  <code className="min-w-0 max-w-full truncate text-xs text-zinc-500">{snap.shareUrl}</code>
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
              'flex w-full shrink-0 flex-col border-zinc-200/80 bg-zinc-50/40 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:w-[min(440px,38vw)] lg:min-w-[300px] lg:overflow-y-auto lg:border-l lg:border-t-0 lg:px-5 lg:pb-6',
              'border-t pt-6 lg:pt-0',
            )}
            aria-label="Chart preview"
            data-testid="dashboard-display-panel"
          >
            {previewBatch ? (
              <div className="min-h-0 min-w-0 space-y-6">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-zinc-800">Chart set</h2>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => openPublish(previewBatch.charts[0]!.id)}
                    className="h-8 shrink-0 text-xs"
                  >
                    <ShareIcon className="h-3.5 w-3.5" />
                    Publish
                  </Button>
                </div>
                <p className="text-xs leading-snug text-zinc-500">{previewBatch.label}</p>
                {previewBatch.charts.map((c) => (
                  <div key={c.id} className="min-h-0 border-b border-zinc-200/70 pb-6 last:border-b-0 last:pb-0">
                    <p className="mb-2 text-xs font-medium text-zinc-700">{c.title}</p>
                    <ChartDetailView chart={c} />
                  </div>
                ))}
              </div>
            ) : selected ? (
              <div className="min-h-0 min-w-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-zinc-800">
                    {displayPnlHighlight ? 'Display · P&L' : 'Selected chart'}
                  </h2>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => openPublish(selected.id)}
                    className="h-8 shrink-0 text-xs"
                  >
                    <ShareIcon className="h-3.5 w-3.5" />
                    Publish
                  </Button>
                </div>
                <p className="mb-3 text-xs leading-snug text-zinc-500">{selected.title}</p>
                <div className="min-h-0">
                  <ChartDetailView chart={selected} />
                </div>
              </div>
            ) : null}
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
