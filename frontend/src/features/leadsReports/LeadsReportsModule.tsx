import { useMemo, useState } from 'react'
import { Button, Panel, Tag, joinClasses } from '../../shared/ui'
import { leadPrompt, leadProspects, routeSummary, weeklyDigestReport } from './demoData'
import type { LeadProspect, ReportStatus, WeeklyDigestReport } from './types'

type Screen = 'leads' | 'reports'

const screens: Array<{ id: Screen; label: string }> = [
  { id: 'leads', label: 'Lead Generation' },
  { id: 'reports', label: 'Reporting' },
]

function ScorePill({ score }: { score: number }) {
  return <Tag tone="blue">{score}% fit</Tag>
}

function LeadTable({ leads }: { leads: LeadProspect[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1100px] divide-y divide-zinc-200 text-left text-sm">
        <thead className="bg-zinc-50 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Company</th>
            <th className="px-4 py-3 font-semibold">Contact</th>
            <th className="px-4 py-3 font-semibold">Phone</th>
            <th className="px-4 py-3 font-semibold">Location</th>
            <th className="px-4 py-3 font-semibold">Distance From Route</th>
            <th className="px-4 py-3 font-semibold">Similarity Reason</th>
            <th className="px-4 py-3 font-semibold">Estimated Fit</th>
            <th className="px-4 py-3 font-semibold">Current Supplier Signal</th>
            <th className="px-4 py-3 font-semibold">Suggested Product</th>
            <th className="px-4 py-3 font-semibold">Route Stop</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 text-zinc-800">
          {leads.map((lead) => (
            <tr key={lead.id} className="align-top hover:bg-zinc-50">
              <td className="px-4 py-3 font-medium text-zinc-900">{lead.company}</td>
              <td className="px-4 py-3">{lead.contact}</td>
              <td className="px-4 py-3 font-mono text-blue-600">{lead.phone}</td>
              <td className="px-4 py-3 text-zinc-700">{lead.location}</td>
              <td className="px-4 py-3 text-zinc-700">{lead.distanceFromRoute}</td>
              <td className="max-w-xs px-4 py-3 text-zinc-700">{lead.similarityReason}</td>
              <td className="px-4 py-3"><ScorePill score={lead.estimatedFit} /></td>
              <td className="max-w-xs px-4 py-3 text-zinc-700">{lead.currentSupplierSignal}</td>
              <td className="px-4 py-3 text-zinc-900">{lead.suggestedProduct}</td>
              <td className="px-4 py-3"><Tag tone="red">Stop {lead.routeStop}</Tag></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function LeadGenerationScreen({ onAddToReport }: { onAddToReport: () => void }) {
  const topLead = leadProspects[0]

  return (
    <div className="space-y-5" aria-labelledby="lead-generation-title">
      <Panel
        eyebrow="Oz lead finder"
        title={
          <span id="lead-generation-title">Find nearby lookalike customers</span>
        }
        description={`Prompt: "${leadPrompt}" Oz ranked prospects by exterior-material demand, competitor signals, distance from tomorrow's route, and quote attach potential.`}
        action={
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
              Concrete sales action
            </p>
            <p className="mt-0.5 text-sm text-blue-900">
              Call {topLead.contact} at {topLead.phone}, then visit route stop {topLead.routeStop}.
            </p>
          </div>
        }
      />

      <Panel title="Lookalike prospects" bodyClassName="p-0">
        <LeadTable leads={leadProspects} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel
          eyebrow="Route preview"
          title={`${routeSummary.origin} to ${routeSummary.stops.length} stops`}
          description={`Estimated travel time: ${routeSummary.totalTravelTime}`}
          action={<Button onClick={onAddToReport}>Add to weekly report</Button>}
        >
          <ol className="space-y-3">
            {routeSummary.stops.map((stop) => (
              <li
                key={stop.stop}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      Stop {stop.stop}: {stop.company}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-700">{stop.reason}</p>
                  </div>
                  <Tag tone="zinc">{stop.travelTime}</Tag>
                </div>
                <p className="mt-2 text-sm text-blue-700">Talking point: {stop.talkingPoint}</p>
                <p className="mt-0.5 text-sm text-red-700">Product angle: {stop.productAngle}</p>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel
          eyebrow="Visit plan"
          title="Sami should visit 4 accounts"
          description="Prioritize decking accounts with known competitor pressure, then attach fastener bundles before the weekly digest goes to the sales team."
        >
          <ul className="space-y-1.5 text-sm text-zinc-800">
            {leadProspects.map((lead) => (
              <li key={lead.id} className="flex items-center justify-between gap-3">
                <span>{lead.company}</span>
                <span className="font-mono text-xs text-blue-600">{lead.phone}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

function SectionCard({ section }: { section: WeeklyDigestReport['sections'][number] }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">{section.title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-zinc-700">
        {section.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
        Sources: {section.sourceRecords.join(', ')}
      </p>
    </article>
  )
}

export function ReportingScreen({ report = weeklyDigestReport }: { report?: WeeklyDigestReport }) {
  const [status, setStatus] = useState<ReportStatus>('draft')
  const statusText = useMemo(() => {
    if (status === 'sent') return 'Sent confirmation: Weekly digest sent to the sales team.'
    if (status === 'scheduled') {
      return `Scheduled confirmation: Weekly digest will send ${report.cadence}.`
    }
    return 'Draft ready: review recipients, cadence, and sales actions before sending.'
  }, [report.cadence, status])

  return (
    <div className="space-y-5" aria-labelledby="reporting-title">
      <Panel
        eyebrow="Report builder"
        title={<span id="reporting-title">{report.title}</span>}
        description={
          'Prompt: "Generate a report and send it every week to me and my sales team." ' +
          'The preview includes product requests, complaints, competitor mentions, new leads, ' +
          'quote opportunities, and recommended rep actions.'
        }
        action={
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-right text-xs text-zinc-700">
            <p>
              <span className="text-zinc-500">Cadence:</span> {report.cadence}
            </p>
            <p className="mt-1">
              <span className="text-zinc-500">Recipients:</span> {report.recipients.join(', ')}
            </p>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <Panel eyebrow="Delivery" title="Schedule and recipients">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Recipient list
              </dt>
              <dd className="mt-0.5 text-zinc-800">{report.recipients.join(', ')}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Cadence
              </dt>
              <dd className="mt-0.5 text-zinc-800">{report.cadence}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Delivery status
              </dt>
              <dd className="mt-0.5 text-blue-700" role="status">
                {statusText}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setStatus('sent')}>Send digest now</Button>
            <Button variant="secondary" onClick={() => setStatus('scheduled')}>
              Schedule weekly send
            </Button>
          </div>
        </Panel>

        <Panel
          eyebrow="Preview"
          title="Weekly digest sections"
          action={<Tag tone="emerald" dot>Ready for sales</Tag>}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {report.sections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
            <h3 className="text-sm font-semibold text-red-800">Recommended rep actions</h3>
            <ul className="mt-2 space-y-1 text-sm text-red-900/85">
              {report.recommendedRepActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  )
}

export function LeadsReportsModule() {
  const [screen, setScreen] = useState<Screen>('leads')

  function handleAddToReport() {
    setScreen('reports')
  }

  return (
    <div className="space-y-4">
      <nav
        aria-label="Lead generation and reporting screens"
        className="inline-flex rounded-lg border border-zinc-200 bg-white p-1 shadow-sm"
      >
        {screens.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setScreen(item.id)}
            className={joinClasses(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              screen === item.id
                ? 'bg-blue-600 text-white'
                : 'text-zinc-700 hover:bg-zinc-100',
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {screen === 'leads' ? <LeadGenerationScreen onAddToReport={handleAddToReport} /> : null}
      {screen === 'reports' ? <ReportingScreen /> : null}
    </div>
  )
}
