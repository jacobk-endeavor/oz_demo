import { useState, type ReactNode } from 'react'
import { CloseIcon } from '../../shared/ui/icons'
import { joinClasses } from '../../shared/ui'
import type { LumberyardCallRow, LumberyardSource } from './lumberyardTypes'
import { TranscriptModal } from './TranscriptModal'

function customerNameFromPersona(persona: string): string {
  const n = persona.split(/\s*[—–]\s*/)[0]?.trim()
  return n || persona.trim()
}

function displayCustomer(row: LumberyardCallRow): string {
  if (row.customerName?.trim()) return row.customerName.trim()
  return customerNameFromPersona(row.customerPersona)
}

function formatCallDate(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—'
  const t = new Date(iso + 'T12:00:00')
  if (Number.isNaN(t.getTime())) return '—'
  return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function sourcePillLabel(s: LumberyardSource): string {
  if (s === 'call_recording') return 'Call'
  if (s === 'email') return 'Email'
  return 'Field notes'
}

const OUTLOOK_SRC = '/lead-source-logos/outlook.png'
const ENDEAVOR_SRC = '/endeavor-logo.png'

function SourcePillButton({
  row,
  onOpen,
}: {
  row: LumberyardCallRow
  onOpen: (row: LumberyardCallRow) => void
}) {
  const s = row.source
  const cls =
    s === 'call_recording'
      ? 'border-violet-200/80 bg-violet-50/90 text-violet-900 hover:bg-violet-100/90'
      : s === 'email'
        ? 'border-amber-200/80 bg-amber-50/90 text-amber-950 hover:bg-amber-100/90'
        : 'border-emerald-200/80 bg-emerald-50/90 text-emerald-950 hover:bg-emerald-100/90'
  const kind =
    s === 'call_recording' ? 'phone call' : s === 'email' ? 'email thread' : 'field voice note'
  const iconSrc = s === 'email' ? OUTLOOK_SRC : ENDEAVOR_SRC
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(row)
      }}
      className={joinClasses(
        'inline-flex max-w-full min-w-0 shrink-0 cursor-pointer items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-left text-[10px] font-semibold leading-tight transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500/50',
        cls,
      )}
      title={`Open ${kind}`}
      aria-label={`Open ${sourcePillLabel(s)} — ${row.title}`}
    >
      <img
        src={iconSrc}
        alt=""
        width={14}
        height={14}
        className={joinClasses(
          'h-3.5 shrink-0 object-contain',
          s === 'email' ? 'w-3.5' : 'w-auto max-w-[19px] max-h-3.5',
        )}
        loading="lazy"
        decoding="async"
      />
      <span className="min-w-0 truncate">{sourcePillLabel(s)}</span>
    </button>
  )
}

function ProductTags({ tags, fallbackLine }: { tags: string[]; fallbackLine: string }) {
  const list = tags.length > 0 ? tags : [fallbackLine]
  return (
    <div
      className="flex min-w-0 flex-wrap content-start gap-1.5"
      title={list.join(' · ')}
    >
      {list.map((t) => (
        <span
          key={t}
          className="inline-flex max-w-full rounded-md border border-sky-200/75 bg-sky-50/95 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-sky-950"
        >
          <span className="min-w-0">{t}</span>
        </span>
      ))}
    </div>
  )
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={joinClasses(
        'border border-zinc-200/90 bg-zinc-50/95 px-2 py-2.5 text-left align-bottom text-sm font-bold leading-tight text-zinc-900',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function LumberyardCallsTable({
  calls,
  onClose,
  phaseKey,
  selectedRowIds = [],
  onRowToggleContext,
}: {
  calls: LumberyardCallRow[]
  onClose?: () => void
  phaseKey: string
  /** Row ids added to the chat context (e.g. `<Row N>` tags). */
  selectedRowIds?: string[]
  /** Toggle a row in the chat context; index is 1-based to match the # column. */
  onRowToggleContext?: (row: LumberyardCallRow, displayIndex: number) => void
}) {
  const [openCall, setOpenCall] = useState<LumberyardCallRow | null>(null)

  return (
    <div
      className="group/table relative flex h-full min-h-0 w-full min-w-0 flex-col bg-white text-zinc-900 antialiased shadow-none selection:bg-sky-100/70"
      data-testid="lumberyard-calls-table"
    >
      <div className="shrink-0 border-b border-zinc-200/90 bg-zinc-50/95 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2 pr-0 sm:pr-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight text-zinc-900">Lumberyard activity</h2>
            <p className="text-xs leading-relaxed text-zinc-500">
              Click a row to add it to the chat context. Click a source tag to open the full view.
            </p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200/90 bg-white/95 text-zinc-500 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-zinc-300/90 hover:bg-zinc-50/90 hover:text-zinc-800 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500/50"
              aria-label="Close"
              title="Close"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-x-auto overflow-y-auto [scrollbar-gutter:stable]">
        <table
          className="w-full min-w-[1040px] border-collapse text-left [border-spacing:0]"
          key={phaseKey}
        >
          <thead className="sticky top-0 z-[2] border-b border-zinc-200/90 bg-zinc-50/95 shadow-[0_1px_0_0_rgba(228,228,231,0.9)]">
            <tr>
              <th
                scope="col"
                className="w-12 min-w-[3rem] border border-zinc-200/90 bg-zinc-50/95 py-2.5 pr-2.5 pl-2.5 text-right text-sm font-bold tabular-nums text-zinc-900"
              >
                #
              </th>
              <Th className="min-w-[9rem] pl-0">Customer</Th>
              <Th className="min-w-[7.5rem] pl-0">Source</Th>
              <Th className="min-w-[8.5rem] pl-0">Location</Th>
              <Th className="min-w-[240px] pl-0">Products requested</Th>
              <Th className="min-w-[8.5rem] pl-0">Date</Th>
            </tr>
          </thead>
          <tbody>
            {calls.map((row, index) => {
              const productTags = row.productTags?.filter(Boolean) ?? []
              const customer = displayCustomer(row)
              const selected = selectedRowIds.includes(row.id)
              return (
                <tr
                  key={row.id}
                  className={joinClasses(
                    'lead-table-row-anim',
                    'group/row',
                    index % 2 === 0 ? 'bg-white' : 'bg-zinc-50/55',
                    'cursor-pointer transition-colors duration-100 hover:bg-sky-50/35',
                    selected && 'ring-2 ring-inset ring-sky-400/70 bg-sky-50/40',
                  )}
                  style={{ animationDelay: `${Math.min(index, 30) * 50}ms` }}
                  onClick={() => onRowToggleContext?.(row, index + 1)}
                >
                  <td
                    className="border border-zinc-200/80 bg-inherit px-2.5 py-2 pr-2.5 pl-2 text-right text-xs tabular-nums leading-[1.45] text-zinc-500"
                  >
                    {index + 1}
                  </td>
                  <td
                    className="max-w-0 min-w-0 border border-zinc-200/80 bg-inherit px-2.5 py-2.5 pl-0 first:pl-2 last:pr-2"
                  >
                    <div
                      className="truncate text-[13px] font-semibold leading-[1.45] text-zinc-900"
                      title={customer}
                    >
                      {customer}
                    </div>
                  </td>
                  <td
                    className="max-w-0 min-w-0 border border-zinc-200/80 bg-inherit px-2.5 py-2.5 pl-0 first:pl-2 last:pr-2"
                  >
                    <div className="inline-flex min-w-0">
                      <SourcePillButton row={row} onOpen={setOpenCall} />
                    </div>
                  </td>
                  <td
                    className="max-w-0 min-w-0 border border-zinc-200/80 bg-inherit px-2.5 py-2.5 pl-0 first:pl-2 last:pr-2"
                  >
                    <div
                      className="truncate text-[13px] leading-[1.45] text-zinc-700"
                      title={row.location}
                    >
                      {row.location || '—'}
                    </div>
                  </td>
                  <td
                    className="max-w-0 min-w-0 border border-zinc-200/80 bg-inherit px-2.5 py-2.5 pl-0 align-top first:pl-2 last:pr-2"
                  >
                    <ProductTags tags={productTags} fallbackLine={row.title} />
                  </td>
                  <td
                    className="max-w-0 min-w-0 border border-zinc-200/80 bg-inherit px-2.5 py-2.5 pl-0 text-[13px] leading-[1.45] first:pl-2 last:pr-2"
                  >
                    <div
                      className="whitespace-nowrap text-zinc-800 tabular-nums"
                      title={formatCallDate(row.callDate)}
                    >
                      {formatCallDate(row.callDate)}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 border-t border-zinc-200/90 bg-zinc-50/60 px-3 py-2.5 text-xs tabular-nums text-zinc-500">
        Showing {calls.length} {calls.length === 1 ? 'activity' : 'activities'}
      </div>
      <TranscriptModal call={openCall} onClose={() => setOpenCall(null)} />
    </div>
  )
}
