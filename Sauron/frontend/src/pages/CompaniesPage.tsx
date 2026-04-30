import React, { useEffect, useState } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/20/solid';
import api from '../api';
import DataTable from '../components/DataTable';
import { useDebouncedSearch } from '../hooks/useDebouncedSearch';

interface Company {
  id: number;
  name: string;
  domains: string[];
  summary: string | null;
  vertical: string | null;
  revenue: string | null;
  annual_revenue: number | null;
  employee_count: number | null;
  location_count: number | null;
  linkedin: string | null;
  erp: string | null;
  competitor: string | null;
  is_named_account: boolean;
}

const PAGE_SIZE = 50;

function formatCompanyRevenue(annualRevenue: number | null, legacyRevenue: string | null): string | null {
  if (annualRevenue == null) return legacyRevenue;
  if (annualRevenue >= 1_000_000_000) return `$${(annualRevenue / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (annualRevenue >= 1_000_000) return `$${(annualRevenue / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (annualRevenue >= 1_000) return `$${(annualRevenue / 1_000).toFixed(0)}K`;
  return `$${annualRevenue}`;
}

function extractSummaryPreview(summary: string): string {
  const accountStatusSection = summary.match(
    /(?:^|\n)\s*(?:#{1,6}\s*)?1\.\s*\**Account Status\**\s*[—:-]?\s*([\s\S]*?)(?=\n\s*(?:#{1,6}\s*)?\d+\.\s*\**[^\n]+|$)/i,
  )?.[1];

  const candidate = accountStatusSection ?? summary;
  const plainText = candidate
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*#{1,6}\s+.*$/gm, ' ')
    .replace(/^\s*\d+\.\s+\*\*.*?\*\*\s*[—:-]?\s*$/gm, ' ')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*(?:Account Status|Main Champion|People Involved|Call Analysis|Action Items)\s*[—:-]?\s*/gim, ' ')
    .replace(/^\s*(?:New Lead|Open|Closed|Dead)\b\s*[—:-]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return plainText;
}

const columns: { key: keyof Company; label: string; render?: (value: Company[keyof Company], row: Company) => React.ReactNode }[] = [
  { key: 'name', label: 'Name' },
  {
    key: 'summary',
    label: 'Summary',
    render: (v) => {
      const text = v as string | null;
      if (!text) return null;
      const preview = extractSummaryPreview(text);
      if (!preview) return null;
      return (
        <p className="max-w-[48rem] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-normal text-zinc-700">
          {preview}
        </p>
      );
    },
  },
  { key: 'domains', label: 'Domains', render: (v) => (v as string[]).join(', ') || null },
  { key: 'annual_revenue', label: 'Revenue', render: (_v, row) => formatCompanyRevenue(row.annual_revenue, row.revenue) },
  { key: 'employee_count', label: 'Employees' },
  { key: 'location_count', label: 'Locations' },
  { key: 'is_named_account', label: 'Named Account' },
];

export default function CompaniesPage() {
  const [data, setData] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const { search, setSearch, appliedSearch, page, setPage } = useDebouncedSearch();
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, page_size: PAGE_SIZE };
    if (appliedSearch) params.search = appliedSearch;
    api.get('/api/companies', { params }).then((res) => {
      setData(res.data.items);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
      setLoading(false);
    });
  }, [appliedSearch, page]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900">Companies</h1>
      <p className="mb-6 text-sm text-zinc-500">Browse and explore company records</p>

      <div className="mb-4">
        <div className="relative max-w-md">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name or domain…"
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
          linkPrefix="/companies"
          pagination={{ page, totalPages, total, pageSize: PAGE_SIZE, onPageChange: setPage }}
        />
      )}
    </div>
  );
}
