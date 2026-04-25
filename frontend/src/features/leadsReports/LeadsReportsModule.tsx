import { useMemo, useState } from 'react'
import { Button, Panel, Tag, joinClasses } from '../../shared/ui'
import { leadPrompt, leadProspects, routeSummary, weeklyDigestReport } from './demoData'
import type { LeadProspect, ReportStatus, WeeklyDigestReport } from './types'

type Screen = 'leads' | 'reports'

const screens: Array<{ id: Screen; label: string }> = [
  { id: 'leads', label: 'Lead Generation' },
  { id: 'reports', label: 'Reporting' },
]

const initialFilters = [
  'Decking accounts',
  'Exterior materials',
  'Fastener attach',
  'Backorder complaints',
  'Competitor pressure',
]

interface SculptorTableProps {
  leads: LeadProspect[]
  search: string
  onSearchChange: (value: string) => void
}

function SculptorLeadTable({ leads, search, onSearchChange }: SculptorTableProps) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">Preview</p>
          <p className="text-xs text-zinc-500">Showing {leads.length} of 3,050 results</p>
        </div>
        <Tag tone="blue">Sculptor</Tag>
      </div>
      <div className="border-b border-zinc-200 px-4 py-2">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Filter the preview"
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="w-10 px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">T Company</th>
              <th className="px-3 py-2 font-semibold">T Contact</th>
              <th className="px-3 py-2 font-semibold">T Phone</th>
              <th className="px-3 py-2 font-semibold">T Location</th>
              <th className="px-3 py-2 font-semibold">T Distance From Route</th>
              <th className="px-3 py-2 font-semibold">T Similarity Reason</th>
              <th className="px-3 py-2 font-semibold">T Estimated Fit</th>
              <th className="px-3 py-2 font-semibold">T Current Supplier Signal</th>
              <th className="px-3 py-2 font-semibold">T Suggested Product</th>
              <th className="px-3 py-2 font-semibold">T Route Stop</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {leads.map((lead, index) => (
              <tr key={lead.id} className="align-top hover:bg-zinc-50">
                <td className="px-3 py-2 text-zinc-500">{index + 1}</td>
                <td className="px-3 py-2 font-medium text-zinc-900">{lead.company}</td>
                <td className="px-3 py-2 text-zinc-700">{lead.contact}</td>
                <td className="px-3 py-2 font-mono text-blue-600">{lead.phone}</td>
                <td className="px-3 py-2 text-zinc-700">{lead.location}</td>
                <td className="px-3 py-2 text-zinc-700">{lead.distanceFromRoute}</td>
                <td className="max-w-xs px-3 py-2 text-zinc-700">{lead.similarityReason}</td>
                <td className="px-3 py-2">
                  <Tag tone="blue">{lead.estimatedFit}% fit</Tag>
                </td>
                <td className="max-w-xs px-3 py-2 text-zinc-700">{lead.currentSupplierSignal}</td>
                <td className="px-3 py-2 text-zinc-900">{lead.suggestedProduct}</td>
                <td className="px-3 py-2">
                  <Tag tone="red">Stop {lead.routeStop}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FiltersPanel({
  filters,
  onRemoveFilter,
}: {
  filters: string[]
  onRemoveFilter: (filter: string) => void
}) {
  return (
    <aside className="flex min-h-0 flex-col bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
        <p className="text-sm font-semibold text-zinc-900">Find lookalike customers</p>
      </header>
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 text-xs">
        <button
          type="button"
          className="flex flex-1 items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50"
        >
          <span>See past searches</span>
          <span className="text-zinc-400">▾</span>
        </button>
        <Button variant="secondary" className="px-2 py-1 text-xs">
          Save search
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
        <FilterGroup label="Lookalike attributes" badge={`${filters.length} filters`} defaultOpen>
          <Field label="Reasons to include">
            <ChipList items={filters} onRemove={onRemoveFilter} />
          </Field>
          <Field label="Reasons to exclude">
            <Input placeholder="e.g. Already a top-tier account" />
          </Field>
          <Field label="Minimum estimated fit">
            <Input placeholder="e.g. 80" />
          </Field>
          <Field label="Distance from route">
            <Input placeholder="e.g. under 3 miles" />
          </Field>
          <Field label="Competitor signals">
            <Input placeholder="e.g. TimberTech, Boral" />
          </Field>
          <Field label="Product interests">
            <Input placeholder="e.g. composite decking, fasteners" />
          </Field>
          <Field label="Estimated annual revenue">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Min" />
              <Input placeholder="Max" />
            </div>
          </Field>
        </FilterGroup>

        <FilterGroup label="Location" badge="1 filter" />
      </div>
    </aside>
  )
}

function FilterGroup({
  label,
  badge,
  defaultOpen = false,
  children,
}: {
  label: string
  badge?: string
  defaultOpen?: boolean
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-zinc-200 py-2">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between px-1 py-1.5 text-left text-sm font-semibold text-zinc-900"
      >
        <span>{label}</span>
        <span className="flex items-center gap-2 text-xs font-medium text-blue-600">
          {badge}
          <span className="text-zinc-400">{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && children && <div className="mt-2 space-y-3">{children}</div>}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="text-[11px] font-semibold text-zinc-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Input({ placeholder }: { placeholder?: string }) {
  return (
    <input
      placeholder={placeholder}
      className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
    />
  )
}

function ChipList({
  items,
  onRemove,
}: {
  items: string[]
  onRemove: (item: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-zinc-200 bg-white p-2">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
        >
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="text-blue-400 hover:text-blue-600"
            aria-label={`Remove ${item}`}
          >
            ×
          </button>
          {item}
        </span>
      ))}
    </div>
  )
}

function OzAssistantRail({
  onAddToReport,
  topLead,
}: {
  onAddToReport: () => void
  topLead: LeadProspect
}) {
  return (
    <section className="flex min-h-0 flex-col bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-zinc-900">Oz</p>
          <Tag tone="amber">Beta</Tag>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-zinc-50/40 px-4 py-3 text-sm">
        <article className="ml-6 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900">
          {leadPrompt}
        </article>
        <article className="mr-6 rounded-lg border border-zinc-200 bg-white p-3 text-zinc-800">
          I’ve set the search to nearby decking lookalikes ranked by exterior-material demand,
          competitor signals, and route distance. Your preview is now populated.
        </article>
        <article className="mr-6 rounded-lg border border-zinc-200 bg-white p-3 text-zinc-800">
          {`Concrete sales action: Call ${topLead.contact} at ${topLead.phone}, then visit route stop ${topLead.routeStop}.`}
        </article>
      </div>
      <div className="border-t border-zinc-200 px-4 py-3">
        <Button onClick={onAddToReport} className="w-full">
          Add to weekly report
        </Button>
        <button
          type="button"
          className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          Refine with another prompt
        </button>
      </div>
    </section>
  )
}

export function LeadGenerationScreen({ onAddToReport }: { onAddToReport: () => void }) {
  const [filters, setFilters] = useState<string[]>(initialFilters)
  const [search, setSearch] = useState('')
  const topLead = leadProspects[0]

  function removeFilter(filter: string) {
    setFilters((current) => current.filter((entry) => entry !== filter))
  }

  const visibleLeads = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return leadProspects
    return leadProspects.filter(
      (lead) =>
        lead.company.toLowerCase().includes(term) ||
        lead.contact.toLowerCase().includes(term) ||
        lead.location.toLowerCase().includes(term) ||
        lead.similarityReason.toLowerCase().includes(term),
    )
  }, [search])

  return (
    <div className="space-y-5" aria-labelledby="lead-generation-title">
      <h2 id="lead-generation-title" className="sr-only">
        Find nearby lookalike customers
      </h2>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="grid h-[640px] grid-cols-[260px_minmax(0,1fr)_300px] divide-x divide-zinc-200">
          <FiltersPanel filters={filters} onRemoveFilter={removeFilter} />
          <SculptorLeadTable leads={visibleLeads} search={search} onSearchChange={setSearch} />
          <OzAssistantRail onAddToReport={onAddToReport} topLead={topLead} />
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-sm">
          <span className="text-zinc-500">Showing {visibleLeads.length} of 3,050 results</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost">Filters</Button>
            <Button onClick={onAddToReport}>Continue</Button>
          </div>
        </footer>
      </div>

      <Panel
        eyebrow="Route preview"
        title={`${routeSummary.origin} → ${routeSummary.stops.length} stops`}
        description={`Estimated travel time: ${routeSummary.totalTravelTime}`}
      >
        <ol className="space-y-3">
          {routeSummary.stops.map((stop) => (
            <li key={stop.stop} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
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
