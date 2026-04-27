import { useState, type ReactNode } from 'react'
import { OpenInNewTabIcon } from '../../shared/ui/icons'
import { joinClasses, Modal } from '../../shared/ui'
import type { CompetitorOfferRow } from './competitorOffersTypes'

function openUrlInNewTab(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function googleImageSearchUrl(row: CompetitorOfferRow) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${row.product} ${row.competitor}`)}`
}

function webSearchUrl(row: CompetitorOfferRow) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${row.product} in stock buy`)}`
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={joinClasses(
        'border border-zinc-200/90 bg-zinc-50/95 px-3 py-2.5 text-left text-sm font-bold leading-tight text-zinc-900',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function CompetitorOffersTable({
  rows,
  phaseKey,
  tableTitle = 'Competitor × product board',
  selectedRowIds = [],
  onRowToggleContext,
}: {
  rows: CompetitorOfferRow[]
  phaseKey: string
  tableTitle?: string
  selectedRowIds?: string[]
  onRowToggleContext?: (row: CompetitorOfferRow, displayIndex: number) => void
}) {
  const [openRow, setOpenRow] = useState<CompetitorOfferRow | null>(null)

  return (
    <div
      className="group/table relative flex h-full min-h-0 w-full min-w-0 flex-col bg-white text-zinc-900 antialiased"
      data-testid="competitor-offers-table"
    >
      <div className="shrink-0 border-b border-zinc-200/90 bg-zinc-50/80 px-3 py-2.5">
        <h2 className="text-sm font-bold tracking-tight text-zinc-900">{tableTitle}</h2>
      </div>
      <div className="relative min-h-0 flex-1 overflow-x-auto overflow-y-auto [scrollbar-gutter:stable]">
        <table
          className="w-full min-w-[640px] border-collapse text-left [border-spacing:0]"
          key={phaseKey}
        >
          <thead className="sticky top-0 z-[2] border-b border-zinc-200/90 bg-zinc-50/95">
            <tr>
              <Th className="min-w-[10rem]">
                <span className="inline-flex items-center gap-1.5" title="Store listing opens in a new tab">
                  <span>Competitor</span>
                  <OpenInNewTabIcon className="h-3.5 w-3.5 shrink-0 text-sky-600/90" aria-hidden />
                </span>
              </Th>
              <Th className="min-w-[12rem]">Product</Th>
              <Th className="w-40 min-w-[8.5rem]">Price (unit)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const displayIndex = index + 1
              const selected = selectedRowIds.includes(row.id)
              return (
                <tr
                  key={row.id}
                  className={joinClasses(
                    'lead-table-row-anim',
                    'cursor-pointer transition-colors',
                    index % 2 === 0 ? 'bg-white' : 'bg-zinc-50/55',
                    'hover:bg-sky-50/50',
                    selected && 'bg-sky-50/50 ring-2 ring-inset ring-sky-400/60',
                  )}
                  style={{ animationDelay: `${Math.min(index, 30) * 65}ms` }}
                  title="Click product or price for chat context. Double-click for listing, images, and web shortcuts. Competitor name opens the store listing. ⌘-click or middle-click the row opens the listing."
                  onClick={(e) => {
                    if (e.composedPath().some((n) => n instanceof HTMLAnchorElement)) {
                      return
                    }
                    if (e.metaKey || e.ctrlKey) {
                      e.preventDefault()
                      openUrlInNewTab(row.productPageUrl)
                      return
                    }
                    onRowToggleContext?.(row, displayIndex)
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    setOpenRow(row)
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault()
                      openUrlInNewTab(row.productPageUrl)
                    }
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      openUrlInNewTab(row.productPageUrl)
                      return
                    }
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onRowToggleContext?.(row, displayIndex)
                    }
                  }}
                >
                  <td className="border border-zinc-200/80 px-3 py-2.5 text-sm font-semibold text-zinc-900">
                    <a
                      href={row.productPageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openUrlInNewTab(row.productPageUrl)
                      }}
                      onAuxClick={(e) => e.stopPropagation()}
                      className="min-w-0 truncate px-0.5 text-sky-800 underline decoration-sky-400/45 underline-offset-2 hover:text-sky-900 hover:decoration-sky-500/70"
                      title={`Open ${row.competitor} listing in a new tab`}
                    >
                      {row.competitor}
                    </a>
                  </td>
                  <td className="max-w-0 min-w-0 border border-zinc-200/80 px-3 py-2.5 text-sm text-zinc-800">
                    <div className="truncate px-0.5" title={row.product}>
                      {row.product}
                    </div>
                  </td>
                  <td
                    className="whitespace-nowrap border border-zinc-200/80 px-3 py-2.5 text-sm tabular-nums text-zinc-800"
                    title={`${row.price} ${row.priceUnit}`}
                  >
                    <span className="font-medium">{row.price}</span>
                    <span className="pl-1 text-zinc-600">{row.priceUnit}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={openRow != null}
        onClose={() => setOpenRow(null)}
        title={openRow ? `${openRow.competitor} — ${openRow.product}` : ''}
        size="md"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {openRow ? (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="shrink-0 text-xs text-zinc-500">Open in new tab:</span>
                <button
                  type="button"
                  onClick={() => openUrlInNewTab(openRow.productPageUrl)}
                  className="rounded-md border border-sky-200/90 bg-sky-50/90 px-2 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100/90"
                >
                  Listing
                </button>
                <button
                  type="button"
                  onClick={() => openUrlInNewTab(googleImageSearchUrl(openRow))}
                  className="rounded-md border border-zinc-200/90 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Images
                </button>
                <button
                  type="button"
                  onClick={() => openUrlInNewTab(webSearchUrl(openRow))}
                  className="rounded-md border border-zinc-200/90 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Web
                </button>
              </div>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={() => setOpenRow(null)}
              className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Close
            </button>
          </div>
        }
      >
        {openRow ? (
          <div className="flex flex-col gap-3 text-sm text-zinc-800">
            {openRow.imageUrl ? (
              <a
                href={openRow.productPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-lg border border-zinc-200/90"
              >
                <img
                  src={openRow.imageUrl}
                  alt=""
                  className="h-24 w-full max-w-sm object-cover"
                  loading="lazy"
                />
              </a>
            ) : null}
            <p className="text-xs text-zinc-500">
              {openRow.sourceLabel ?? 'Link below points at the product listing (demo or search).'}
            </p>
            <a
              href={openRow.productPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit break-all rounded-md border border-sky-200 bg-sky-50/80 px-2 py-1.5 text-sm font-medium text-sky-900 underline decoration-sky-400/50 underline-offset-2 hover:decoration-sky-500"
            >
              {openRow.productPageUrl}
            </a>
            <a
              href={googleImageSearchUrl(openRow)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit text-sm text-sky-800 underline"
            >
              Google Images (same product + store)
            </a>
            <a
              href={webSearchUrl(openRow)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit text-sm text-sky-800 underline"
            >
              Web search: availability &amp; price
            </a>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
