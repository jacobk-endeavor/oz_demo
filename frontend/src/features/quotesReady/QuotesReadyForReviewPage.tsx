import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRightIcon, CloseIcon, PlusIcon } from '../../shared/ui/icons'
import { joinClasses } from '../../shared/ui'
import {
  type DemoInvoiceEditFields,
  type DemoInvoiceLineItem,
  lineItemsSubtotal,
  newDemoLineItem,
  normalizeDemoInvoiceFields,
} from './dummyDemoInvoice'
import {
  applyDemoInvoiceFieldsUpdate,
  base64ToPdfBlob,
  type QuoteReadyForReviewEntry,
  QUOTES_READY_CHANGED_EVENT,
  readQuotesReadyForReview,
  removeQuoteReady,
  seedDummyInvoiceIfAbsent,
} from './quotesReadyForReviewStore'

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function parseMoney(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function parseQty(s: string): number {
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

type DraftMap = Record<string, DemoInvoiceEditFields>

/**
 * Inbox: click a card to open the review surface; edit demo lines, then open the PDF preview when you choose.
 */
export function QuotesReadyForReviewPage() {
  const [entries, setEntries] = useState<QuoteReadyForReviewEntry[]>(() => readQuotesReadyForReview())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPdf, setShowPdf] = useState(false)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [demoDraft, setDemoDraft] = useState<DraftMap>({})

  const sync = useCallback(() => {
    const list = readQuotesReadyForReview()
    setEntries(list)
    setSelectedId((prev) => (prev && list.some((e) => e.id === prev) ? prev : null))
  }, [])

  useEffect(() => {
    seedDummyInvoiceIfAbsent()
    sync()
  }, [sync])

  useEffect(() => {
    function onStore() {
      sync()
    }
    window.addEventListener('storage', onStore)
    window.addEventListener(QUOTES_READY_CHANGED_EVENT, onStore)
    return () => {
      window.removeEventListener('storage', onStore)
      window.removeEventListener(QUOTES_READY_CHANGED_EVENT, onStore)
    }
  }, [sync])

  const selected = useMemo(
    () => (selectedId ? entries.find((e) => e.id === selectedId) ?? null : null),
    [entries, selectedId],
  )

  // Snapshot of stored demo fields: when this changes (open card, apply, external sync), reset local draft
  const storedDemoFieldsKey = useMemo(() => {
    if (!selected || selected.source !== 'demo-invoice') return null
    return JSON.stringify(normalizeDemoInvoiceFields(selected.demoInvoiceFields))
  }, [selected])

  useEffect(() => {
    if (!selectedId || !storedDemoFieldsKey) return
    const list = readQuotesReadyForReview()
    const entry = list.find((e) => e.id === selectedId)
    if (!entry || entry.source !== 'demo-invoice') return
    setDemoDraft((d) => ({
      ...d,
      [entry.id]: normalizeDemoInvoiceFields(entry.demoInvoiceFields),
    }))
  }, [selectedId, storedDemoFieldsKey])

  useEffect(() => {
    setShowPdf(false)
  }, [selectedId])

  useEffect(() => {
    if (!showPdf || !selected) {
      setObjectUrl((u) => {
        if (u) URL.revokeObjectURL(u)
        return null
      })
      return
    }
    const blob = base64ToPdfBlob(selected.pdfBase64)
    const url = URL.createObjectURL(blob)
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [showPdf, selected?.id, selected?.pdfBase64, selected])

  const draft = selectedId ? demoDraft[selectedId] : undefined
  const orderSubtotal = draft != null ? lineItemsSubtotal(draft.lineItems) : 0

  function setDemoLineField(
    lineId: string,
    patch: Partial<Pick<DemoInvoiceLineItem, 'qty' | 'description' | 'unitPrice'>>,
  ) {
    if (!selected) return
    setDemoDraft((d) => {
      const cur = d[selected.id]
      if (!cur) return d
      return {
        ...d,
        [selected.id]: {
          ...cur,
          lineItems: cur.lineItems.map((row) => (row.id === lineId ? { ...row, ...patch } : row)),
        },
      }
    })
  }

  function addDemoLine() {
    if (!selected) return
    setDemoDraft((d) => {
      const cur = d[selected.id]
      if (!cur) return d
      return { ...d, [selected.id]: { ...cur, lineItems: [...cur.lineItems, newDemoLineItem()] } }
    })
  }

  function removeDemoLine(lineId: string) {
    if (!selected) return
    setDemoDraft((d) => {
      const cur = d[selected.id]
      if (!cur || cur.lineItems.length <= 1) return d
      return { ...d, [selected.id]: { ...cur, lineItems: cur.lineItems.filter((r) => r.id !== lineId) } }
    })
  }

  function onSelectCard(id: string) {
    setSelectedId(id)
    setShowPdf(false)
  }

  function onCloseDetail() {
    setSelectedId(null)
    setShowPdf(false)
  }

  function onApplyDemoAndPreview() {
    if (!selectedId || !selected || selected.source !== 'demo-invoice' || !draft) return
    applyDemoInvoiceFieldsUpdate(selectedId, draft)
    setShowPdf(true)
    sync()
  }

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col gap-4 p-4 sm:p-5"
      data-testid="quotes-ready-for-review-page"
    >
      <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50/90 to-white px-4 py-3 shadow-sm sm:px-5">
        <h2 className="text-sm font-semibold text-zinc-900">Quotes ready for review</h2>
        <p className="mt-1 text-sm leading-relaxed text-zinc-600">
          <strong>Pick a card</strong> to open details — the PDF only loads after you choose to preview it, so the list
          stays light. The sample invoice is fully editable; Field PDFs are view-only here.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-6 text-sm text-zinc-600">
          No quote PDFs in queue. Use <strong>Field App</strong> → <strong>Prospect Q&amp;A + notes</strong> and download
          a PDF, or reload to seed the demo invoice.
        </p>
      ) : !selectedId ? (
        <ul
          className="grid list-none grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
          data-testid="quotes-ready-list"
        >
          {entries.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelectCard(e.id)}
                className={joinClasses(
                  'group flex w-full flex-col gap-2 rounded-2xl border border-zinc-200/90 bg-white p-4 text-left shadow-sm',
                  'transition hover:border-sky-300/80 hover:shadow-md active:scale-[0.99]',
                )}
                data-testid={`quotes-ready-card-${e.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-sm font-bold text-sky-900">{e.id}</span>
                      {e.source === 'demo-invoice' ? (
                        <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-800">
                          Demo
                        </span>
                      ) : (
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                          Field
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">{formatWhen(e.createdAt)}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-zinc-200/80 p-1.5 text-zinc-400 group-hover:border-sky-200 group-hover:text-sky-600">
                    <ChevronRightIcon className="h-4 w-4" aria-hidden />
                  </span>
                </div>
                {e.customerSummary ? (
                  <p className="line-clamp-2 text-sm text-zinc-800">{e.customerSummary}</p>
                ) : null}
                <p className="truncate text-xs text-zinc-500">{e.fileName}</p>
                <span className="text-xs font-semibold text-sky-700">Open review →</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm"
          data-testid="quotes-ready-detail"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/80 px-3 py-2.5 sm:px-4">
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold text-sky-900">{selected?.id}</p>
              <p className="text-xs text-zinc-500">{selected ? formatWhen(selected.createdAt) : ''}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onCloseDetail}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              >
                <CloseIcon className="h-3.5 w-3.5" aria-hidden />
                Back to cards
              </button>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:min-h-[min(100%,32rem)] lg:flex-row">
            {/* Left: editor / field context */}
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-b border-zinc-200/80 p-3 sm:p-4 lg:max-w-[min(100%,24rem)] lg:shrink-0 xl:max-w-md">
              {selected?.source === 'demo-invoice' && draft ? (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-600">
                    Edit <strong>ship-to</strong> and <strong>line items</strong> in this column — the PDF updates
                    beside it (or below on a narrow window). Re-run as many times as you need.
                  </p>
                  <div className="space-y-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ship to / job</p>
                    <label className="block">
                      <span className="text-xs font-medium text-zinc-600">Street</span>
                      <input
                        type="text"
                        value={draft.shipStreet}
                        onChange={(e) =>
                          setDemoDraft((d) => ({
                            ...d,
                            [selected.id]: { ...draft, shipStreet: e.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-zinc-600">City, state, ZIP</span>
                      <input
                        type="text"
                        value={draft.shipCityStateZip}
                        onChange={(e) =>
                          setDemoDraft((d) => ({
                            ...d,
                            [selected.id]: { ...draft, shipCityStateZip: e.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <div className="space-y-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Line items</p>
                      <button
                        type="button"
                        onClick={addDemoLine}
                        className="inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-50"
                      >
                        <PlusIcon className="h-3.5 w-3.5" aria-hidden />
                        Add line
                      </button>
                    </div>
                    <ul className="list-none space-y-3 p-0">
                      {draft.lineItems.map((line, idx) => {
                        const liExt = Math.max(0, (line.qty || 0) * (line.unitPrice || 0))
                        return (
                          <li
                            key={line.id}
                            className="rounded-xl border border-zinc-200/90 bg-white p-3 shadow-sm"
                            data-testid={`quotes-ready-line-${line.id}`}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                Line {idx + 1}
                              </span>
                              <button
                                type="button"
                                disabled={draft.lineItems.length <= 1}
                                onClick={() => removeDemoLine(line.id)}
                                className="text-xs font-medium text-rose-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={draft.lineItems.length <= 1 ? 'Cannot remove the only line' : 'Remove line'}
                              >
                                Remove
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                              <label className="block">
                                <span className="text-xs font-medium text-zinc-600">Quantity</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={String(line.qty)}
                                  onChange={(e) =>
                                    setDemoLineField(line.id, { qty: parseQty(e.target.value) })
                                  }
                                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm"
                                />
                              </label>
                              <label className="block sm:col-span-2 lg:col-span-1">
                                <span className="text-xs font-medium text-zinc-600">Description</span>
                                <input
                                  type="text"
                                  value={line.description}
                                  onChange={(e) => setDemoLineField(line.id, { description: e.target.value })}
                                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm"
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-medium text-zinc-600">Unit price ($)</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={String(line.unitPrice)}
                                  onChange={(e) =>
                                    setDemoLineField(line.id, { unitPrice: parseMoney(e.target.value) })
                                  }
                                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm"
                                />
                              </label>
                              <div className="flex flex-col justify-end rounded-lg border border-dashed border-emerald-200/80 bg-emerald-50/50 px-2.5 py-2 text-sm text-emerald-900 sm:col-span-2 lg:col-span-1">
                                <span className="text-[11px] font-medium text-emerald-800">Line total</span>
                                <span className="text-base font-semibold tabular-nums">${liExt.toFixed(2)}</span>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                    <div className="flex flex-col justify-end rounded-xl border border-dashed border-sky-200/80 bg-sky-50/60 px-3 py-2.5 text-sky-950">
                      <span className="text-xs font-semibold text-sky-900">Order subtotal (preview)</span>
                      <span className="text-xl font-bold tabular-nums">${orderSubtotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onApplyDemoAndPreview}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
                      data-testid="quotes-ready-apply-pdf"
                    >
                      Update PDF &amp; show preview
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-zinc-600">
                    This PDF was generated from the <strong>Field App</strong> order background. Use the button below to
                    load a read-only preview in the right-hand panel.
                  </p>
                  {selected?.source === 'prospect-order-background' ? (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => setShowPdf(true)}
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-sky-300 bg-sky-50 px-5 py-2.5 text-sm font-semibold text-sky-900 hover:bg-sky-100 sm:w-auto"
                      >
                        Show PDF preview
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Right: PDF or placeholder (side-by-side on lg+) */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-zinc-200/80 bg-zinc-100/40 lg:min-w-0 lg:border-t-0">
              {showPdf && (selected?.source === 'prospect-order-background' || (selected?.source === 'demo-invoice' && objectUrl)) ? (
                <>
                  <p className="shrink-0 border-b border-zinc-200/80 bg-white px-3 py-2 text-xs font-medium text-zinc-600 sm:px-4">
                    PDF preview
                    {objectUrl && selected ? (
                      <a
                        href={objectUrl}
                        download={selected.fileName}
                        className="ml-2 font-semibold text-sky-800 underline"
                      >
                        Download
                      </a>
                    ) : null}
                  </p>
                  {objectUrl ? (
                    <iframe
                      title={`PDF ${selected?.id}`}
                      src={objectUrl}
                      className="min-h-[min(50vh,420px)] w-full min-w-0 flex-1 border-0 lg:min-h-0"
                      data-testid="quotes-ready-pdf-viewer"
                    />
                  ) : null}
                </>
              ) : (
                <div
                  className={joinClasses(
                    'flex min-h-[min(40vh,280px)] flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center text-sm',
                    selected?.source === 'demo-invoice' ? 'bg-amber-50/50 text-amber-950' : 'bg-zinc-50/80 text-zinc-600',
                  )}
                >
                  {selected?.source === 'demo-invoice' ? (
                    <>
                      <p className="max-w-sm">
                        Complete the form, then <strong>Update PDF &amp; show preview</strong> to open the PDF here.
                      </p>
                    </>
                  ) : (
                    <p className="max-w-sm">
                      The preview appears here after you use <strong>Show PDF preview</strong> in the other column.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedId && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 pt-2">
          <button
            type="button"
            onClick={() => selectedId && removeQuoteReady(selectedId)}
            className="text-sm font-medium text-rose-700 hover:underline"
          >
            Remove from queue
          </button>
        </div>
      )}
    </div>
  )
}
