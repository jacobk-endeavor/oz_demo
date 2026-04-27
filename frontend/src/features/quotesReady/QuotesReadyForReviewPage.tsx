import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  applyJcrQuoteValues,
  base64ToPdfBlob,
  type QuoteReadyForReviewEntry,
  QUOTES_READY_CHANGED_EVENT,
  readQuotesReadyForReview,
  pruneJcrLumberQuoteUnlessUnlocked,
  removeQuoteReady,
  seedDummyInvoiceIfAbsent,
} from './quotesReadyForReviewStore'
import { JobCostEstimateRecapSheet } from '../fieldApp/JobCostEstimateRecapSheet'
import { JCR_JSON_EXAMPLE_DEFAULTS } from '../fieldApp/jobCostEstimateRecap'

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

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

type DraftMap = Record<string, DemoInvoiceEditFields>

type JcrInvoiceSnapshot = {
  values: Record<string, string | number>
  computed: Record<string, number>
}

function SendInvoiceFromSheetDialog({
  open,
  onClose,
  quoteId,
  fileName,
  customerSummary,
  snapshot,
}: {
  open: boolean
  onClose: () => void
  quoteId: string
  fileName: string
  customerSummary?: string
  snapshot: JcrInvoiceSnapshot
}) {
  const [email, setEmail] = useState('')
  const customer = typeof snapshot.values.customer_name === 'string' ? snapshot.values.customer_name : ''
  const refQuote =
    typeof snapshot.values.ref_quote_numbers === 'string' ? snapshot.values.ref_quote_numbers : ''
  const total = snapshot.computed.total_cost ?? 0
  const profit = snapshot.computed.profit ?? 0
  const marginPct = (snapshot.computed.profit_margin ?? 0) * 100

  useEffect(() => {
    if (open) setEmail('')
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-zinc-900/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-invoice-dialog-title"
        className="max-h-[min(92vh,640px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="send-invoice-from-sheet-dialog"
      >
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 id="send-invoice-dialog-title" className="text-lg font-semibold text-zinc-900">
            Send workbook to billing
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            The Job Cost Recap is packaged as the Excel attachment. Enter the recipient — other fields come from the
            quote.
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-950">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Ready to send</p>
            <p className="mt-0.5 font-mono text-sm font-medium text-emerald-950">{fileName}</p>
            <p className="mt-1 text-xs text-emerald-900/90">Spreadsheet reflects the latest cells on the sheet.</p>
          </div>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-zinc-500">Review ID</dt>
              <dd className="mt-0.5 font-mono text-zinc-900">{quoteId}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500">Quote ref</dt>
              <dd className="mt-0.5 text-zinc-900">{refQuote || '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-zinc-500">Customer</dt>
              <dd className="mt-0.5 text-zinc-900">{customer || '—'}</dd>
            </div>
            {customerSummary ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-zinc-500">Card summary</dt>
                <dd className="mt-0.5 text-zinc-700">{customerSummary}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium text-zinc-500">Total cost</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-zinc-900">{formatUsd(total)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500">Profit (est.)</dt>
              <dd className="mt-0.5 tabular-nums text-zinc-800">
                {formatUsd(profit)}
                <span className="ml-1 text-xs text-zinc-500">({marginPct.toFixed(1)}% margin)</span>
              </dd>
            </div>
          </dl>
          <label className="block">
            <span className="text-sm font-medium text-zinc-800">Send to (email)</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="billing@customer.com"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const to = email.trim()
              if (!to) {
                window.alert('Enter an email address to continue (demo).')
                return
              }
              window.alert(
                `Demo: invoice package queued.\n\nTo: ${to}\nAttachment: ${fileName}\nCustomer: ${customer}\nRef: ${refQuote}\nTotal: ${formatUsd(total)}`,
              )
              onClose()
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Inbox: click a card to open the review surface; edit demo lines, then open the PDF preview when you choose.
 */
export function QuotesReadyForReviewPage(
  props: {
    onContextHeaderDetailRowChange?: (row: ReactNode | null) => void
  } = {},
) {
  const { onContextHeaderDetailRowChange } = props
  const [entries, setEntries] = useState<QuoteReadyForReviewEntry[]>(() => readQuotesReadyForReview())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPdf, setShowPdf] = useState(false)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [demoDraft, setDemoDraft] = useState<DraftMap>({})
  const [invoiceDialog, setInvoiceDialog] = useState<
    | { open: false }
    | {
        open: true
        quoteId: string
        fileName: string
        customerSummary?: string
        snapshot: JcrInvoiceSnapshot
      }
  >({ open: false })

  const sync = useCallback(() => {
    const list = readQuotesReadyForReview()
    setEntries(list)
    setSelectedId((prev) => (prev && list.some((e) => e.id === prev) ? prev : null))
  }, [])

  useEffect(() => {
    pruneJcrLumberQuoteUnlessUnlocked()
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
    setInvoiceDialog({ open: false })
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

  const onCloseDetail = useCallback(() => {
    setSelectedId(null)
    setShowPdf(false)
    setInvoiceDialog({ open: false })
  }, [])

  function onSelectCard(id: string) {
    setSelectedId(id)
    setShowPdf(false)
  }

  useEffect(() => {
    if (!onContextHeaderDetailRowChange) return
    if (!selectedId || !selected) {
      onContextHeaderDetailRowChange(null)
      return
    }
    onContextHeaderDetailRowChange(
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-sm font-bold text-sky-900">{selected.id}</span>
          <span className="text-sm text-zinc-500">{formatWhen(selected.createdAt)}</span>
        </div>
        <button
          type="button"
          onClick={onCloseDetail}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
        >
          <CloseIcon className="h-3.5 w-3.5" aria-hidden />
          Back to cards
        </button>
      </div>,
    )
  }, [selected, selectedId, onContextHeaderDetailRowChange, onCloseDetail])

  useEffect(() => {
    if (!onContextHeaderDetailRowChange) return
    return () => onContextHeaderDetailRowChange(null)
  }, [onContextHeaderDetailRowChange])

  function onApplyDemoAndPreview() {
    if (!selectedId || !selected || selected.source !== 'demo-invoice' || !draft) return
    applyDemoInvoiceFieldsUpdate(selectedId, draft)
    setShowPdf(true)
    sync()
  }

  return (
    <div
      className={joinClasses(
        'flex h-full min-h-0 min-w-0 flex-col',
        selectedId ? 'min-h-0 p-0' : 'gap-4 p-4 sm:p-5',
      )}
      data-testid="quotes-ready-for-review-page"
    >
      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-6 text-sm text-zinc-600">
          No quote PDFs in queue. Use <strong>Field App</strong> → <strong>Prospect Q&amp;A + notes</strong> and download
          a PDF, or reload to seed the demo invoice.
        </p>
      ) : !selectedId ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-200/90 bg-white shadow-sm">
          <table
            className="w-full min-w-[44rem] border-collapse text-left text-sm"
            data-testid="quotes-ready-list"
          >
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/90">
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Review ID
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Type
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Received
                </th>
                <th scope="col" className="min-w-[10rem] px-3 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Summary
                </th>
                <th scope="col" className="min-w-[8rem] px-3 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  File
                </th>
                <th scope="col" className="w-12 px-2 py-3">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectCard(e.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault()
                      onSelectCard(e.id)
                    }
                  }}
                  className={joinClasses(
                    'cursor-pointer border-b border-zinc-100 transition last:border-b-0',
                    'hover:bg-sky-50/70 focus:bg-sky-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400',
                  )}
                  data-testid={`quotes-ready-card-${e.id}`}
                >
                  <td className="px-4 py-3 font-mono text-sm font-bold text-sky-900">{e.id}</td>
                  <td className="px-3 py-3">
                    {e.source === 'demo-invoice' ? (
                      <span className="inline-flex rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-800">
                        Demo
                      </span>
                    ) : e.source === 'jcr-quote' ? (
                      <span className="inline-flex rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                        Voice quote
                      </span>
                    ) : (
                      <span className="inline-flex rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                        Field
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-600">{formatWhen(e.createdAt)}</td>
                  <td className="max-w-xs px-3 py-3 text-zinc-800">
                    {e.customerSummary ? (
                      <span className="line-clamp-2" title={e.customerSummary}>
                        {e.customerSummary}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-3 text-xs text-zinc-600" title={e.fileName}>
                    {e.fileName}
                  </td>
                  <td className="px-2 py-3 text-zinc-400">
                    <ChevronRightIcon className="h-4 w-4" aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className={joinClasses(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white',
            selectedId && 'rounded-none border-0 shadow-none',
            !selectedId && 'rounded-2xl border border-zinc-200/90 shadow-sm',
          )}
          data-testid="quotes-ready-detail"
        >
          {selected?.source === 'jcr-quote' ? (
            <div
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-1 sm:px-3 sm:pb-3"
              data-testid="quotes-ready-jcr-detail"
            >
              <JobCostEstimateRecapSheet
                key={selected.id}
                className="min-h-0 flex-1"
                initialOverrides={{
                  ...(selected.jcrSeed === 'kenny-hills' ? {} : JCR_JSON_EXAMPLE_DEFAULTS),
                  ...(selected.jcrSavedValues ?? {}),
                }}
                caption={
                  selected.jcrSeed === 'kenny-hills'
                    ? 'Voice walkthrough quote — Kenny Hills Contracting'
                    : 'Quote sheet — Summit Ridge Framing · lumber package (Q25-4420-LUM)'
                }
                onValuesChange={(values) => applyJcrQuoteValues(selected.id, values)}
                onCreateInvoice={(snapshot) => {
                  setInvoiceDialog({
                    open: true,
                    quoteId: selected.id,
                    fileName: selected.fileName,
                    customerSummary: selected.customerSummary,
                    snapshot,
                  })
                }}
              />
            </div>
          ) : (
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
          )}
        </div>
      )}

      {selectedId && (
        <div
          className={joinClasses(
            'flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100',
            selected?.source === 'jcr-quote' ? 'px-2 py-2 sm:px-3' : 'px-4 py-2 sm:px-5',
          )}
        >
          <button
            type="button"
            onClick={() => selectedId && removeQuoteReady(selectedId)}
            className="text-sm font-medium text-rose-700 hover:underline"
          >
            Remove from queue
          </button>
        </div>
      )}

      {invoiceDialog.open ? (
        <SendInvoiceFromSheetDialog
          open
          onClose={() => setInvoiceDialog({ open: false })}
          quoteId={invoiceDialog.quoteId}
          fileName={invoiceDialog.fileName}
          customerSummary={invoiceDialog.customerSummary}
          snapshot={invoiceDialog.snapshot}
        />
      ) : null}
    </div>
  )
}
