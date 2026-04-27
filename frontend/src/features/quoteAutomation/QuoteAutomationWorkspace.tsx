import { useEffect, useMemo, useState } from 'react'
import { DEMO_REP_FIRST_NAME } from '../../config/demoRep'
import { Button, Panel, PulseOrb, Tag, joinClasses } from '../../shared/ui'
import { quoteAutomationDemoData } from './demoData'
import { LumberInvoicePreviewSheet } from './LumberInvoicePreviewSheet'
import type { QuoteAutomationDemoData, TaskStatus } from './types'
import { JobCostEstimateRecapSheet } from '../fieldApp/JobCostEstimateRecapSheet'
import { JCR_JSON_EXAMPLE_DEFAULTS } from '../fieldApp/jobCostEstimateRecap'

interface QuoteAutomationWorkspaceProps {
  data?: QuoteAutomationDemoData
}

function getTaskStatus(index: number, activeTaskIndex: number, taskCount: number): TaskStatus {
  if (activeTaskIndex >= taskCount) return 'complete'
  if (index < activeTaskIndex) return 'complete'
  if (index === activeTaskIndex) return 'running'
  return 'queued'
}

const taskRowClasses: Record<TaskStatus, string> = {
  complete: 'border-emerald-200 bg-emerald-50/60 text-emerald-900',
  running: 'border-blue-300 bg-blue-50 text-blue-900',
  queued: 'border-zinc-200 bg-white text-zinc-600',
  blocked: 'border-red-200 bg-red-50 text-red-800',
}

const taskDotClasses: Record<TaskStatus, string> = {
  complete: 'border-emerald-500 bg-emerald-500',
  running: 'border-blue-500 bg-blue-500 animate-pulse',
  queued: 'border-zinc-300 bg-white',
  blocked: 'border-red-500 bg-red-500',
}

const QUOTE_AUTOFILL_KEY = 'oz-quote-autofill' as const

export function QuoteAutomationWorkspace({
  data = quoteAutomationDemoData,
}: QuoteAutomationWorkspaceProps) {
  const [fieldHandoff, setFieldHandoff] = useState<string | null>(null)
  const [activeTaskIndex, setActiveTaskIndex] = useState(0)
  const [isReviewSubmitted, setIsReviewSubmitted] = useState(false)
  const [showVoiceWalkthroughQuote, setShowVoiceWalkthroughQuote] = useState(false)
  const [templateInvoiceMsg, setTemplateInvoiceMsg] = useState<string | null>(null)
  const [voiceInvoiceMsg, setVoiceInvoiceMsg] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(QUOTE_AUTOFILL_KEY)
      if (!raw) return
      sessionStorage.removeItem(QUOTE_AUTOFILL_KEY)
      const p = JSON.parse(raw) as {
        customer?: string
        lineItems?: string
        shipTo?: string
        needBy?: string
        po?: string
      }
      const bits = [
        p.customer && `Customer: ${p.customer}`,
        p.lineItems && `Lines: ${p.lineItems}`,
        p.shipTo && `Ship: ${p.shipTo}`,
        p.needBy && `Need by: ${p.needBy}`,
        p.po && `PO: ${p.po}`,
      ].filter(Boolean)
      if (bits.length) {
        setFieldHandoff(bits.join(' · '))
        // A field handoff means the rep already walked the voice process — surface
        // the second quote card immediately.
        setShowVoiceWalkthroughQuote(true)
      }
    } catch {
      /* ignore */
    }
  }, [])
  const taskCount = data.tasks.length
  const allTasksComplete = activeTaskIndex >= taskCount

  const taskStatuses = useMemo(
    () => data.tasks.map((_, index) => getTaskStatus(index, activeTaskIndex, taskCount)),
    [activeTaskIndex, data.tasks, taskCount],
  )

  /** Same lumber Job Cost seed as the template (PO and Marshall Court copy match `JCR_JSON_EXAMPLE_DEFAULTS`). */
  const voiceWalkthroughJcrOverrides = useMemo(() => ({ ...JCR_JSON_EXAMPLE_DEFAULTS }), [])

  function handleReviewAction() {
    if (allTasksComplete) {
      setIsReviewSubmitted(true)
      return
    }
    setActiveTaskIndex((current) => Math.min(current + 1, taskCount))
  }

  return (
    <div className="space-y-5">
      {fieldHandoff ? (
        <div
          className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950"
          role="status"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">From Field (prospect visit)</p>
          <p className="mt-1 leading-relaxed">{fieldHandoff}</p>
        </div>
      ) : null}

      <Panel
        eyebrow="Voice quote automation"
        title="Editable Job Cost Recap sheets"
        description="Excel-like Job Cost Recap sheets plus a read-only lumber invoice preview. The template matches Summit Ridge / Marshall Court; the second sheet simulates data returned from the Field voice walkthrough."
      >
        <div className="space-y-5" data-testid="voice-quote-sheets">
          <JobCostEstimateRecapSheet
            initialOverrides={{ ...JCR_JSON_EXAMPLE_DEFAULTS }}
            caption="Template example — Summit Ridge Framing · lumber package (Q25-4420-LUM)"
            onCreateInvoice={({ computed }) => {
              const total = computed.total_cost ?? 0
              const profit = computed.profit ?? 0
              const margin = computed.profit_margin ?? 0
              setTemplateInvoiceMsg(
                `Invoice queued (demo). Total cost $${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}, profit $${profit.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${(margin * 100).toFixed(1)}% margin).`,
              )
            }}
          />
          {templateInvoiceMsg ? (
            <p
              className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-900"
              role="status"
            >
              {templateInvoiceMsg}
            </p>
          ) : null}

          <LumberInvoicePreviewSheet />

          {showVoiceWalkthroughQuote ? (
            <div data-testid="voice-walkthrough-quote-card" className="space-y-3">
              <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/60 px-3 py-2 text-sm text-fuchsia-950">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-800">From voice walkthrough</p>
                <p className="mt-0.5">
                  Pre-filled from the Field lumber quote scripts (Summit Ridge Framing, Marshall Court, Q25-4420-LUM).
                  Sample lumber PO shown in-row. Edit any cell — formulas recompute live.
                </p>
              </div>
              <JobCostEstimateRecapSheet
                initialOverrides={voiceWalkthroughJcrOverrides}
                caption="Voice walkthrough — Summit Ridge Framing · Marshall Court lumber (demo PO filled)"
                onCreateInvoice={({ computed }) => {
                  const total = computed.total_cost ?? 0
                  const profit = computed.profit ?? 0
                  const margin = computed.profit_margin ?? 0
                  setVoiceInvoiceMsg(
                    `Invoice queued (demo). Total cost $${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}, profit $${profit.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${(margin * 100).toFixed(1)}% margin).`,
                  )
                }}
              />
              {voiceInvoiceMsg ? (
                <p
                  className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-900"
                  role="status"
                >
                  {voiceInvoiceMsg}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-fuchsia-300/80 bg-fuchsia-50/30 p-4">
              <p className="text-sm text-fuchsia-950">
                After the rep walks the Field voice lumber quote, a second Job Cost Recap lands here with the same
                Marshall Court package and a sample lumber PO line.
              </p>
              <button
                type="button"
                onClick={() => setShowVoiceWalkthroughQuote(true)}
                className="mt-3 inline-flex items-center justify-center rounded-xl border border-fuchsia-300 bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-fuchsia-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400"
                data-testid="voice-walkthrough-generate"
              >
                Generate quote from voice walkthrough →
              </button>
            </div>
          )}
        </div>
      </Panel>

      <Panel
        eyebrow="Quote automation"
        title={`Review workspace for ${data.customerName}`}
        description="Oz drafts the quote from the field memo, source PDF, template, and customer context. Pricing is rough and needs rep review."
        action={
          <div
            className={joinClasses(
              'rounded-xl border px-3 py-2 text-right',
              isReviewSubmitted
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800',
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">Rep status</p>
            <p className="mt-0.5 text-base font-semibold">
              {isReviewSubmitted ? 'Review ready' : '80% done'}
            </p>
            <p className="text-[11px]">
              {isReviewSubmitted
                ? 'Submitted to rep review queue'
                : 'Needs rep review, not final pricing'}
            </p>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Panel
            eyebrow="Source review"
            title="Spec source PDF"
            description="Oz extracted the request, accessory needs, and known gaps."
            action={<Tag tone="zinc">{data.sourceReference.fileName}</Tag>}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {data.inputs.map((input) => (
                <div
                  key={input.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900">{input.label}</p>
                    <p className="mt-0.5 truncate text-zinc-600">{input.summary}</p>
                  </div>
                  <Tag tone="zinc">{input.status}</Tag>
                </div>
              ))}
            </div>

            <article className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3 border-b border-zinc-200 pb-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Oz demo placeholder source document
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-zinc-900">
                    {data.sourceReference.documentType}
                  </h3>
                </div>
                <span className="rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  PDF
                </span>
              </div>
              <dl className="mt-3 grid gap-y-1 gap-x-3 text-sm sm:grid-cols-[120px_1fr]">
                <dt className="text-zinc-500">Customer</dt>
                <dd className="font-medium text-zinc-900">{data.sourceReference.customer}</dd>
                <dt className="text-zinc-500">Prepared for</dt>
                <dd className="font-medium text-zinc-900">{data.sourceReference.preparedFor}</dd>
                <dt className="text-zinc-500">PDF path</dt>
                <dd>
                  <a
                    href={`/${data.sourceReference.assetPath}`}
                    className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700"
                  >
                    {data.sourceReference.assetPath}
                  </a>
                </dd>
              </dl>
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  AI extraction targets
                </p>
                <ol className="mt-1.5 grid gap-1 text-sm text-zinc-700 sm:grid-cols-2">
                  {data.sourceReference.extractedFields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ol>
              </div>
            </article>

            <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
              <PulseOrb size="sm" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                  Oz rationale
                </p>
                <p className="mt-0.5 text-sm font-semibold text-blue-900">
                  Draft is useful, not approved
                </p>
                <p className="mt-1 text-sm text-blue-900/85">
                  I pulled the multi-family lumber template (SPF, engineered, OSB, three drops), matched the voice memo
                  to Q25-4420-LUM, and staged the dummy invoice lines to the Job Cost Recap sell. Confirm piece counts and
                  crane dates before releasing the lumber PO.
                </p>
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="Draft quote"
            title={data.draftQuote.title}
            description={data.draftQuote.customerSummary}
            action={
              <Tag tone={isReviewSubmitted ? 'emerald' : 'red'} dot>
                {isReviewSubmitted ? 'Review-ready / queued for rep' : '80% done / needs rep review'}
              </Tag>
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryStat label="Requested product" value={data.requestedProduct} tone="blue" />
              <SummaryStat label="Rough estimate" value={data.draftQuote.estimateRange} tone="emerald" />
              <SummaryStat
                label="Missing info"
                value={`${data.draftQuote.missingInfo.length} fields`}
                tone="red"
              />
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
              <table className="w-full divide-y divide-zinc-200 text-left text-sm">
                <thead className="bg-zinc-50 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Line item</th>
                    <th className="px-3 py-2 font-semibold">Quantity</th>
                    <th className="px-3 py-2 font-semibold">Range</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white">
                  {data.draftQuote.lineItems.map((line) => (
                    <tr key={line.sku}>
                      <td className="px-3 py-2.5 align-top">
                        <p className="font-medium text-zinc-900">{line.description}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{line.assumption}</p>
                      </td>
                      <td className="px-3 py-2.5 align-top text-zinc-700">{line.quantity}</td>
                      <td className="px-3 py-2.5 align-top font-medium text-zinc-900">
                        {line.priceRange}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                  Pricing assumptions
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-zinc-800">
                  {data.draftQuote.assumptions.map((assumption) => (
                    <li key={assumption.label}>
                      <span className="font-medium text-zinc-900">{assumption.label}: </span>
                      <span className="text-zinc-700">{assumption.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-700">
                  Missing information
                </p>
                <ul className="mt-2 space-y-1 text-sm text-red-900">
                  {data.draftQuote.missingInfo.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Panel>

          <Panel eyebrow="Cross-sell" title="Upsell suggestions">
            <div className="grid gap-2 sm:grid-cols-2">
              {data.draftQuote.suggestions.map((suggestion) => (
                <article
                  key={suggestion.title}
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-zinc-900">{suggestion.title}</h3>
                    <Tag tone="blue">{suggestion.estimatedImpact}</Tag>
                  </div>
                  <p className="mt-1 text-xs text-zinc-600">{suggestion.rationale}</p>
                </article>
              ))}
            </div>
          </Panel>
        </div>

        <Panel
          eyebrow="Background tasks"
          title="Task rail"
          action={
            <span className="text-xs text-zinc-500">
              {Math.min(activeTaskIndex + 1, taskCount)} / {taskCount}
            </span>
          }
        >
          <ol className="space-y-1.5" aria-label="Quote automation task rail">
            {data.tasks.map((task, index) => {
              const status = taskStatuses[index]
              return (
                <li
                  key={task.id}
                  className={joinClasses(
                    'flex items-start gap-3 rounded-lg border p-2.5',
                    taskRowClasses[status],
                  )}
                >
                  <span
                    className={joinClasses(
                      'mt-1 h-3 w-3 shrink-0 rounded-full border',
                      taskDotClasses[status],
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{task.label}</p>
                    <p className="mt-0.5 text-xs opacity-80">{task.detail}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase">
                    {status}
                  </span>
                </li>
              )
            })}
          </ol>

          <div className="mt-4 flex flex-col gap-2">
            <Button variant="danger" onClick={handleReviewAction} disabled={isReviewSubmitted}>
              {isReviewSubmitted
                ? 'Submitted for rep review'
                : allTasksComplete
                  ? 'Send for rep review'
                  : 'Advance background review'}
            </Button>
            <Button variant="secondary">Open quote draft</Button>
            {isReviewSubmitted && (
              <div
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
              >
                Quote draft is review-ready. {DEMO_REP_FIRST_NAME} can validate the assumptions before anything is
                sent to the customer.
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'blue' | 'emerald' | 'red'
}) {
  const toneClasses: Record<typeof tone, string> = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    red: 'border-red-200 bg-red-50 text-red-900',
  }
  return (
    <div className={joinClasses('rounded-lg border p-3', toneClasses[tone])}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</p>
      <p className="mt-0.5 text-base font-semibold">{value}</p>
    </div>
  )
}
