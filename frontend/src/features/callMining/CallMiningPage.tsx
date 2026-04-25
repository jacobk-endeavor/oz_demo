import { useMemo, useState } from 'react'
import { Button, Panel, Tag, joinClasses } from '../../shared/ui'
import { buildOzInsight } from './insights'
import { callMiningInteractions, queryButtons } from './demoData'
import type { InteractionMedium, InteractionRecord, LocationTag, QueryId } from './types'

const mediumLabels: Record<InteractionMedium, string> = {
  note: 'Note',
  call_center: 'Call center call',
  email: 'Email',
}

const locationLabels: Record<LocationTag, string> = {
  zoom: 'Zoom',
  phone_call: 'Phone call',
  in_person: 'In person',
}

const locationDot: Record<LocationTag, string> = {
  zoom: 'bg-blue-500',
  phone_call: 'bg-red-500',
  in_person: 'bg-zinc-400',
}

const locationBorder: Record<LocationTag, string> = {
  zoom: 'border-blue-200 bg-blue-50 text-blue-700',
  phone_call: 'border-red-200 bg-red-50 text-red-700',
  in_person: 'border-zinc-200 bg-zinc-50 text-zinc-700',
}

function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`
}

function searchableText(record: InteractionRecord) {
  return [
    record.company,
    record.representative,
    record.date,
    mediumLabels[record.medium],
    locationLabels[record.locationTag],
    record.interactionType,
    record.topic,
    record.complaint,
    record.productRequested,
    record.competitorMentioned,
    record.transcriptExcerpt,
    record.suggestedAction,
  ]
    .join(' ')
    .toLowerCase()
}

function LocationChip({ tag }: { tag: LocationTag }) {
  return (
    <span
      data-testid="location-chip"
      data-location-tag={tag}
      className={joinClasses(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        locationBorder[tag],
      )}
    >
      <span className={joinClasses('h-1.5 w-1.5 rounded-full', locationDot[tag])} aria-hidden="true" />
      {locationLabels[tag]}
    </span>
  )
}

export function CallMiningPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [mediumFilter, setMediumFilter] = useState<'all' | InteractionMedium>('all')
  const [locationFilter, setLocationFilter] = useState<'all' | LocationTag>('all')
  const [representativeFilter, setRepresentativeFilter] = useState('all')
  const [selectedQuery, setSelectedQuery] = useState<QueryId | null>('top_products')

  const activeInsight = useMemo(
    () => (selectedQuery ? buildOzInsight(selectedQuery, callMiningInteractions) : null),
    [selectedQuery],
  )

  const activeSourceIds = useMemo(
    () => new Set(activeInsight?.sourceRecordIds ?? []),
    [activeInsight],
  )

  const representativeOptions = useMemo(
    () => [...new Set(callMiningInteractions.map((record) => record.representative))].sort(),
    [],
  )

  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return callMiningInteractions.filter((record) => {
      if (activeInsight && !activeSourceIds.has(record.id)) return false
      if (mediumFilter !== 'all' && record.medium !== mediumFilter) return false
      if (locationFilter !== 'all' && record.locationTag !== locationFilter) return false
      if (representativeFilter !== 'all' && record.representative !== representativeFilter) {
        return false
      }
      if (normalizedSearch && !searchableText(record).includes(normalizedSearch)) return false
      return true
    })
  }, [activeInsight, activeSourceIds, locationFilter, mediumFilter, representativeFilter, searchTerm])

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <h2 className="sr-only">Call, note, and email mining</h2>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(220px,1fr)_160px_140px_140px]">
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Search interactions
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search company, topic, product, complaint..."
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          <FilterSelect
            label="Medium"
            value={mediumFilter}
            onChange={(value) => setMediumFilter(value as 'all' | InteractionMedium)}
            options={[
              { value: 'all', label: 'All mediums' },
              { value: 'note', label: 'Note' },
              { value: 'call_center', label: 'Call center call' },
              { value: 'email', label: 'Email' },
            ]}
          />
          <FilterSelect
            label="Location"
            value={locationFilter}
            onChange={(value) => setLocationFilter(value as 'all' | LocationTag)}
            options={[
              { value: 'all', label: 'All locations' },
              { value: 'zoom', label: 'Zoom' },
              { value: 'phone_call', label: 'Phone call' },
              { value: 'in_person', label: 'In person' },
            ]}
          />
          <FilterSelect
            label="Rep"
            value={representativeFilter}
            onChange={setRepresentativeFilter}
            options={[
              { value: 'all', label: 'All reps' },
              ...representativeOptions.map((rep) => ({ value: rep, label: rep })),
            ]}
          />
        </div>

        <Panel
          title="Interaction evidence"
          description={`Showing ${filteredRecords.length} of ${callMiningInteractions.length} source records`}
          action={
            selectedQuery ? (
              <Button variant="ghost" onClick={() => setSelectedQuery(null)}>
                Clear Oz filter
              </Button>
            ) : undefined
          }
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="min-w-[1280px] divide-y divide-zinc-200 text-left text-sm">
              <thead className="bg-zinc-50 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Rep</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Medium</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Interaction Type</th>
                  <th className="px-4 py-3 font-semibold">Topic</th>
                  <th className="px-4 py-3 font-semibold">Complaint</th>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Competitor</th>
                  <th className="px-4 py-3 font-semibold">Confidence</th>
                  <th className="px-4 py-3 font-semibold">Suggested action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredRecords.map((record) => {
                  const highlighted = activeSourceIds.has(record.id)
                  return (
                    <tr
                      key={record.id}
                      data-testid="call-mining-row"
                      className={joinClasses(
                        'align-top transition-colors',
                        highlighted ? 'bg-blue-50/60' : 'hover:bg-zinc-50',
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-zinc-900">{record.company}</td>
                      <td className="px-4 py-3 text-zinc-700">{record.representative}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">{record.date}</td>
                      <td className="px-4 py-3 text-zinc-700">{mediumLabels[record.medium]}</td>
                      <td className="px-4 py-3"><LocationChip tag={record.locationTag} /></td>
                      <td className="px-4 py-3 text-zinc-700">{record.interactionType}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900">{record.topic}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        {record.complaint || <span className="text-zinc-400">No complaint</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-900">{record.productRequested}</td>
                      <td className="px-4 py-3 text-zinc-700">
                        {record.competitorMentioned || <span className="text-zinc-400">None</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-blue-600">{formatConfidence(record.confidence)}</td>
                      <td className="px-4 py-3 text-zinc-700">{record.suggestedAction}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <aside className="flex flex-col gap-4">
        <Panel eyebrow="Ask Oz" title="Pre-built queries">
          <div className="flex flex-col gap-2">
            {queryButtons.map((query) => {
              const selected = selectedQuery === query.id
              return (
                <button
                  key={query.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedQuery(query.id)}
                  className={joinClasses(
                    'rounded-xl border px-3 py-2.5 text-left transition-colors',
                    selected
                      ? 'border-blue-300 bg-blue-50 text-blue-900'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-blue-200 hover:bg-blue-50/40',
                  )}
                >
                  <span className="block text-sm font-semibold">{query.label}</span>
                  <span className="mt-0.5 block text-xs text-zinc-600">{query.naturalLanguage}</span>
                </button>
              )
            })}
          </div>
        </Panel>

        {activeInsight && (
          <Panel
            eyebrow="Oz grounded answer"
            title="Result"
            description={`Backed by ${activeInsight.sourceRecordIds.length} source records`}
          >
            <p className="text-sm text-zinc-800">{activeInsight.answer}</p>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Ranked evidence
              </p>
              <ol className="mt-2 space-y-1.5">
                {activeInsight.rankedItems.slice(0, 5).map((item) => (
                  <li key={item.name} className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-zinc-800">{item.name}</span>
                    <Tag tone="blue">
                      {item.mentions} {item.trend}
                    </Tag>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Highlighted locations
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {activeInsight.highlightedLocationTags.map((tag) => (
                  <LocationChip key={tag} tag={tag} />
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                Recommended action
              </p>
              <p className="mt-1 text-sm text-blue-900">{activeInsight.recommendedAction}</p>
            </div>

            <p className="mt-3 text-[11px] text-zinc-500">
              Evidence row IDs: {activeInsight.sourceRecordIds.slice(0, 8).join(', ')}
              {activeInsight.sourceRecordIds.length > 8 ? '…' : ''}
            </p>
          </Panel>
        )}
      </aside>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
