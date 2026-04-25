import { useMemo, useState } from 'react'
import { Button, Panel, PulseOrb, Tag, joinClasses } from '../../shared/ui'
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

const statusToneClasses: Record<TaskStatus, string> = {
  complete: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  running: 'border-blue-300 bg-blue-50 text-blue-800',
  queued: 'border-zinc-200 bg-white text-zinc-600',
  blocked: 'border-red-200 bg-red-50 text-red-800',
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

  function handleReviewAction() {
    if (allTasksComplete) {
      setIsReviewSubmitted(true)
      return
    }
    setActiveTaskIndex((current) => Math.min(current + 1, taskCount))
  }

  return (
    <div className="grid gap-5">
      <Panel
        eyebrow="Quote automation"
        title={`Review workspace for ${data.customerName}`}
        description={
          'Oz is turning the field memo, source PDF, template, and customer context into an 80% complete quote draft. ' +
          'Pricing is explicitly rough and requires rep review before it reaches the customer.'
        }
        action={
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-700">
              Rep status
            </p>
            <p className="mt-0.5 text-base font-semibold text-red-800">
              {isReviewSubmitted ? 'Review ready' : '80% done'}
            </p>
            <p className="text-[11px] text-red-700">
              {isReviewSubmitted
                ? 'Submitted to rep review queue'
                : 'Needs rep review, not final pricing'}
            </p>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <Panel eyebrow="Sources" title="Input queue" action={<Tag tone="blue">{data.inputs.length} sources</Tag>}>
          <div className="flex flex-col gap-2">
            {data.inputs.map((input) => (
              <article key={input.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900">{input.label}</h3>
                  <Tag tone="zinc">{input.status}</Tag>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{input.summary}</p>
              </article>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Constraints
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-zinc-700">
              {data.constraints.map((constraint) => (
                <li key={constraint} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />
                  <span>{constraint}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            eyebrow="Source review"
            title="Fake PDF reference"
            action={<Tag tone="zinc">{data.sourceReference.fileName}</Tag>}
          >
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <article className="rounded-xl border border-zinc-200 bg-white p-4">
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
                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <dt className="text-zinc-500">Customer</dt>
                    <dd className="font-medium text-zinc-900">{data.sourceReference.customer}</dd>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <dt className="text-zinc-500">Prepared for</dt>
                    <dd className="font-medium text-zinc-900">{data.sourceReference.preparedFor}</dd>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <dt className="text-zinc-500">PDF path</dt>
                    <dd>
                      <a
                        href={`/${data.sourceReference.assetPath}`}
                        className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700"
                      >
                        {data.sourceReference.assetPath}
                      </a>
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    AI extraction targets
                  </p>
                  <ol className="mt-2 space-y-1 text-sm text-zinc-700">
                    {data.sourceReference.extractedFields.map((field) => (
                      <li key={field}>{field}</li>
                    ))}
                  </ol>
                </div>
              </article>

              <article className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center gap-3">
                  <PulseOrb size="sm" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Oz rationale
                    </p>
                    <h3 className="text-sm font-semibold text-zinc-900">Draft is useful, not approved</h3>
                  </div>
                </div>
                <p className="mt-3 text-sm text-zinc-700">
                  I pulled a composite decking template, assumed standard delivery, and matched
                  accessory recommendations from the source PDF. Confirm dimensions before sending.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Requested product
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-900">{data.requestedProduct}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Rough estimate
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-900">{data.draftQuote.estimateRange}</p>
                  </div>
                </div>
              </article>
            </div>
          </Panel>

          <Panel
            eyebrow="Draft quote preview"
            title={data.draftQuote.title}
            action={
              <Tag tone={isReviewSubmitted ? 'emerald' : 'red'} dot>
                {isReviewSubmitted ? 'Review-ready / queued for rep' : '80% done / needs rep review'}
              </Tag>
            }
          >
            <p className="text-sm text-zinc-700">{data.draftQuote.customerSummary}</p>

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
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium text-zinc-900">{line.description}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{line.assumption}</p>
                      </td>
                      <td className="px-3 py-3 align-top text-zinc-700">{line.quantity}</td>
                      <td className="px-3 py-3 align-top font-medium text-zinc-900">{line.priceRange}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel
            eyebrow="Background tasks"
            title="Task rail"
            action={
              <span className="text-xs text-zinc-500">
                {Math.min(activeTaskIndex + 1, taskCount)} / {taskCount}
              </span>
            }
          >
            <ol className="space-y-2" aria-label="Quote automation task rail">
              {data.tasks.map((task, index) => {
                const status = taskStatuses[index]
                return (
                  <li
                    key={task.id}
                    className={joinClasses('rounded-xl border p-3', statusToneClasses[status])}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{task.label}</p>
                        <p className="mt-0.5 text-xs opacity-80">{task.detail}</p>
                      </div>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase">
                        {status}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>

            <div className="mt-4 flex flex-col gap-2">
              <Button
                variant="danger"
                onClick={handleReviewAction}
                disabled={isReviewSubmitted}
              >
                {isReviewSubmitted
                  ? 'Submitted for rep review'
                  : allTasksComplete
                    ? 'Send for rep review'
                    : 'Advance background review'}
              </Button>
              {isReviewSubmitted && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
                >
                  Quote draft is review-ready. Sami can validate the assumptions before anything
                  is sent to the customer.
                </div>
              )}
              <Button variant="secondary">Open quote draft</Button>
            </div>
          </Panel>

          <Panel eyebrow="Pricing" title="Assumptions">
            <div className="space-y-2">
              {data.draftQuote.assumptions.map((assumption) => (
                <div key={assumption.label} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                    {assumption.label}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-800">{assumption.value}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            eyebrow="Action needed"
            title="Missing information"
            action={<Tag tone="red" dot>{data.draftQuote.missingInfo.length} fields</Tag>}
          >
            <ul className="space-y-1.5 text-sm text-zinc-800">
              {data.draftQuote.missingInfo.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel eyebrow="Cross-sell" title="Upsell suggestions">
            <div className="space-y-2">
              {data.draftQuote.suggestions.map((suggestion) => (
                <article key={suggestion.title} className="rounded-xl border border-zinc-200 bg-white p-3">
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
      </div>
    </div>
  )
}
