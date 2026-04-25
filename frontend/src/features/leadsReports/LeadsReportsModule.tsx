import { useMemo, useState } from 'react'
import { Button } from '../../shared/ui/Button'
import { leadPrompt, leadProspects, routeSummary, weeklyDigestReport } from './demoData'
import type { LeadProspect, ReportStatus, WeeklyDigestReport } from './types'

type Screen = 'leads' | 'reports'

const screens: Array<{ id: Screen; label: string }> = [
  { id: 'leads', label: 'Lead Generation' },
  { id: 'reports', label: 'Reporting' },
]

function ScorePill({ score }: { score: number }) {
  return (
    <span className="rounded-full border border-blue-400/40 bg-blue-500/15 px-2.5 py-1 text-xs font-semibold text-blue-100">
      {score}% fit
    </span>
  )
}

function LeadTable({ leads }: { leads: LeadProspect[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm">
        <thead className="bg-white/[0.06] text-xs uppercase tracking-[0.2em] text-slate-300">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Company
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Contact
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Phone
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Location
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Distance From Route
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Similarity Reason
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Estimated Fit
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Current Supplier Signal
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Suggested Product
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Route Stop
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 text-slate-100">
          {leads.map((lead) => (
            <tr key={lead.id} className="align-top hover:bg-white/[0.05]">
              <td className="px-4 py-4 font-semibold text-white">{lead.company}</td>
              <td className="px-4 py-4">{lead.contact}</td>
              <td className="px-4 py-4 font-mono text-blue-100">{lead.phone}</td>
              <td className="px-4 py-4 text-slate-300">{lead.location}</td>
              <td className="px-4 py-4 text-blue-100">{lead.distanceFromRoute}</td>
              <td className="max-w-xs px-4 py-4 text-slate-200">{lead.similarityReason}</td>
              <td className="px-4 py-4">
                <ScorePill score={lead.estimatedFit} />
              </td>
              <td className="max-w-xs px-4 py-4 text-slate-300">{lead.currentSupplierSignal}</td>
              <td className="px-4 py-4 text-white">{lead.suggestedProduct}</td>
              <td className="px-4 py-4">
                <span className="rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white">
                  Stop {lead.routeStop}
                </span>
              </td>
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
    <section className="space-y-6" aria-labelledby="lead-generation-title">
      <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(35,184,255,0.26),_transparent_32%),linear-gradient(135deg,_#07172F,_#030407)] p-6 shadow-2xl shadow-blue-950/40">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-blue-200">
              Oz lead finder
            </p>
            <h1 id="lead-generation-title" className="text-3xl font-semibold text-white">
              Find nearby lookalike customers
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Prompt: "{leadPrompt}" Oz ranked prospects by exterior-material demand,
              competitor signals, distance from tomorrow's route, and quote attach potential.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-300/20 bg-black/30 p-4 text-sm text-blue-50">
            <p className="font-semibold">Concrete sales action</p>
            <p className="mt-1 text-slate-300">
              Call {topLead.contact} at {topLead.phone}, then visit route stop {topLead.routeStop}.
            </p>
          </div>
        </div>
      </div>

      <LeadTable leads={leadProspects} />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-white/10 bg-[#080A12] p-6 shadow-xl shadow-black/30">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Route preview
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                {routeSummary.origin} to {routeSummary.stops.length} stops
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Estimated travel time: {routeSummary.totalTravelTime}
              </p>
            </div>
            <Button onClick={onAddToReport}>Add to weekly report</Button>
          </div>
          <ol className="mt-6 space-y-4">
            {routeSummary.stops.map((stop) => (
              <li key={stop.stop} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Stop {stop.stop}: {stop.company}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">{stop.reason}</p>
                  </div>
                  <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200">
                    {stop.travelTime}
                  </span>
                </div>
                <p className="mt-3 text-sm text-blue-100">Talking point: {stop.talkingPoint}</p>
                <p className="mt-1 text-sm text-red-100">Product angle: {stop.productAngle}</p>
              </li>
            ))}
          </ol>
        </div>

        <aside className="rounded-3xl border border-red-400/20 bg-red-500/10 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-100">
            Tomorrow's visit plan
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Sami should visit 4 accounts</h2>
          <p className="mt-3 text-sm leading-6 text-slate-200">
            Prioritize decking accounts with known competitor pressure, then attach fastener
            bundles before the weekly digest goes to the sales team.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-slate-100">
            {leadProspects.map((lead) => (
              <li key={lead.id} className="flex items-center justify-between gap-3">
                <span>{lead.company}</span>
                <span className="font-mono text-xs text-blue-100">{lead.phone}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  )
}

function SectionCard({ section }: { section: WeeklyDigestReport['sections'][number] }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <h3 className="text-base font-semibold text-white">{section.title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-200">
        {section.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-500">
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
    <section className="space-y-6" aria-labelledby="reporting-title">
      <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,_rgba(225,6,0,0.3),_transparent_30%),linear-gradient(135deg,_#07172F,_#030407)] p-6 shadow-2xl shadow-red-950/30">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-red-100">
          Report builder
        </p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 id="reporting-title" className="text-3xl font-semibold text-white">
              {report.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Prompt: "Generate a report and send it every week to me and my sales team."
              The preview includes product requests, complaints, competitor mentions, new leads,
              quote opportunities, and recommended rep actions.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-100">
            <p>
              <span className="text-slate-400">Cadence:</span> {report.cadence}
            </p>
            <p className="mt-2">
              <span className="text-slate-400">Recipients:</span> {report.recipients.join(', ')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="rounded-3xl border border-white/10 bg-[#080A12] p-6">
          <h2 className="text-xl font-semibold text-white">Schedule and delivery</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="text-slate-500">Recipient list</dt>
              <dd className="mt-1 text-slate-100">{report.recipients.join(', ')}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Cadence</dt>
              <dd className="mt-1 text-slate-100">{report.cadence}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Delivery status</dt>
              <dd className="mt-1 text-blue-100" role="status">
                {statusText}
              </dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => setStatus('sent')}>Send digest now</Button>
            <Button variant="secondary" onClick={() => setStatus('scheduled')}>
              Schedule weekly send
            </Button>
          </div>
        </aside>

        <div className="rounded-3xl border border-white/10 bg-[#080A12] p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Report preview
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Weekly digest sections</h2>
            </div>
            <span className="rounded-full border border-blue-300/40 bg-blue-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
              Ready for sales
            </span>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {report.sections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-red-300/20 bg-red-500/10 p-4">
            <h3 className="text-base font-semibold text-white">Recommended rep actions</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-100">
              {report.recommendedRepActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

export function LeadsReportsModule() {
  const [screen, setScreen] = useState<Screen>('leads')

  function handleAddToReport() {
    setScreen('reports')
  }

  return (
    <main className="min-h-screen bg-[#030407] p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <nav
          aria-label="Lead generation and reporting screens"
          className="mb-6 inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1"
        >
          {screens.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setScreen(item.id)}
              className={[
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                screen === item.id
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-950/40'
                  : 'text-slate-300 hover:text-white',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {screen === 'leads' ? <LeadGenerationScreen onAddToReport={handleAddToReport} /> : null}
        {screen === 'reports' ? <ReportingScreen /> : null}
      </div>
    </main>
  )
}
