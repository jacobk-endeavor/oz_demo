import { useMemo, useState } from 'react'
import { Button, Tag, joinClasses } from '../../../shared/ui'

interface CompanyRow {
  id: number
  name: string
  description: string
  industry: 'Wholesale' | 'Transportation, Logistics, Supply Chain'
  size: string
}

const initialIndustryFilters = [
  'Wholesale',
  'Wholesale Import and Export',
  'Transportation, Logistics, Supply Chain',
  'Warehousing and Storage',
  'Freight and Package Transport',
]

const companyRows: CompanyRow[] = [
  { id: 1, name: 'Kimball Midwest', description: 'Kimball Midwest is a national maintenance and repair distributor.', industry: 'Wholesale', size: '1,001-5,000 employees' },
  { id: 2, name: 'Winsupply', description: 'Founded in 1956, Winsupply runs a co-owned distribution network.', industry: 'Wholesale', size: '5,001-10,000 employees' },
  { id: 3, name: 'ISCEA - International Sup...', description: 'ISCEA promotes Supply Chain certifications and education.', industry: 'Transportation, Logistics, Supply Chain', size: '501-1,000 employees' },
  { id: 4, name: 'Applied Industrial Techno...', description: 'Founded in 1923, Applied Industrial moves industrial parts.', industry: 'Wholesale', size: '5,001-10,000 employees' },
  { id: 5, name: 'One New Creation', description: 'Full-service residential and commercial distribution.', industry: 'Wholesale', size: '11-50 employees' },
  { id: 6, name: 'Crown Lift Trucks', description: 'Crown Lift Trucks, part of Crown Equipment, sells material handling.', industry: 'Transportation, Logistics, Supply Chain', size: '10,001+ employees' },
  { id: 7, name: 'Integrity Express Logistics', description: 'Integrity is our name for a reason — freight brokerage and logistics.', industry: 'Transportation, Logistics, Supply Chain', size: '501-1,000 employees' },
  { id: 8, name: 'STG Logistics', description: 'STG Logistics is the nation’s largest container drayage provider.', industry: 'Transportation, Logistics, Supply Chain', size: '1,001-5,000 employees' },
  { id: 9, name: 'ODW Logistics', description: 'ODW Logistics is a third-party logistics provider in the Midwest.', industry: 'Transportation, Logistics, Supply Chain', size: '1,001-5,000 employees' },
  { id: 10, name: 'CSafe', description: 'CSafe has been committed to cold-chain logistics for life sciences.', industry: 'Transportation, Logistics, Supply Chain', size: '501-1,000 employees' },
  { id: 11, name: 'BDI', description: 'BDI is a leading supplier and integrator of bearings and components.', industry: 'Wholesale', size: '1,001-5,000 employees' },
  { id: 12, name: 'Hy-Tek Intralogistics', description: 'Hy-Tek is the premier single-source for intralogistics.', industry: 'Transportation, Logistics, Supply Chain', size: '501-1,000 employees' },
  { id: 13, name: 'AFC Industries', description: 'AFC Industries is a dynamic supply chain management partner.', industry: 'Transportation, Logistics, Supply Chain', size: '501-1,000 employees' },
  { id: 14, name: 'Famous Supply', description: 'Famous Supply is a fourth-generation wholesale distributor.', industry: 'Wholesale', size: '1,001-5,000 employees' },
  { id: 15, name: 'EASE Logistics', description: 'EASE Logistics is a multi-modal transportation provider.', industry: 'Transportation, Logistics, Supply Chain', size: '201-500 employees' },
]

const conversation = [
  { role: 'user' as const, content: 'Distribution companies in Ohio.' },
  {
    role: 'assistant' as const,
    content:
      'I’ve set your search to find distribution companies in Ohio. Your preview is now populated.',
  },
  {
    role: 'assistant' as const,
    content:
      'You can further refine your filters, or click "Continue" to build your table when ready.',
  },
]

export function CompanyFinderPreview() {
  const [filters, setFilters] = useState<string[]>(initialIndustryFilters)
  const [search, setSearch] = useState('')
  const [chatInput, setChatInput] = useState('')

  function removeFilter(filter: string) {
    setFilters((current) => current.filter((entry) => entry !== filter))
  }

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return companyRows
    return companyRows.filter(
      (row) =>
        row.name.toLowerCase().includes(term) ||
        row.description.toLowerCase().includes(term) ||
        row.industry.toLowerCase().includes(term),
    )
  }, [search])

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="grid h-[640px] grid-cols-[280px_minmax(0,1fr)_320px] divide-x divide-zinc-200">
        <FiltersPanel filters={filters} onRemoveFilter={removeFilter} />
        <TablePanel rows={visibleRows} search={search} onSearchChange={setSearch} />
        <AssistantPanel
          chatInput={chatInput}
          onChatInputChange={setChatInput}
        />
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
        <p className="text-sm font-semibold text-zinc-900">Find companies with filters</p>
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
        <FilterGroup label="Company attributes" badge={`${filters.length} filters`} defaultOpen>
          <Field label="Industries to include">
            <ChipList items={filters} onRemove={onRemoveFilter} />
          </Field>
          <Field label="Industries to exclude">
            <Input placeholder="e.g. Advertising services" />
          </Field>
          <Field label="Company sizes">
            <Input placeholder="e.g. 11-50 employees" />
          </Field>
          <Field label="Annual revenue">
            <Input placeholder="e.g. $1M - $5M" />
          </Field>
          <Field label="Funding raised">
            <Input placeholder="e.g. $5M - $10M" />
          </Field>
          <Field label="Estimated employee count">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Min" />
              <Input placeholder="Max" />
            </div>
          </Field>
          <Field label="Company types">
            <Input placeholder="e.g. Privately held" />
          </Field>
          <Field label="Description keywords to include">
            <Input placeholder="e.g. sales, data, outbound" />
          </Field>
          <Field label="Description keywords to exclude">
            <Input placeholder="e.g. agency, marketing" />
          </Field>
          <Field label="Minimum estimated audience size">
            <Input placeholder="e.g. 10" />
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

function TablePanel({
  rows,
  search,
  onSearchChange,
}: {
  rows: CompanyRow[]
  search: string
  onSearchChange: (value: string) => void
}) {
  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <p className="text-sm font-semibold text-zinc-900">Preview</p>
        <Tag tone="blue">Sculptor</Tag>
      </header>
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Filter the preview"
          className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <Tag tone="zinc">Showing {rows.length} of 3,050 results</Tag>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
          <thead className="sticky top-0 bg-zinc-50 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="w-10 px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">T Name</th>
              <th className="px-3 py-2 font-semibold">T Description</th>
              <th className="px-3 py-2 font-semibold">T Primary Industry</th>
              <th className="px-3 py-2 font-semibold">T Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-zinc-50">
                <td className="px-3 py-2 align-top text-zinc-500">{row.id}</td>
                <td className="px-3 py-2 align-top font-medium text-zinc-900">{row.name}</td>
                <td className="max-w-xs truncate px-3 py-2 align-top text-zinc-700">
                  {row.description}
                </td>
                <td className="px-3 py-2 align-top text-zinc-700">{row.industry}</td>
                <td className="px-3 py-2 align-top text-zinc-700">{row.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-2">
        <Button variant="ghost">Filters</Button>
        <Button>Continue</Button>
      </footer>
    </section>
  )
}

function AssistantPanel({
  chatInput,
  onChatInputChange,
}: {
  chatInput: string
  onChatInputChange: (value: string) => void
}) {
  return (
    <section className="flex min-h-0 flex-col bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-zinc-900">Sculptor</p>
          <Tag tone="amber">Beta</Tag>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-zinc-50/40 px-4 py-3">
        {conversation.map((message, index) => (
          <article
            key={index}
            className={joinClasses(
              'rounded-lg border p-3 text-sm',
              message.role === 'user'
                ? 'ml-6 border-blue-200 bg-blue-50 text-blue-900'
                : 'mr-6 border-zinc-200 bg-white text-zinc-800',
            )}
          >
            {message.content}
          </article>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onChatInputChange('')
        }}
        className="flex items-center gap-2 border-t border-zinc-200 px-4 py-3"
      >
        <input
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
          placeholder="What are you looking for?"
          className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-2.5 py-1.5 text-white hover:bg-blue-700"
          aria-label="Send message"
        >
          ↑
        </button>
      </form>
    </section>
  )
}
