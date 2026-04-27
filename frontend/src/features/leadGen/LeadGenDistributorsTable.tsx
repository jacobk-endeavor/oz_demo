import { useLayoutEffect, useState, type ReactNode } from 'react'
import { CloseIcon } from '../../shared/ui/icons'
import { joinClasses } from '../../shared/ui'
import { formatCompactUsd } from './leadSpendProfiles'
import type { DistributorRow } from './milwaukeeDistributorsMock'
import { MILWAUKEE_LEAD_RESULT_TOTAL } from './milwaukeeDistributorsMock'
import type { LeadTableViewState, SortColumn } from './leadGenTableModel'
import { LeadSourcePill } from './leadSourceMeta'

function Th({
  children,
  className,
  col,
  view,
  onSort,
}: {
  children: ReactNode
  className?: string
  col: SortColumn
  view: LeadTableViewState
  onSort: (col: SortColumn) => void
}) {
  const isP = view.sortPrimary === col
  const isS = view.sortSecondary === col
  const tip = isP
    ? `Sorted ${view.sortPrimaryDir} (primary) — click to reverse`
    : isS
      ? 'Sub-sorted (secondary) — click header for primary'
      : 'Set as primary sort'
  return (
    <th
      scope="col"
      className={joinClasses(
        'border border-zinc-200/90 bg-zinc-50/95 px-3 py-2.5 text-left align-bottom text-sm font-bold leading-tight text-zinc-900',
        className,
      )}
    >
      <button
        type="button"
        title={tip}
        onClick={() => onSort(col)}
        className={joinClasses(
          '-mx-0.5 flex w-full min-w-0 items-center justify-between gap-1.5 rounded px-1.5 py-0.5 text-left text-inherit transition-colors hover:bg-zinc-200/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-sky-500/40',
          isP && 'text-zinc-900',
        )}
      >
        <span className="min-w-0 truncate pr-0.5">{children}</span>
        {isP && (
          <span className="shrink-0 text-sm font-bold text-sky-600" aria-hidden>
            {view.sortPrimaryDir === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </button>
    </th>
  )
}

function Td({
  children,
  muted,
  className,
  indexColumn,
  multiline,
  fullTitle,
  noInnerTruncate,
}: {
  children: ReactNode
  muted?: boolean
  className?: string
  indexColumn?: boolean
  multiline?: boolean
  /** Full string for `title` tooltip (e.g. long description) */
  fullTitle?: string
  noInnerTruncate?: boolean
}) {
  const base = indexColumn
    ? 'border border-zinc-200/80 bg-inherit px-3 py-2.5 text-[12px] leading-[1.45] whitespace-nowrap first:pl-3 last:pr-3'
    : 'max-w-0 min-w-0 border border-zinc-200/80 bg-inherit px-3 py-3 text-[13px] leading-[1.45] first:pl-3 last:pr-3'
  return (
    <td
      className={joinClasses(
        base,
        muted ? 'text-zinc-500 tabular-nums' : 'text-zinc-800',
        multiline && 'align-top',
        className,
      )}
    >
      {indexColumn ? (
        children
      ) : noInnerTruncate ? (
        <div
          className={joinClasses(
            multiline &&
              'line-clamp-4 min-h-0 whitespace-normal break-words text-left leading-relaxed text-zinc-700',
          )}
          title={fullTitle}
        >
          {children}
        </div>
      ) : (
        <div
          className="min-w-0 truncate py-px leading-snug"
          title={typeof children === 'string' ? (fullTitle ?? children) : fullTitle}
        >
          {children}
        </div>
      )}
    </td>
  )
}

const DEFAULT_LEAD_ROW_STAGGER_MS = 200
const SKELETON_ROW_COUNT = 7

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <tr
          key={`sk-${index}`}
          className={index % 2 === 0 ? 'bg-white' : 'bg-zinc-50/55'}
        >
          <td
            colSpan={13}
            className="border border-zinc-200/80 px-3 py-3"
          >
            <div
              className="h-3 max-w-full rounded bg-zinc-200/80 motion-safe:animate-pulse"
              style={{ maxWidth: `${68 + (index % 4) * 7}%` }}
            />
          </td>
        </tr>
      ))}
    </>
  )
}

export function LeadGenDistributorsTable({
  rows,
  view,
  onSort,
  onClose,
  phaseKey,
  rowStaggerMs = DEFAULT_LEAD_ROW_STAGGER_MS,
  /**
   * Paint header + inert placeholder rows for one frame first (double rAF) so the grid shell
   * can layout before data rows and row animations run—used when swapping from the competitor board.
   */
  deferredDataPaint = false,
  selectedRowIds = [],
  onRowToggleContext,
}: {
  rows: DistributorRow[]
  view: LeadTableViewState
  onSort: (col: SortColumn) => void
  /** Pinned in the top chrome row (e.g. close merged table header on Home). */
  onClose?: () => void
  /** Changes when a “regenerate / phase” is triggered. */
  phaseKey: string | number
  /** Delay between each row’s entrance animation (sequential reveal). */
  rowStaggerMs?: number
  deferredDataPaint?: boolean
  /** `rowId` = `linkedInUrl` (stable within the current grid). */
  selectedRowIds?: string[]
  onRowToggleContext?: (row: DistributorRow, displayIndex: number) => void
}) {
  const rowChatEnabled = onRowToggleContext != null
  const [dataBodyReady, setDataBodyReady] = useState(() => !deferredDataPaint)

  useLayoutEffect(() => {
    if (!deferredDataPaint) {
      setDataBodyReady(true)
      return
    }
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDataBodyReady(true)
      return
    }
    setDataBodyReady(false)
    let r1 = 0
    let r2 = 0
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        setDataBodyReady(true)
      })
    })
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
    }
  }, [deferredDataPaint])
  return (
    <div
      className="group/table relative flex h-full min-h-0 w-full min-w-0 flex-col bg-white text-zinc-900 antialiased shadow-none selection:bg-sky-100/70"
      data-testid="lead-gen-distributors-table"
    >
      <div className="relative min-h-0 flex-1 overflow-x-auto overflow-y-auto [scrollbar-gutter:stable]">
        {onClose && (
          <div
            className={joinClasses(
              'absolute right-2 top-2 z-20 flex items-center gap-1.5',
              'pointer-events-auto opacity-0 transition-opacity duration-150',
              'group-hover/table:opacity-100',
              'focus-within:opacity-100',
            )}
          >
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200/90 bg-white/95 text-zinc-500 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-zinc-300/90 hover:bg-zinc-50/90 hover:text-zinc-800 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500/50"
              aria-label="Close"
              title="Close"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        <table
          className="w-full min-w-[1692px] border-collapse text-left [border-spacing:0]"
          key={String(phaseKey)}
          aria-busy={!dataBodyReady}
        >
          <thead className="sticky top-0 z-[2] border-b border-zinc-200/90 bg-zinc-50/95 shadow-[0_1px_0_0_rgba(228,228,231,0.9)]">
            <tr>
              <th
                scope="col"
                className="w-12 min-w-[3rem] border border-zinc-200/90 bg-zinc-50/95 py-2.5 pr-3 pl-3 text-right text-sm font-bold tabular-nums text-zinc-900"
              >
                #
              </th>
              <Th col="name" className="min-w-[200px]" view={view} onSort={onSort}>
                Name
              </Th>
              <Th col="source" className="min-w-[136px]" view={view} onSort={onSort}>
                Source
              </Th>
              <Th col="description" className="min-w-[248px]" view={view} onSort={onSort}>
                Description
              </Th>
              <th
                scope="col"
                className="border border-zinc-200/90 bg-zinc-50/95 px-3 py-2.5 text-left align-bottom text-sm font-bold leading-tight text-zinc-900 min-w-[200px]"
              >
                <span
                  className="block min-w-0 pr-0.5 leading-tight"
                  title="Synthetic line-level pull (exterior / dealer demo)"
                >
                  Products requested
                </span>
              </th>
              <Th col="industry" className="min-w-[132px]" view={view} onSort={onSort}>
                Primary industry
              </Th>
              <Th col="size" className="min-w-[110px]" view={view} onSort={onSort}>
                Size
              </Th>
              <Th col="type" className="min-w-[100px]" view={view} onSort={onSort}>
                Type
              </Th>
              <th
                scope="col"
                className="border border-zinc-200/90 bg-zinc-50/95 px-3 py-2.5 text-left align-bottom text-sm font-bold leading-tight text-zinc-900 min-w-[108px]"
              >
                <span
                  className="block min-w-0 pr-0.5 leading-tight"
                  title="Synthetic trailing-12m estimate (first five accounts)"
                >
                  LTM spend (est.)
                </span>
              </th>
              <Th col="location" className="min-w-[120px]" view={view} onSort={onSort}>
                Location
              </Th>
              <Th col="country" className="min-w-[90px]" view={view} onSort={onSort}>
                Country
              </Th>
              <Th col="linkedin" className="min-w-[140px]" view={view} onSort={onSort}>
                LinkedIn URL
              </Th>
              <Th col="engagement" className="min-w-[100px]" view={view} onSort={onSort}>
                We know them?
              </Th>
            </tr>
          </thead>
          <tbody>
            {!dataBodyReady ? (
              <SkeletonRows />
            ) : null}
            {dataBodyReady
              ? rows.map((row, index) => {
              const selected = selectedRowIds.includes(row.linkedInUrl)
              return (
              <tr
                key={`${phaseKey}-${row.name}-${row.linkedInUrl}-${index}`}
                className={joinClasses(
                  'lead-table-row-anim',
                  'group/row',
                  index % 2 === 0 ? 'bg-white' : 'bg-zinc-50/55',
                  rowChatEnabled && 'cursor-pointer transition-colors duration-100 hover:bg-sky-50/35',
                  selected && 'ring-2 ring-inset ring-sky-400/70 bg-sky-50/40',
                )}
                style={{
                  /* Sequential reveal: each row starts after the previous (staggered, slower for readability). */
                  animationDelay: `${index * rowStaggerMs}ms`,
                }}
                onClick={() => onRowToggleContext?.(row, index + 1)}
              >
                <Td muted indexColumn className="w-12 min-w-[3rem] pl-2 pr-2 text-right text-xs">
                  {index + 1}
                </Td>
                <Td className="font-semibold text-zinc-900">{row.name}</Td>
                <Td className="w-[1%]">
                  <div className="flex w-full min-w-0 items-center justify-center">
                    <LeadSourcePill id={row.sourceId} />
                  </div>
                </Td>
                <Td
                  multiline
                  noInnerTruncate
                  fullTitle={row.description}
                >
                  {row.description}
                </Td>
                <Td
                  multiline
                  noInnerTruncate
                  fullTitle={row.productsRequested}
                >
                  {row.productsRequested != null && row.productsRequested !== '' ? (
                    <span className="text-zinc-800 leading-relaxed">{row.productsRequested}</span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </Td>
                <Td>{row.primaryIndustry}</Td>
                <Td className="text-zinc-600">{row.size}</Td>
                <Td>{row.type}</Td>
                <Td
                  className="align-top text-[12px]"
                  noInnerTruncate
                  fullTitle={row.spendProfile?.summaryLine}
                >
                  {row.spendProfile ? (
                    <div className="min-w-0">
                      <div className="whitespace-nowrap font-semibold tabular-nums text-zinc-900">
                        {formatCompactUsd(row.spendProfile.ltmSpendUsd)}
                      </div>
                      <div className="whitespace-nowrap text-[10px] tabular-nums text-zinc-500">
                        YoY{' '}
                        {row.spendProfile.yoyChangePct >= 0 ? '+' : ''}
                        {row.spendProfile.yoyChangePct.toFixed(1)}%
                      </div>
                    </div>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </Td>
                <Td className="text-zinc-600">{row.location}</Td>
                <Td className="text-zinc-600">{row.country}</Td>
                <Td noInnerTruncate>
                  <a
                    href={row.linkedInUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="block truncate text-sky-700 underline decoration-sky-500/30 underline-offset-[3px] transition-colors hover:text-sky-800 hover:decoration-sky-500/50"
                    title={row.linkedInUrl}
                  >
                    {row.linkedInUrl.replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                </Td>
                <Td>
                  <span
                    className={joinClasses(
                      'inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
                      row.engagement === 'engaged'
                        ? 'border-emerald-200/80 bg-emerald-50/90 text-emerald-900'
                        : 'border-zinc-200/80 bg-zinc-50 text-zinc-600',
                    )}
                  >
                    {row.engagement === 'engaged' ? 'In motion' : 'Net new'}
                  </span>
                </Td>
              </tr>
              )
            })
              : null}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 border-t border-zinc-200/90 bg-zinc-50/60 px-3 py-2.5 text-xs text-zinc-500">
        <p className="tabular-nums">
          {dataBodyReady
            ? `Showing ${rows.length} of ${MILWAUKEE_LEAD_RESULT_TOTAL} results`
            : 'Loading results…'}
        </p>
      </div>
    </div>
  )
}
