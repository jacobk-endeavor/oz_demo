import { useMemo, useState, type CSSProperties } from 'react'
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

const locationColors: Record<LocationTag, string> = {
  zoom: '#23B8FF',
  phone_call: '#E10600',
  in_person: '#F5F7FF',
}

const locationChipStyles: Record<LocationTag, CSSProperties> = {
  zoom: {
    backgroundColor: 'rgba(35, 184, 255, 0.14)',
    borderColor: '#23B8FF',
    color: '#BCEBFF',
  },
  phone_call: {
    backgroundColor: 'rgba(225, 6, 0, 0.16)',
    borderColor: '#E10600',
    color: '#FFB2AE',
  },
  in_person: {
    backgroundColor: 'rgba(245, 247, 255, 0.12)',
    borderColor: '#F5F7FF',
    color: '#F5F7FF',
  },
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
      className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold"
      style={locationChipStyles[tag]}
      data-testid="location-chip"
      data-location-tag={tag}
    >
      <span
        className="h-2.5 w-2.5 rounded-full shadow-[0_0_12px_currentColor]"
        style={{ backgroundColor: locationColors[tag], color: locationColors[tag] }}
        aria-hidden="true"
      />
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
  }, [
    activeInsight,
    activeSourceIds,
    locationFilter,
    mediumFilter,
    representativeFilter,
    searchTerm,
  ])

  return (
    <section className="min-h-full bg-[#030407] p-6 text-[#F5F7FF]" aria-labelledby="call-mining-title">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
        <header className="overflow-hidden rounded-3xl border border-white/15 bg-[radial-gradient(circle_at_15%_20%,rgba(35,184,255,0.28),transparent_32%),radial-gradient(circle_at_85%_0%,rgba(225,6,0,0.22),transparent_30%),linear-gradient(135deg,#07172F,#080A12_55%,#030407)] p-6 shadow-2xl shadow-blue-950/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#23B8FF]">
                Oz interaction intelligence
              </p>
              <h1 id="call-mining-title" className="mt-3 text-3xl font-semibold tracking-tight">
                Call, note, and email mining
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#B6BED3]">
                Search every customer interaction, filter by source context, and ask Oz for
                grounded insight backed by visible table rows.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 text-center">
              <div>
                <p className="text-2xl font-semibold">{callMiningInteractions.length}</p>
                <p className="text-xs text-[#8B93A7]">records</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">20</p>
                <p className="text-xs text-[#8B93A7]">companies</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">8</p>
                <p className="text-xs text-[#8B93A7]">reps</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="rounded-3xl border border-white/15 bg-[#080A12]/95 p-4 shadow-xl shadow-black/30">
              <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_180px_160px_160px]">
                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#8B93A7]">
                  Search interactions
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search company, topic, product, complaint..."
                    className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm font-medium normal-case tracking-normal text-white outline-none transition focus:border-[#23B8FF] focus:ring-2 focus:ring-[#23B8FF]/25"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#8B93A7]">
                  Medium
                  <select
                    value={mediumFilter}
                    onChange={(event) =>
                      setMediumFilter(event.target.value as 'all' | InteractionMedium)
                    }
                    className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm font-medium normal-case tracking-normal text-white outline-none focus:border-[#23B8FF]"
                  >
                    <option value="all">All mediums</option>
                    <option value="note">Note</option>
                    <option value="call_center">Call center call</option>
                    <option value="email">Email</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#8B93A7]">
                  Location
                  <select
                    value={locationFilter}
                    onChange={(event) =>
                      setLocationFilter(event.target.value as 'all' | LocationTag)
                    }
                    className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm font-medium normal-case tracking-normal text-white outline-none focus:border-[#23B8FF]"
                  >
                    <option value="all">All locations</option>
                    <option value="zoom">Zoom</option>
                    <option value="phone_call">Phone call</option>
                    <option value="in_person">In person</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#8B93A7]">
                  Rep
                  <select
                    value={representativeFilter}
                    onChange={(event) => setRepresentativeFilter(event.target.value)}
                    className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm font-medium normal-case tracking-normal text-white outline-none focus:border-[#23B8FF]"
                  >
                    <option value="all">All reps</option>
                    {representativeOptions.map((representative) => (
                      <option key={representative} value={representative}>
                        {representative}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/15 bg-[#080A12] shadow-2xl shadow-black/30">
              <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Interaction evidence table</h2>
                  <p className="text-sm text-[#8B93A7]">
                    Showing {filteredRecords.length} of {callMiningInteractions.length} source
                    records
                  </p>
                </div>
                {selectedQuery && (
                  <button
                    type="button"
                    onClick={() => setSelectedQuery(null)}
                    className="self-start rounded-full border border-white/15 px-3 py-1.5 text-sm font-semibold text-[#F5F7FF] transition hover:border-[#23B8FF] hover:text-[#23B8FF] lg:self-auto"
                  >
                    Clear Oz filter
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1280px] divide-y divide-white/10 text-left text-sm">
                  <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-[#8B93A7]">
                    <tr>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Representative</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Medium</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Topic</th>
                      <th className="px-4 py-3">Complaint</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Competitor</th>
                      <th className="px-4 py-3">Confidence</th>
                      <th className="px-4 py-3">Suggested action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredRecords.map((record) => {
                      const highlighted = activeSourceIds.has(record.id)

                      return (
                        <tr
                          key={record.id}
                          data-testid="call-mining-row"
                          className={[
                            'align-top transition',
                            highlighted
                              ? 'bg-[#23B8FF]/10 shadow-[inset_3px_0_0_#23B8FF]'
                              : 'hover:bg-white/[0.04]',
                          ].join(' ')}
                        >
                          <td className="px-4 py-3 font-semibold text-white">{record.company}</td>
                          <td className="px-4 py-3 text-[#D7DCEB]">{record.representative}</td>
                          <td className="px-4 py-3 font-mono text-xs text-[#B6BED3]">
                            {record.date}
                          </td>
                          <td className="px-4 py-3 text-[#D7DCEB]">
                            {mediumLabels[record.medium]}
                          </td>
                          <td className="px-4 py-3">
                            <LocationChip tag={record.locationTag} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-white">{record.topic}</div>
                            <div className="mt-1 text-xs text-[#8B93A7]">
                              {record.interactionType}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#D7DCEB]">
                            {record.complaint || 'No complaint logged'}
                          </td>
                          <td className="px-4 py-3 text-[#F5F7FF]">{record.productRequested}</td>
                          <td className="px-4 py-3 text-[#D7DCEB]">
                            {record.competitorMentioned || 'None mentioned'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[#23B8FF]">
                            {formatConfidence(record.confidence)}
                          </td>
                          <td className="px-4 py-3 text-[#D7DCEB]">{record.suggestedAction}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-3xl border border-white/15 bg-[#080A12] p-4 shadow-xl shadow-black/30">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#23B8FF]">
                Ask Oz
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {queryButtons.map((query) => {
                  const selected = selectedQuery === query.id

                  return (
                    <button
                      key={query.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedQuery(query.id)}
                      className={[
                        'rounded-2xl border px-4 py-3 text-left transition',
                        selected
                          ? 'border-[#23B8FF] bg-[#23B8FF]/15 text-white shadow-[0_0_22px_rgba(35,184,255,0.18)]'
                          : 'border-white/10 bg-white/[0.03] text-[#D7DCEB] hover:border-[#23B8FF]/70',
                      ].join(' ')}
                    >
                      <span className="block text-sm font-semibold">{query.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#8B93A7]">
                        {query.naturalLanguage}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {activeInsight && (
              <div
                className="rounded-3xl border border-[#23B8FF]/40 bg-[linear-gradient(180deg,rgba(35,184,255,0.12),rgba(8,10,18,0.96))] p-5 shadow-2xl shadow-blue-950/25"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-[radial-gradient(circle,#F5F7FF_0%,#23B8FF_38%,#07172F_72%)] shadow-[0_0_28px_rgba(35,184,255,0.65)]" />
                  <div>
                    <p className="text-sm font-semibold text-white">Oz grounded answer</p>
                    <p className="text-xs text-[#8B93A7]">
                      Source records: {activeInsight.sourceRecordIds.length}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-[#D7DCEB]">{activeInsight.answer}</p>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8B93A7]">
                    Ranked evidence
                  </p>
                  <ol className="mt-3 space-y-2">
                    {activeInsight.rankedItems.slice(0, 5).map((item) => (
                      <li key={item.name} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-white">{item.name}</span>
                        <span className="rounded-full bg-white/10 px-2 py-1 font-mono text-xs text-[#23B8FF]">
                          {item.mentions} sources {item.trend}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8B93A7]">
                    Highlighted locations
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeInsight.highlightedLocationTags.map((tag) => (
                      <LocationChip key={tag} tag={tag} />
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[#E10600]/40 bg-[#E10600]/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FFB2AE]">
                    Recommended action
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white">
                    {activeInsight.recommendedAction}
                  </p>
                </div>

                <p className="mt-4 text-xs leading-5 text-[#8B93A7]">
                  Evidence row IDs: {activeInsight.sourceRecordIds.slice(0, 8).join(', ')}
                  {activeInsight.sourceRecordIds.length > 8 ? '...' : ''}
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  )
}
