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
        'border border-zinc-200/90 bg-zinc-50/95 px-2 py-2.5 text-left text-sm font-bold leading-tight text-zinc-900',
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
  selectedRowIds = [],
  onRowToggleContext,
}: {
  rows: CompetitorOfferRow[]
  phaseKey: string
  selectedRowIds?: string[]
  onRowToggleContext?: (row: CompetitorOfferRow, displayIndex: number) => void
}) {
  const [openRow, setOpenRow] = useState<CompetitorOfferRow | null>(null)

  return (
    <div
      className="group/table relative flex h-full min-h-0 w-full min-w-0 flex-col bg-white text-zinc-900 antialiased"
      data-testid="competitor-offers-table"
    >
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
              <Th className="w-28 min-w-[6rem]">Price</Th>
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
                    'cursor-pointer transition-colors',
                    index % 2 === 0 ? 'bg-white' : 'bg-zinc-50/55',
                    'hover:bg-sky-50/50',
                    selected && 'bg-sky-50/50 ring-2 ring-inset ring-sky-400/60',
                  )}
                  title="Click for chat context. Double-click for the listing + image/web shortcuts panel. ↗ on competitor or ⌘-click the row opens the store listing."
                  onClick={(e) => {
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
                  role="button"
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
                  <td className="border border-zinc-200/80 px-2 py-2 text-sm font-semibold text-zinc-900">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate" title={row.competitor}>
                        {row.competitor}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openUrlInNewTab(row.productPageUrl)
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sky-700 hover:bg-sky-100/80"
                        title="Open product listing in a new tab"
                        aria-label={`Open ${row.competitor} listing in a new tab`}
                      >
                        <OpenInNewTabIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="max-w-0 min-w-0 border border-zinc-200/80 px-2.5 py-2 text-sm text-zinc-800">
                    <div className="truncate" title={row.product}>
                      {row.product}
                    </div>
                  </td>
                  <td className="whitespace-nowrap border border-zinc-200/80 px-2.5 py-2 text-sm tabular-nums text-zinc-800">
                    {row.price}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 border-t border-zinc-200/90 bg-zinc-50/60 px-3 py-2 text-xs text-zinc-500">
        {rows.length} {rows.length === 1 ? 'row' : 'rows'} — click a row for chat context; double-click opens the
        full URL, images, and web shortcuts; ↗ on the competitor or ⌘-click the row opens the store listing; middle-click
        the row also opens the listing
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
