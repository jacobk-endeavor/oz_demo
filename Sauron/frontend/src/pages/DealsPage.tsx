import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FunnelIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/20/solid';
import type { SortingState } from '@tanstack/react-table';
import api from '../api';
import DataTable from '../components/DataTable';
import MultiSelect, { type MultiSelectOption } from '../components/MultiSelect';
import { addDays, formatMeetingTimeRange, isSameDay, startOfDay } from '../dateUtils';
import { getStagePillColor } from '../dealStageUtils';

type LastContactType = 'email' | 'meeting';

interface Deal {
  id: number;
  name: string;
  domains: string[];
  deal_stage: string | null;
  sales_reps: SalesRepListItem[];
  last_contact_at: string | null;
  last_contact_type: LastContactType | null;
  next_meeting_start_at: string | null;
  next_meeting_title: string | null;
  next_meeting_duration_minutes: number | null;
  key_contact_name: string | null;
  key_contact_description: string | null;
  products_of_interest: string[];
  other_products_detail: string | null;
  erp_system: string | null;
  actively_migrating_erp: boolean;
  next_step: string | null;
  main_concerns: string[];
  main_selling_points: string[];
}

interface DealListResponse {
  items: Deal[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface SalesRepListItem {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface SalesRepListResponse {
  items: SalesRepListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface DealTableRow {
  id: number;
  name: string;
  domains: string[];
  deal_stage: string | null;
  sales_reps: SalesRepListItem[];
  last_contact_at: string | null;
  last_contact_type: LastContactType | null;
  next_meeting_start_at: string | null;
  next_meeting_title: string | null;
  next_meeting_duration_minutes: number | null;
  key_contact_name: string | null;
  key_contact_description: string | null;
  products_of_interest: string[];
  other_products_detail: string | null;
  erp_system: string | null;
  actively_migrating_erp: boolean;
  next_step: string | null;
  main_concerns: string[];
  main_selling_points: string[];
}

interface DealsPageSnapshot {
  deals: Deal[];
  total: number;
  totalPages: number;
}

const PAGE_SIZE = 50;
const DEAL_STAGE_SORT_ORDER: Record<string, number> = {
  'Discovery Booked': 0,
  'Post Discovery': 1,
  'Demo Booked': 2,
  'Post Demo': 3,
  'ROI Scheduled': 4,
  'Final Review': 5,
  Stagnated: 6,
  Dead: 7,
  Disqualified: 8,
};
const columns: {
  key: keyof DealTableRow;
  label: string;
  sortable?: boolean;
  sortDescFirst?: boolean;
  sortValue?: (row: DealTableRow) => string | number | null;
}[] = [
  { key: 'name', label: 'Company', sortValue: (row) => row.name.toLocaleLowerCase() },
  {
    key: 'deal_stage',
    label: 'Deal Stage',
    sortValue: (row) => (row.deal_stage ? DEAL_STAGE_SORT_ORDER[row.deal_stage] ?? Number.MAX_SAFE_INTEGER : null),
  },
  { key: 'sales_reps', label: 'Sales Reps', sortable: false },
  { key: 'last_contact_at', label: 'Last Contact', sortDescFirst: true },
  { key: 'next_meeting_start_at', label: 'Next Meeting' },
  { key: 'next_step', label: 'Next Step', sortable: false },
];
const stageOptions = [
  { value: 'Discovery Booked', label: 'Discovery Booked' },
  { value: 'Post Discovery', label: 'Post Discovery' },
  { value: 'Demo Booked', label: 'Demo Booked' },
  { value: 'Post Demo', label: 'Post Demo' },
  { value: 'ROI Scheduled', label: 'ROI Scheduled' },
  { value: 'Final Review', label: 'Final Review' },
  { value: 'Stagnated', label: 'Stagnated' },
  { value: 'Dead', label: 'Dead' },
  { value: 'Disqualified', label: 'Disqualified' },
];
const productOptions = [
  { value: 'Order Entry', label: 'Order Entry' },
  { value: 'Quoting', label: 'Quoting' },
  { value: 'Price Optimization', label: 'Price Optimization' },
  { value: 'Accounts Payable', label: 'Accounts Payable' },
  { value: 'Accounts Receivable', label: 'Accounts Receivable' },
  { value: 'Sales Analytics', label: 'Sales Analytics' },
  { value: 'Other', label: 'Other' },
];

interface DealFilters {
  search: string;
  selectedStages: string[];
  selectedProducts: string[];
  selectedSalesRepIds: string[];
  page: number;
  sorting: SortingState;
}

const SORTABLE_DEAL_COLUMN_KEYS = new Set(
  columns.filter((column) => column.sortable !== false).map((column) => String(column.key)),
);

function serializeSorting(sorting: SortingState): string {
  return sorting
    .filter((entry) => SORTABLE_DEAL_COLUMN_KEYS.has(entry.id))
    .map((entry) => `${entry.id}:${entry.desc ? 'desc' : 'asc'}`)
    .join(',');
}

function parseSorting(searchString: string): SortingState {
  const params = new URLSearchParams(searchString);
  const rawSorting = params.get('sort') ?? '';

  return rawSorting
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, direction] = entry.split(':');
      if (!id || !SORTABLE_DEAL_COLUMN_KEYS.has(id)) return null;
      if (direction !== 'asc' && direction !== 'desc') return null;
      return { id, desc: direction === 'desc' };
    })
    .filter((entry): entry is SortingState[number] => entry !== null);
}

function parseFilters(searchString: string): DealFilters {
  const params = new URLSearchParams(searchString);
  const pageParam = Number(params.get('page') ?? '1');

  return {
    search: params.get('search')?.trim() ?? '',
    selectedStages: (params.get('deal_stages') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    selectedProducts: (params.get('products') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    selectedSalesRepIds: (params.get('sales_rep_ids') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    page: Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1,
    sorting: parseSorting(searchString),
  };
}

function buildFilterSearch({
  search,
  selectedStages,
  selectedProducts,
  selectedSalesRepIds,
  page,
  sorting,
}: DealFilters): string {
  const params = new URLSearchParams();

  if (search) params.set('search', search);
  if (selectedStages.length) params.set('deal_stages', selectedStages.join(','));
  if (selectedProducts.length) params.set('products', selectedProducts.join(','));
  if (selectedSalesRepIds.length) params.set('sales_rep_ids', selectedSalesRepIds.join(','));
  if (page > 1) params.set('page', String(page));
  if (sorting.length) params.set('sort', serializeSorting(sorting));

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
}

function getDealsScrollStorageKey(backTo: string): string {
  return `deals-scroll:${backTo}`;
}

function getDealsSnapshotStorageKey(backTo: string): string {
  return `deals-snapshot:${backTo}`;
}

function readDealsSnapshot(backTo: string): DealsPageSnapshot | null {
  const saved = sessionStorage.getItem(getDealsSnapshotStorageKey(backTo));
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved) as Partial<DealsPageSnapshot>;
    if (!Array.isArray(parsed.deals)) return null;
    return {
      deals: parsed.deals.map((deal) => normalizeDeal(deal as Partial<Deal>)),
      total: typeof parsed.total === 'number' ? parsed.total : 0,
      totalPages: typeof parsed.totalPages === 'number' ? parsed.totalPages : 0,
    };
  } catch {
    return null;
  }
}

function summarizeList(items: string[], limit = 2): string | null {
  if (items.length === 0) return null;
  const visible = items.slice(0, limit);
  const extraCount = items.length - visible.length;
  return extraCount > 0 ? `${visible.join(', ')} +${extraCount}` : visible.join(', ');
}

function truncateText(value: string | null, maxLength = 120): string | null {
  if (!value) return null;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseDateTime(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCompactDateTime(value: string | null): string | null {
  const parsed = parseDateTime(value);
  if (!parsed) return null;
  const sameYear = parsed.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatPastRelativeTime(value: string | null): string | null {
  const parsed = parseDateTime(value);
  if (!parsed) return null;

  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 0) return formatCompactDateTime(value);

  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes <= 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(parsed.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  });
}

function formatUpcomingMeetingLabel(startAt: string | null, durationMinutes: number | null): string | null {
  const parsed = parseDateTime(startAt);
  if (!parsed) return null;

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  let dayLabel: string;

  if (isSameDay(parsed, today)) {
    dayLabel = 'Today';
  } else if (isSameDay(parsed, tomorrow)) {
    dayLabel = 'Tomorrow';
  } else {
    dayLabel = parsed.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(parsed.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
    });
  }

  return `${dayLabel}, ${formatMeetingTimeRange(startAt, durationMinutes)}`;
}

function normalizeDeal(deal: Partial<Deal>): Deal {
  return {
    id: deal.id ?? 0,
    name: deal.name ?? '',
    domains: Array.isArray(deal.domains) ? deal.domains : [],
    deal_stage: deal.deal_stage ?? null,
    sales_reps: Array.isArray(deal.sales_reps) ? deal.sales_reps : [],
    last_contact_at: deal.last_contact_at ?? null,
    last_contact_type:
      deal.last_contact_type === 'email' || deal.last_contact_type === 'meeting'
        ? deal.last_contact_type
        : null,
    next_meeting_start_at: deal.next_meeting_start_at ?? null,
    next_meeting_title: deal.next_meeting_title ?? null,
    next_meeting_duration_minutes:
      typeof deal.next_meeting_duration_minutes === 'number' ? deal.next_meeting_duration_minutes : null,
    key_contact_name: deal.key_contact_name ?? null,
    key_contact_description: deal.key_contact_description ?? null,
    products_of_interest: Array.isArray(deal.products_of_interest) ? deal.products_of_interest : [],
    other_products_detail: deal.other_products_detail ?? null,
    erp_system: deal.erp_system ?? null,
    actively_migrating_erp: Boolean(deal.actively_migrating_erp),
    next_step: deal.next_step ?? null,
    main_concerns: Array.isArray(deal.main_concerns) ? deal.main_concerns : [],
    main_selling_points: Array.isArray(deal.main_selling_points) ? deal.main_selling_points : [],
  };
}

function formatSalesRepLabel(rep: SalesRepListItem): string {
  const fullName = [rep.first_name, rep.last_name].filter(Boolean).join(' ').trim();
  return fullName || rep.email || `Rep ${rep.id}`;
}

export default function DealsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialFilters = useMemo(() => parseFilters(location.search), [location.search]);
  const currentDealsUrl = `${location.pathname}${location.search}`;
  const initialSnapshot = useMemo(() => readDealsSnapshot(currentDealsUrl), [currentDealsUrl]);
  const [deals, setDeals] = useState<Deal[]>(() => initialSnapshot?.deals ?? []);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialFilters.search);
  const [appliedSearch, setAppliedSearch] = useState(initialFilters.search);
  const [selectedStages, setSelectedStages] = useState<string[]>(initialFilters.selectedStages);
  const [selectedProducts, setSelectedProducts] = useState<string[]>(initialFilters.selectedProducts);
  const [selectedSalesRepIds, setSelectedSalesRepIds] = useState<string[]>(initialFilters.selectedSalesRepIds);
  const [salesRepOptionItems, setSalesRepOptionItems] = useState<MultiSelectOption[]>([]);
  const [page, setPage] = useState(initialFilters.page);
  const [sorting, setSorting] = useState<SortingState>(initialFilters.sorting);
  const [total, setTotal] = useState(() => initialSnapshot?.total ?? 0);
  const [totalPages, setTotalPages] = useState(() => initialSnapshot?.totalPages ?? 0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRestoredRef = useRef(false);

  useEffect(() => {
    const nextFilters = parseFilters(location.search);
    const snapshot = readDealsSnapshot(`${location.pathname}${location.search}`);

    setSearch((current) => (current === nextFilters.search ? current : nextFilters.search));
    setAppliedSearch((current) => (current === nextFilters.search ? current : nextFilters.search));
    setSelectedStages((current) =>
      current.join('|') === nextFilters.selectedStages.join('|') ? current : nextFilters.selectedStages
    );
    setSelectedProducts((current) =>
      current.join('|') === nextFilters.selectedProducts.join('|') ? current : nextFilters.selectedProducts
    );
    setSelectedSalesRepIds((current) =>
      current.join('|') === nextFilters.selectedSalesRepIds.join('|') ? current : nextFilters.selectedSalesRepIds
    );
    setPage((current) => (current === nextFilters.page ? current : nextFilters.page));
    setSorting((current) => (serializeSorting(current) === serializeSorting(nextFilters.sorting) ? current : nextFilters.sorting));
    if (snapshot) {
      setDeals(snapshot.deals);
      setTotal(snapshot.total);
      setTotalPages(snapshot.totalPages);
    }
    scrollRestoredRef.current = false;
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setAppliedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<SalesRepListResponse>('/api/sales-reps', {
        params: { page: 1, page_size: 200, has_deals: true, user_email_match_only: true },
      })
      .then((res) => {
        if (cancelled) return;
        setSalesRepOptionItems(
          res.data.items.map((rep) => ({
            value: String(rep.id),
            label: formatSalesRepLabel(rep),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setSalesRepOptionItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params: Record<string, string | number> = { page, page_size: PAGE_SIZE };
    if (appliedSearch) params.search = appliedSearch;
    if (selectedStages.length) params.deal_stages = selectedStages.join(',');
    if (selectedProducts.length) params.products = selectedProducts.join(',');
    if (selectedSalesRepIds.length) params.sales_rep_ids = selectedSalesRepIds.join(',');

    api
      .get<DealListResponse>('/api/deals', { params })
      .then((res) => {
        if (cancelled) return;
        setDeals(res.data.items.map((deal) => normalizeDeal(deal)));
        setTotal(res.data.total);
        setTotalPages(res.data.total_pages);
      })
      .catch(() => {
        if (cancelled) return;
        setDeals([]);
        setTotal(0);
        setTotalPages(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appliedSearch, page, selectedProducts, selectedSalesRepIds, selectedStages]);

  useEffect(() => {
    const nextSearch = buildFilterSearch({
      search: appliedSearch,
      selectedStages,
      selectedProducts,
      selectedSalesRepIds,
      page,
      sorting,
    });

    if (nextSearch !== location.search) {
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: true });
    }
  }, [appliedSearch, location.pathname, location.search, navigate, page, selectedProducts, selectedSalesRepIds, selectedStages, sorting]);

  useEffect(() => {
    sessionStorage.setItem(
      getDealsSnapshotStorageKey(currentDealsUrl),
      JSON.stringify({ deals, total, totalPages } satisfies DealsPageSnapshot),
    );
  }, [currentDealsUrl, deals, total, totalPages]);

  useLayoutEffect(() => {
    if (scrollRestoredRef.current) return;

    const storageKey = getDealsScrollStorageKey(currentDealsUrl);
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;

    const el = document.getElementById('main-scroll');
    if (!el) return;

    el.scrollTop = parseInt(saved, 10);
    sessionStorage.removeItem(storageKey);
    scrollRestoredRef.current = true;
  }, [currentDealsUrl]);

  useEffect(() => {
    if (loading || scrollRestoredRef.current) return;

    const storageKey = getDealsScrollStorageKey(currentDealsUrl);
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;

    scrollRestoredRef.current = true;
    sessionStorage.removeItem(storageKey);

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById('main-scroll');
        if (el) el.scrollTop = parseInt(saved, 10);
      }),
    );
  }, [currentDealsUrl, loading]);

  const rows = useMemo<DealTableRow[]>(
    () => deals.map((deal) => normalizeDeal(deal)),
    [deals]
  );

  const productOptionItems = useMemo<MultiSelectOption[]>(
    () => productOptions.map((product) => ({ value: product.value, label: product.label })),
    []
  );
  const stageOptionItems = useMemo<MultiSelectOption[]>(
    () => stageOptions.map((stage) => ({ value: stage.value, label: stage.label })),
    []
  );

  function clearAllFilters() {
    setSearch('');
    setAppliedSearch('');
    setSelectedStages([]);
    setSelectedProducts([]);
    setSelectedSalesRepIds([]);
    setPage(1);
  }

  const handleDealClick = useCallback((row: DealTableRow) => {
    const backTo = `/deals${buildFilterSearch({
      search: appliedSearch,
      selectedStages,
      selectedProducts,
      selectedSalesRepIds,
      page,
      sorting,
    })}`;
    const el = document.getElementById('main-scroll');

    if (el) {
      sessionStorage.setItem(getDealsScrollStorageKey(backTo), String(el.scrollTop));
      sessionStorage.setItem(
        getDealsSnapshotStorageKey(backTo),
        JSON.stringify({ deals, total, totalPages } satisfies DealsPageSnapshot),
      );
    }

    navigate(`/companies/${row.id}`, { state: { backTo, backLabel: 'Deals' } });
  }, [appliedSearch, deals, navigate, page, selectedProducts, selectedSalesRepIds, selectedStages, sorting, total, totalPages]);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; group: string; onRemove: () => void }[] = [];
    if (appliedSearch) {
      chips.push({
        key: 'search',
        label: `"${appliedSearch}"`,
        group: 'Search',
        onRemove: () => { setSearch(''); setAppliedSearch(''); },
      });
    }
    for (const stage of selectedStages) {
      const option = stageOptionItems.find((o) => o.value === stage);
      chips.push({
        key: `stage-${stage}`,
        label: option?.label ?? stage,
        group: 'Stage',
        onRemove: () => setSelectedStages((prev) => prev.filter((value) => value !== stage)),
      });
    }
    for (const product of selectedProducts) {
      const option = productOptionItems.find((o) => o.value === product);
      chips.push({
        key: `product-${product}`,
        label: option?.label ?? product,
        group: 'Product',
        onRemove: () => setSelectedProducts((prev) => prev.filter((value) => value !== product)),
      });
    }
    for (const salesRepId of selectedSalesRepIds) {
      const option = salesRepOptionItems.find((o) => o.value === salesRepId);
      chips.push({
        key: `sales-rep-${salesRepId}`,
        label: option?.label ?? salesRepId,
        group: 'Sales Rep',
        onRemove: () => setSelectedSalesRepIds((prev) => prev.filter((value) => value !== salesRepId)),
      });
    }
    return chips;
  }, [appliedSearch, salesRepOptionItems, selectedProducts, selectedSalesRepIds, selectedStages, productOptionItems, stageOptionItems]);

  const tableColumns = useMemo(
    () =>
      columns.map((column) => {
        if (column.key === 'name') {
          return {
            ...column,
            render: (_value: DealTableRow[keyof DealTableRow], row: DealTableRow) => (
              <div className="min-w-[15rem]">
                <p className="font-medium text-zinc-900">{row.name}</p>
                {row.domains.length > 0 && (
                  <p className="mt-0.5 text-xs text-zinc-500">{row.domains[0]}</p>
                )}
              </div>
            ),
          };
        }

        if (column.key === 'deal_stage') {
          return {
            ...column,
            render: (value: DealTableRow[keyof DealTableRow]) => {
              const stage = value as string | null;
              if (!stage) return null;
              return (
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getStagePillColor(stage)}`}>
                  {stage}
                </span>
              );
            },
          };
        }

        if (column.key === 'sales_reps') {
          return {
            ...column,
            render: (value: DealTableRow[keyof DealTableRow]) => {
              const salesReps = Array.isArray(value) ? value as SalesRepListItem[] : [];
              if (salesReps.length === 0) return '—';
              return (
                <div className="max-w-[16rem]">
                  <p className="font-medium text-zinc-900">
                    {summarizeList(salesReps.map((rep) => formatSalesRepLabel(rep)), 2) ?? '—'}
                  </p>
                </div>
              );
            },
          };
        }

        if (column.key === 'last_contact_at') {
          return {
            ...column,
            render: (_value: DealTableRow[keyof DealTableRow], row: DealTableRow) => {
              const relativeLabel = formatPastRelativeTime(row.last_contact_at);
              const absoluteLabel = formatCompactDateTime(row.last_contact_at);
              const contactLabel =
                row.last_contact_type === 'meeting'
                  ? 'Meeting'
                  : row.last_contact_type === 'email'
                    ? 'Email'
                    : null;
              if (!relativeLabel || !contactLabel) return '—';
              return (
                <div className="max-w-[14rem]">
                  <p className="font-medium text-zinc-900">{relativeLabel}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {contactLabel}
                    {absoluteLabel ? ` • ${absoluteLabel}` : ''}
                  </p>
                </div>
              );
            },
          };
        }

        if (column.key === 'next_meeting_start_at') {
          return {
            ...column,
            render: (_value: DealTableRow[keyof DealTableRow], row: DealTableRow) => {
              const meetingLabel = formatUpcomingMeetingLabel(
                row.next_meeting_start_at,
                row.next_meeting_duration_minutes
              );
              if (!meetingLabel) return '—';
              return (
                <div className="max-w-[16rem]">
                  <p className="font-medium text-zinc-900">{meetingLabel}</p>
                  {row.next_meeting_title && (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {truncateText(row.next_meeting_title, 90)}
                    </p>
                  )}
                </div>
              );
            },
          };
        }

        if (column.key === 'next_step') {
          return {
            ...column,
            render: (value: DealTableRow[keyof DealTableRow]) => (
              <p className="max-w-[20rem] text-sm text-zinc-700">
                {truncateText(value as string | null, 120) || '—'}
              </p>
            ),
          };
        }

        return column;
      }),
    []
  );

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900">Deals</h1>
      <p className="mb-4 text-sm text-zinc-500">
        Company pipeline inferred from meeting key facts instead of HubSpot deal records
      </p>

      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px_220px]">
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Search</label>
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Company, contact, product, concern, or stage..."
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

        <MultiSelect
          label="Deal Stage"
          options={stageOptionItems}
          selected={selectedStages}
          onChange={(values) => { setSelectedStages(values); setPage(1); }}
          placeholder="All stages"
        />

        <MultiSelect
          label="Product"
          options={productOptionItems}
          selected={selectedProducts}
          onChange={(values) => { setSelectedProducts(values); setPage(1); }}
          placeholder="All products"
        />

        <MultiSelect
          label="Sales Rep"
          options={salesRepOptionItems}
          selected={selectedSalesRepIds}
          onChange={(values) => { setSelectedSalesRepIds(values); setPage(1); }}
          placeholder="All sales reps"
        />
      </div>

      {activeChips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <FunnelIcon className="h-3.5 w-3.5 text-zinc-400" />
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700"
            >
              <span className="text-zinc-400">{chip.group}:</span>
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                className="ml-0.5 rounded-sm text-zinc-400 hover:text-zinc-600"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
          <span className="mx-1 text-xs text-zinc-400">&middot;</span>
          <span className="text-xs text-zinc-500">
            {total.toLocaleString()} {total === 1 ? 'result' : 'results'}
          </span>
          <button
            onClick={clearAllFilters}
            className="ml-1 rounded-md px-2 py-0.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/60 pt-12">
            <p className="text-sm text-zinc-500">Loading...</p>
          </div>
        )}
        <div className={loading ? 'pointer-events-none' : undefined}>
          <DataTable
            columns={tableColumns}
            data={rows}
            onRowClick={handleDealClick}
            sorting={sorting}
            onSortingChange={setSorting}
            pagination={{ page, totalPages, total, pageSize: PAGE_SIZE, onPageChange: setPage }}
          />
        </div>
      </div>
    </div>
  );
}
