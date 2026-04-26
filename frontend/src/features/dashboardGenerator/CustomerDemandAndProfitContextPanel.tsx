import { useCallback, useMemo } from 'react'
import { Button } from '../../shared/ui'
import {
  BarChartBlock,
} from './DashboardGeneratorPage'
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

function RealizedProfitBars({ chart }: { chart: DashboardChartSpec }) {
  const max = Math.max(...chart.series.map((b) => b.value), 1)
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-2">
      <p className="mb-1.5 text-[10px] font-medium text-zinc-500">{chart.title}</p>
      <ul
        className="max-h-[min(32vh,160px)] space-y-1 overflow-y-auto [scrollbar-gutter:stable]"
        aria-label={chart.title}
      >
        {chart.series.map((row) => (
          <li key={row.label}>
            <div className="mb-0.5 flex items-center justify-between gap-1 text-[10px] leading-tight text-zinc-600">
              <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{row.label}</span>
              <span className="shrink-0 font-mono tabular-nums text-zinc-500">{formatK(row.value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200/90">
              <div
                className="h-1.5 rounded-full bg-sky-500"
                style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export type CustomerDemandProfitExportInfo = { groupLabel: string }

/**
 * Single scrollable column: **Products requested** demand, optionally **P&L** table + **realized profit** when the user asked for profit in chat.
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

  const realizedChart = useMemo((): DashboardChartSpec => {
    return {
      id: 'oz-profit-realized',
      title: 'Realized profit by product ($K)',
      kind: 'bar',
      series: rows.map((x) => ({ label: x.product, value: x.realizedProfitK })),
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
      <div className="shrink-0 border-b border-zinc-200/80 bg-zinc-50/80 px-3 py-2">
        <h2 className="text-sm font-semibold text-zinc-900">
          {includePnl ? 'Customer demand and P&L' : 'Customer demand'}
        </h2>
        <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
          {includePnl
            ? 'Products requested (demand index) and a synthetic per-line purchase, sale, and realized view. Export once to send the full set to Dashboards.'
            : 'Products requested (demand index) from the consumer-request demo. Ask for profit or P&L by product in chat to add the synthetic P&L table and realized chart. Export adds the visible chart(s) to Dashboards.'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-gutter:stable] sm:p-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {consumerCharts.map((c) => (
            <section key={c.id} className="min-h-0" aria-label={c.title}>
              <h3 className="mb-1.5 text-xs font-semibold text-zinc-700">{c.title}</h3>
              <BarChartBlock chart={c} compact />
            </section>
          ))}

          {includePnl && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold text-zinc-700">
                {'P&L by product (synthetic, $K)'}
              </h3>
              <div className="max-h-[min(40vh,240px)] overflow-y-auto overflow-x-auto rounded-xl border border-zinc-200/80 bg-white [scrollbar-gutter:stable]">
                <table className="w-full min-w-[400px] border-collapse text-left text-[11px] [border-spacing:0]">
                  <thead className="sticky top-0 z-[1] bg-zinc-50/95 text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                    <tr>
                      <th className="border-b border-zinc-200/90 py-1 pl-2 pr-1 text-left font-bold">Product</th>
                      <th className="border-b border-zinc-200/90 px-1 py-1 text-right font-bold">Purchase ($K)</th>
                      <th className="border-b border-zinc-200/90 px-1 py-1 text-right font-bold">Sale ($K)</th>
                      <th className="border-b border-zinc-200/90 py-1 pr-2 pl-1 text-right font-bold">Realized ($K)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {rows.map((r, i) => (
                      <tr key={r.product} className={i % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50'}>
                        <td className="max-w-[7rem] py-0.5 pr-1 pl-2 font-medium text-zinc-900">{r.product}</td>
                        <td className="px-1 py-0.5 text-right font-mono tabular-nums text-zinc-600">
                          {formatK(r.purchaseCostK)}
                        </td>
                        <td className="px-1 py-0.5 text-right font-mono tabular-nums text-zinc-600">
                          {formatK(r.salePriceK)}
                        </td>
                        <td className="py-0.5 pr-2 pl-1 text-right font-mono tabular-nums text-sky-800">
                          {formatK(r.realizedProfitK)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2">
                <RealizedProfitBars chart={realizedChart} />
              </div>
            </section>
          )}

          <Button type="button" className="w-full shrink-0 text-sm" onClick={exportGroup}>
            Export this group to Dashboards
          </Button>
        </div>
      </div>
    </div>
  )
}
