import { useCallback, useMemo } from 'react'
import { Button } from '../../shared/ui'
import { BarChartBlock, insightChartTable } from './DashboardGeneratorPage'
import {
  cloneDashboardChartSpecsForExport,
  type DashboardChartSpec,
  heuristicsChartsForPrompt,
} from './dashboardChartFromPrompt'
import { enqueueDashboardChartGroup } from './dashboardImportBridge'
import { buildProductProfitDemoRows } from './profitPerProductDemoData'

function formatK(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Delay between each chart block (sequential “reveal” in the right-hand column). */
const INSIGHT_CHART_STAGGER_MS = 2000

/** Insight-card panel: soft slate, indigo–violet data emphasis, no gray “spreadsheet” chrome. */
const cardSurface =
  'overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm shadow-slate-900/5'
const blockTitle = 'px-4 pt-3.5 pb-2 text-sm font-semibold tracking-tight text-slate-800'

function RealizedProfitSheet({ chart }: { chart: DashboardChartSpec }) {
  const max = Math.max(...chart.series.map((b) => b.value), 1)
  return (
    <div className={cardSurface}>
      <div className={blockTitle}>{chart.title}</div>
      <div className={insightChartTable.wrap}>
        <table className={insightChartTable.table}>
          <thead className={insightChartTable.thead}>
            <tr>
              <th className={insightChartTable.thLeft}>Product</th>
              <th className={insightChartTable.thRight}>Realized ($K)</th>
            </tr>
          </thead>
          <tbody>
            {chart.series.map((row) => (
              <tr key={row.label} className={insightChartTable.tr}>
                <td className={insightChartTable.tdProduct}>{row.label}</td>
                <td className={insightChartTable.tdValue}>
                  <div>
                    <div className="tabular-nums">{formatK(row.value)}</div>
                    <div className={insightChartTable.dataBarTrack}>
                      <div
                        className={insightChartTable.dataBarFill}
                        style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export type CustomerDemandProfitExportInfo = { groupLabel: string }

/**
 * Single scrollable column: **Products requested** (units), optionally **P&L** table + **realized profit** when the user asked for profit in chat.
 * One export sends the visible charts to Dashboards (no “full demand” chart).
 */
export function CustomerDemandAndProfitContextPanel({
  includePnl,
  onExported,
}: {
  /** When true, user’s message requested profit / P&L; show table + bars and include realized chart in export. */
  includePnl: boolean
  onExported?: (info: CustomerDemandProfitExportInfo) => void
}) {
  const consumerCharts = useMemo(
    () => heuristicsChartsForPrompt('I need a dashboard for my accounts'),
    [],
  )

  const rows = useMemo(() => buildProductProfitDemoRows(), [])

  const pnlRowsByRealized = useMemo(
    () => [...rows].sort((a, b) => b.realizedProfitK - a.realizedProfitK),
    [rows],
  )

  const realizedChart = useMemo((): DashboardChartSpec => {
    const series = rows
      .map((x) => ({ label: x.product, value: x.realizedProfitK }))
      .sort((a, b) => b.value - a.value)
    return {
      id: 'oz-profit-realized',
      title: 'Realized profit by product ($K)',
      kind: 'bar',
      series,
    }
  }, [rows])

  const exportGroup = useCallback(() => {
    const groupLabel = includePnl ? 'Consumer demand & P&L (chat)' : 'Consumer demand (chat)'
    const combined = includePnl ? [...consumerCharts, realizedChart] : [...consumerCharts]
    enqueueDashboardChartGroup({
      label: groupLabel,
      charts: cloneDashboardChartSpecsForExport(combined),
      lastBuildLine: `Imported from chat: ${groupLabel} · ${combined.length} chart(s) (demo).`,
      dashboardTitle: 'Customer demand',
    })
    onExported?.({ groupLabel })
    window.location.hash = '#/dashboards'
  }, [consumerCharts, includePnl, onExported, realizedChart])

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-white"
      data-testid="oz-inline-customer-demand-profit"
    >
      <div className="shrink-0 border-b border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <h2 className="shrink-0 text-sm font-semibold tracking-tight text-slate-800">
            {includePnl ? 'Customer demand and P&L' : 'Customer demand'}
          </h2>
          <Button
            type="button"
            className="w-full shrink-0 text-sm sm:min-w-0 sm:w-auto"
            onClick={exportGroup}
          >
            Export this group to Dashboards
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/25 p-2 [scrollbar-gutter:stable] sm:p-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {consumerCharts.map((c, i) => (
            <section
              key={c.id}
              className="oz-insight-chart-enter min-h-0"
              aria-label={c.title}
              style={{ animationDelay: `${i * INSIGHT_CHART_STAGGER_MS}ms` }}
            >
              <div className={cardSurface}>
                <div className={blockTitle}>{c.title}</div>
                <BarChartBlock chart={c} compact sheetStyle sheetDataTableClipTop />
              </div>
            </section>
          ))}

          {includePnl && (
            <section>
              <div
                className="oz-insight-chart-enter"
                style={{
                  animationDelay: `${consumerCharts.length * INSIGHT_CHART_STAGGER_MS}ms`,
                }}
              >
                <div className={cardSurface}>
                  <div className={blockTitle}>P&L by product ($K)</div>
                  <div className={`${insightChartTable.wrap} [scrollbar-gutter:stable] min-w-0`}>
                  <table className={`${insightChartTable.table} min-w-[400px]`}>
                    <thead className={insightChartTable.thead}>
                      <tr>
                        <th className={insightChartTable.thLeft}>Product</th>
                        <th className={insightChartTable.thRight}>Purchase ($K)</th>
                        <th className={insightChartTable.thRight}>Sale ($K)</th>
                        <th className={insightChartTable.thRight}>Realized ($K)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pnlRowsByRealized.map((r) => (
                        <tr key={r.product} className={insightChartTable.tr}>
                          <td className={`${insightChartTable.tdProduct} max-w-[7rem]`}>
                            {r.product}
                          </td>
                          <td className={insightChartTable.tdValue}>
                            <div className="tabular-nums">{formatK(r.purchaseCostK)}</div>
                          </td>
                          <td className={insightChartTable.tdValue}>
                            <div className="tabular-nums">{formatK(r.salePriceK)}</div>
                          </td>
                          <td className={insightChartTable.tdValue}>
                            <div className="tabular-nums">{formatK(r.realizedProfitK)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              </div>
              <div
                className="oz-insight-chart-enter mt-4"
                style={{
                  animationDelay: `${(consumerCharts.length + 1) * INSIGHT_CHART_STAGGER_MS}ms`,
                }}
              >
                <RealizedProfitSheet chart={realizedChart} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
