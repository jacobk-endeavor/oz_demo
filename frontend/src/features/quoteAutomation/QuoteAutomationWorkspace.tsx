import { useMemo, useState } from 'react'
import { quoteAutomationDemoData } from './demoData'
import type { QuoteAutomationDemoData, TaskStatus } from './types'

interface QuoteAutomationWorkspaceProps {
  data?: QuoteAutomationDemoData
}

function getTaskStatus(index: number, activeTaskIndex: number, taskCount: number): TaskStatus {
  if (activeTaskIndex >= taskCount) return 'complete'
  if (index < activeTaskIndex) return 'complete'
  if (index === activeTaskIndex) return 'running'
  return 'queued'
}

function statusClasses(status: TaskStatus) {
  const classes: Record<TaskStatus, string> = {
    complete: 'border-white/30 bg-white/15 text-white',
    running: 'border-sky-300/70 bg-sky-400/15 text-sky-100 shadow-[0_0_24px_rgba(35,184,255,0.22)]',
    queued: 'border-white/10 bg-white/5 text-slate-400',
    blocked: 'border-red-400/60 bg-red-500/10 text-red-100',
  }

  return classes[status]
}

export function QuoteAutomationWorkspace({
  data = quoteAutomationDemoData,
}: QuoteAutomationWorkspaceProps) {
  const [activeTaskIndex, setActiveTaskIndex] = useState(0)
  const [isReviewSubmitted, setIsReviewSubmitted] = useState(false)
  const taskCount = data.tasks.length
  const allTasksComplete = activeTaskIndex >= taskCount

  const taskStatuses = useMemo(
    () => data.tasks.map((_, index) => getTaskStatus(index, activeTaskIndex, taskCount)),
    [activeTaskIndex, data.tasks, taskCount],
  )

  function advanceTaskRail() {
    setActiveTaskIndex((current) => Math.min(current + 1, taskCount))
  }

  function handleReviewAction() {
    if (allTasksComplete) {
      setIsReviewSubmitted(true)
      return
    }

    advanceTaskRail()
  }

  return (
    <section className="min-h-screen overflow-hidden bg-[#030407] px-6 py-8 text-[#F5F7FF]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-10 h-72 w-72 rounded-full bg-[#0674FF]/20 blur-3xl" />
        <div className="absolute right-8 top-28 h-80 w-80 rounded-full bg-[#E10600]/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-64 w-96 -translate-x-1/2 rounded-full bg-[#23B8FF]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.36em] text-[#23B8FF]">
              Quote automation
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
              Review workspace for {data.customerName}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Oz is turning the field memo, source PDF, template, and customer context into an
              80% complete quote draft. Pricing is explicitly rough and requires rep review before
              it reaches the customer.
            </p>
          </div>

          <div className="min-w-56 rounded-2xl border border-red-400/50 bg-red-500/10 p-4 text-right">
            <p className="text-xs uppercase tracking-[0.24em] text-red-100">Rep status</p>
            <p className="mt-2 text-2xl font-semibold">
              {isReviewSubmitted ? 'Review ready' : '80% done'}
            </p>
            <p className="mt-1 text-sm text-red-100">
              {isReviewSubmitted
                ? 'Submitted to rep review queue'
                : 'Needs rep review, not final pricing'}
            </p>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <aside className="rounded-3xl border border-white/10 bg-[#080A12]/90 p-5 shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">
                Input queue
              </h2>
              <span className="rounded-full border border-sky-300/40 bg-sky-400/10 px-3 py-1 text-xs text-sky-100">
                4 sources
              </span>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {data.inputs.map((input) => (
                <article
                  key={input.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold">{input.label}</h3>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-slate-300">
                      {input.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{input.summary}</p>
                </article>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-[#07172F]/80 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-sky-200">Constraints</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {data.constraints.map((constraint) => (
                  <li key={constraint} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#23B8FF]" />
                    <span>{constraint}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <main className="flex min-w-0 flex-col gap-6">
            <section className="rounded-3xl border border-white/10 bg-[#07172F]/75 p-5 shadow-2xl shadow-black/40 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#23B8FF]">
                    Source review
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">Fake PDF reference</h2>
                </div>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-slate-200">
                  {data.sourceReference.fileName}
                </span>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <article className="relative min-h-80 overflow-hidden rounded-3xl border border-white/15 bg-white/[0.06] p-5">
                  <div className="absolute -right-10 top-12 h-40 w-40 rounded-full bg-[#23B8FF]/20 blur-2xl" />
                  <div className="relative rounded-2xl border border-white/20 bg-[#F5F7FF] p-5 text-[#07172F] shadow-2xl shadow-black/30">
                    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Oz demo placeholder source document
                        </p>
                        <h3 className="mt-2 text-xl font-semibold">
                          {data.sourceReference.documentType}
                        </h3>
                      </div>
                      <span className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                        PDF
                      </span>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm">
                      <div>
                        <dt className="text-slate-500">Customer</dt>
                        <dd className="font-semibold">{data.sourceReference.customer}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Prepared for</dt>
                        <dd className="font-semibold">{data.sourceReference.preparedFor}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Placeholder PDF path</dt>
                        <dd className="font-semibold">
                          <a
                            href={`/${data.sourceReference.assetPath}`}
                            className="text-[#0674FF] underline decoration-[#0674FF]/40 underline-offset-4"
                          >
                            {data.sourceReference.assetPath}
                          </a>
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        AI extraction targets
                      </p>
                      <ol className="mt-3 space-y-2 text-sm text-slate-700">
                        {data.sourceReference.extractedFields.map((field) => (
                          <li key={field}>{field}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </article>

                <article className="rounded-3xl border border-white/10 bg-[#080A12]/80 p-5">
                  <div className="flex items-center gap-3">
                    <div className="relative h-14 w-14 rounded-full bg-[#23B8FF]/20">
                      <span className="absolute inset-2 animate-pulse rounded-full bg-[#23B8FF]/40" />
                      <span className="absolute inset-5 rounded-full bg-white" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                        Oz rationale
                      </p>
                      <h3 className="text-lg font-semibold">Draft is useful, not approved</h3>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-300">
                    I pulled a composite decking template, assumed standard delivery, and matched
                    accessory recommendations from the source PDF. Confirm dimensions before
                    sending.
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs text-slate-400">Requested product</p>
                      <p className="mt-1 font-semibold">{data.requestedProduct}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs text-slate-400">Rough estimate</p>
                      <p className="mt-1 font-semibold">{data.draftQuote.estimateRange}</p>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#080A12]/90 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#23B8FF]">
                    Draft quote preview
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">{data.draftQuote.title}</h2>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-sm ${
                    isReviewSubmitted
                      ? 'border-emerald-300/50 bg-emerald-400/10 text-emerald-100'
                      : 'border-red-400/50 bg-red-500/10 text-red-100'
                  }`}
                >
                  {isReviewSubmitted
                    ? 'Review-ready / queued for rep'
                    : '80% done / needs rep review'}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                {data.draftQuote.customerSummary}
              </p>

              <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-white/10 text-xs uppercase tracking-[0.18em] text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Line item</th>
                      <th className="px-4 py-3">Quantity</th>
                      <th className="px-4 py-3">Range</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {data.draftQuote.lineItems.map((lineItem) => (
                      <tr key={lineItem.sku} className="bg-white/[0.03]">
                        <td className="px-4 py-4 align-top">
                          <p className="font-semibold">{lineItem.description}</p>
                          <p className="mt-1 text-xs text-slate-400">{lineItem.assumption}</p>
                        </td>
                        <td className="px-4 py-4 align-top text-slate-300">
                          {lineItem.quantity}
                        </td>
                        <td className="px-4 py-4 align-top font-semibold text-sky-100">
                          {lineItem.priceRange}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>

          <aside className="flex flex-col gap-6">
            <section className="rounded-3xl border border-white/10 bg-[#080A12]/90 p-5 shadow-2xl shadow-black/30">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">
                  Background tasks
                </h2>
                <span className="text-xs text-slate-400">
                  {Math.min(activeTaskIndex + 1, taskCount)} / {taskCount}
                </span>
              </div>

              <ol className="mt-5 space-y-3" aria-label="Quote automation task rail">
                {data.tasks.map((task, index) => {
                  const status = taskStatuses[index]
                  return (
                    <li
                      key={task.id}
                      className={`rounded-2xl border p-4 transition ${statusClasses(status)}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{task.label}</p>
                          <p className="mt-1 text-xs leading-5 opacity-75">{task.detail}</p>
                        </div>
                        <span className="rounded-full bg-black/25 px-2 py-1 text-[11px] uppercase">
                          {status}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ol>

              <button
                type="button"
                onClick={handleReviewAction}
                disabled={isReviewSubmitted}
                className="mt-5 w-full rounded-xl bg-[#E10600] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-red-950/40 transition hover:bg-[#FF3B00]"
              >
                {isReviewSubmitted
                  ? 'Submitted for rep review'
                  : allTasksComplete
                    ? 'Send for rep review'
                    : 'Advance background review'}
              </button>
              {isReviewSubmitted ? (
                <div
                  className="mt-3 rounded-2xl border border-emerald-300/40 bg-emerald-400/10 p-4 text-sm text-emerald-50"
                  role="status"
                >
                  Quote draft is review-ready. Sami can validate the assumptions before anything is
                  sent to the customer.
                </div>
              ) : null}
              <button
                type="button"
                className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Open quote draft
              </button>
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#07172F]/80 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">
                Pricing assumptions
              </h2>
              <div className="mt-4 space-y-3">
                {data.draftQuote.assumptions.map((assumption) => (
                  <div key={assumption.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-sky-200">
                      {assumption.label}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-slate-300">{assumption.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-red-400/30 bg-red-500/10 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-red-100">
                Missing information
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-red-50">
                {data.draftQuote.missingInfo.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-red-200" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#080A12]/90 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">
                Upsell / cross-sell
              </h2>
              <div className="mt-4 space-y-3">
                {data.draftQuote.suggestions.map((suggestion) => (
                  <article key={suggestion.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold">{suggestion.title}</h3>
                      <span className="rounded-full bg-sky-400/10 px-2 py-1 text-xs text-sky-100">
                        {suggestion.estimatedImpact}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-slate-300">{suggestion.rationale}</p>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </section>
  )
}
