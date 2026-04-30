import { useEffect, useState } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/20/solid';
import api from '../api';
import DataTable from '../components/DataTable';
import { useDebouncedSearch } from '../hooks/useDebouncedSearch';

interface MeetingRecording {
  id: number;
  title: string;
  start_at: string | null;
  company_names: string[];
  matched_sales_rep_names: string[];
}

const PAGE_SIZE = 25;

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

const columns: { key: keyof MeetingRecording; label: string; render?: (value: MeetingRecording[keyof MeetingRecording], row: MeetingRecording) => React.ReactNode }[] = [
  { key: 'title', label: 'Title' },
  {
    key: 'start_at',
    label: 'Date',
    render: (value) => formatDate(value as string | null),
  },
  {
    key: 'company_names',
    label: 'Companies',
    render: (value) => (value as string[]).join(', ') || null,
  },
  {
    key: 'matched_sales_rep_names',
    label: 'Sales Reps',
    render: (value) => (value as string[]).join(', ') || null,
  },
];

export default function MeetingRecordingsPage() {
  const [data, setData] = useState<MeetingRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const { search, setSearch, appliedSearch, page, setPage } = useDebouncedSearch();
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, page_size: PAGE_SIZE };
    if (appliedSearch) params.search = appliedSearch;
    api.get('/api/meeting-recordings', { params }).then((res) => {
      setData(res.data.items);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
      setLoading(false);
    });
  }, [appliedSearch, page]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900">Meeting Recordings</h1>
      <p className="mb-6 text-sm text-zinc-500">Browse and review meeting recordings and transcripts</p>

      <div className="mb-4">
        <div className="relative max-w-md">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by title or summary…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-9 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          linkPrefix="/meeting-recordings"
          pagination={{ page, totalPages, total, pageSize: PAGE_SIZE, onPageChange: setPage }}
        />
      )}
    </div>
  );
}
