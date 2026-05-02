import type { ReactNode } from 'react'
import { useContext } from 'react'
import { makeOzDisplayTableRowAttachment } from '../../shared/tableRowContext'
import { OzChatPanelShellContext } from '../../shared/ui/ozChatPanelUi'
import { JobCostEstimateRecapSheet } from '../fieldApp/JobCostEstimateRecapSheet'
import { LumberInvoicePreviewSheet } from '../quoteAutomation/LumberInvoicePreviewSheet'

/** Props passed from the slide-out shell into the registered inner renderer (§6.1). */
export type OzPanelRendererProps = {
  /** `display_table` / `display_panel` tool_result payload for this panel id (see docs/code-sandbox-and-artifact-generation.md §2.3). */
  payload: unknown
}

// --- display_table (kind === 'table' on <panel/> for results originating from display_table) ---

export type OzDisplayTableColumn = {
  key: string
  label: string
  kind?: 'number' | 'currency' | 'text'
}

export type OzDisplayTableRow = {
  id: string
  cells: Record<string, string | number | boolean | null | undefined>
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function readDisplayTablePayload(payload: unknown): {
  title: string
  columns: OzDisplayTableColumn[]
  rows: OzDisplayTableRow[]
  scope?: string
} | null {
  if (!isRecord(payload)) return null
  const title = payload.title
  const columns = payload.columns
  const rows = payload.rows
  if (typeof title !== 'string' || !Array.isArray(columns) || !Array.isArray(rows)) return null
  const scope = payload.scope
  return {
    title,
    columns: columns as OzDisplayTableColumn[],
    rows: rows as OzDisplayTableRow[],
    scope: typeof scope === 'string' ? scope : undefined,
  }
}

function formatCell(column: OzDisplayTableColumn, raw: unknown): string {
  if (raw === null || raw === undefined) return '—'
  if (column.kind === 'currency' && typeof raw === 'number') {
    return raw.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
  }
  if (column.kind === 'number' && typeof raw === 'number') {
    return raw.toLocaleString(undefined, { maximumFractionDigits: 4 })
  }
  return String(raw)
}

/** Tabular slide-out content for `display_table` tool results (§6.1). */
export function OzDataTablePanel({ payload }: OzPanelRendererProps) {
  const shell = useContext(OzChatPanelShellContext)
  const parsed = readDisplayTablePayload(payload)
  if (!parsed) {
    return (
      <OzPanelEmptyState
        title="Table data unavailable"
        detail="The panel payload was missing or not valid tabular data."
      />
    )
  }
  const { title, columns, rows, scope: tableScope } = parsed
  const panelId = shell?.openPanel?.panelId ?? ''
  const canPin = Boolean(shell?.pinDisplayTableRow && panelId)

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-300/90 bg-white shadow-sm"
      data-testid="oz-panel-table"
    >
      <header className="border-b border-zinc-200 bg-zinc-50/90 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Data table</p>
        <h3 className="mt-1 text-sm font-semibold text-zinc-900">{title}</h3>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="sticky top-0 border-b border-zinc-200 bg-zinc-50/95 text-[11px] uppercase tracking-[0.12em] text-zinc-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-2 font-semibold">
                  {c.label}
                </th>
              ))}
              {canPin ? (
                <th className="w-0 whitespace-nowrap px-2 py-2 text-right font-semibold">Chat</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r, idx) => (
              <tr key={r.id} data-row-id={r.id}>
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-2.5 text-zinc-800">
                    {formatCell(c, r.cells[c.key])}
                  </td>
                ))}
                {canPin ? (
                  <td className="w-0 whitespace-nowrap px-2 py-2 text-right align-middle">
                    <button
                      type="button"
                      className="rounded-md border border-sky-300/70 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-900 shadow-sm hover:bg-sky-50"
                      onClick={() =>
                        shell?.pinDisplayTableRow?.(
                          makeOzDisplayTableRowAttachment({
                            panelId,
                            tableScope,
                            row: r,
                            displayIndex: idx + 1,
                          }),
                        )
                      }
                    >
                      Pin row
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// --- display_panel: invoice / job cost (existing sheets; richer wiring lands in P1a-4) ---

function readInvoicePanelPayload(payload: unknown): {
  heading?: string
  refLine?: string
  billToLine?: string
  shipLine?: string
  totalLabel?: string
} {
  if (!isRecord(payload)) return {}
  const propsObj = isRecord(payload.props) ? payload.props : payload
  const heading = propsObj.heading ?? propsObj.title
  const refLine = propsObj.ref_line ?? propsObj.reference
  return {
    heading: typeof heading === 'string' ? heading : undefined,
    refLine: typeof refLine === 'string' ? refLine : undefined,
    billToLine: typeof propsObj.bill_to === 'string' ? propsObj.bill_to : undefined,
    shipLine: typeof propsObj.ship_to === 'string' ? propsObj.ship_to : undefined,
    totalLabel: typeof propsObj.total_label === 'string' ? propsObj.total_label : undefined,
  }
}

export function OzInvoicePreviewPanel(props: OzPanelRendererProps) {
  const extra = readInvoicePanelPayload(props.payload)
  return <LumberInvoicePreviewSheet className="min-h-0 flex-1" {...extra} />
}

function readJobCostPayload(payload: unknown): {
  initialOverrides?: Partial<Record<string, string | number>>
  caption?: string
} {
  if (!isRecord(payload)) return {}
  const initialOverrides = payload.initialOverrides
  const caption = payload.caption
  return {
    initialOverrides:
      initialOverrides && typeof initialOverrides === 'object' && !Array.isArray(initialOverrides)
        ? (initialOverrides as Partial<Record<string, string | number>>)
        : undefined,
    caption: typeof caption === 'string' ? caption : undefined,
  }
}

export function OzJobCostRecapPanel({ payload }: OzPanelRendererProps) {
  const { initialOverrides, caption } = readJobCostPayload(payload)
  return (
    <JobCostEstimateRecapSheet
      initialOverrides={initialOverrides}
      caption={caption}
      className="min-h-0 flex-1"
    />
  )
}

// --- Placeholders for sandbox-era panels (chart / doc outline / thread braindump) ---

function OzPanelEmptyState({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col justify-center gap-2 rounded-2xl border border-dashed border-zinc-300/90 bg-zinc-50/80 px-6 py-8 text-center">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {detail ? <p className="text-xs text-zinc-600">{detail}</p> : null}
      {children}
    </section>
  )
}

export function OzChartPanel({ payload }: OzPanelRendererProps) {
  const hint =
    isRecord(payload) && typeof payload.title === 'string'
      ? payload.title
      : 'Charts from `display_panel` will render here once the chart pipeline is wired.'
  return (
    <div data-testid="oz-panel-chart">
      <OzPanelEmptyState title="Chart" detail={hint} />
    </div>
  )
}

export function OzDocxOutlinePanel({ payload }: OzPanelRendererProps) {
  const outline =
    isRecord(payload) && payload.outline !== undefined
      ? JSON.stringify(payload.outline, null, 2)
      : null
  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-300/90 bg-white shadow-sm"
      data-testid="oz-panel-docx-outline"
    >
      <header className="border-b border-zinc-200 bg-zinc-50/90 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Document outline</p>
        <h3 className="mt-1 text-sm font-semibold text-zinc-900">DOCX structure</h3>
      </header>
      {outline ? (
        <pre className="min-h-0 flex-1 overflow-auto p-4 text-left text-xs text-zinc-800">{outline}</pre>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <OzPanelEmptyState
            title="No outline payload"
            detail="Pass structured outline data in `display_panel` props."
          />
        </div>
      )}
    </section>
  )
}

export function OzThreadDirectionPanel({ payload }: OzPanelRendererProps) {
  const text =
    isRecord(payload) && typeof payload.summary === 'string'
      ? payload.summary
      : isRecord(payload) && typeof payload.text === 'string'
        ? payload.text
        : null
  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-300/90 bg-white p-4 shadow-sm"
      data-testid="oz-panel-thread-direction"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Thread direction</p>
      {text ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{text}</p>
      ) : (
        <OzPanelEmptyState
          title="Direction summary"
          detail="Optional `summary` or `text` in props describes the model’s current understanding of the thread."
        />
      )}
    </section>
  )
}

/** Rendered when `panel.kind` is missing from the registry (should be rare). */
export function OzUnsupportedPanelKind({ payload }: OzPanelRendererProps) {
  return (
    <OzPanelEmptyState
      title="Unsupported panel"
      detail="No renderer is registered for this panel kind."
    >
      {payload !== undefined ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-zinc-100 p-3 text-left text-[10px] text-zinc-700">
          {JSON.stringify(payload, null, 2)}
        </pre>
      ) : null}
    </OzPanelEmptyState>
  )
}
