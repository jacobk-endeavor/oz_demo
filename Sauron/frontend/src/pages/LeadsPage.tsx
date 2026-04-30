import { useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { EnvelopeIcon } from '@heroicons/react/24/solid';
import { useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import api from '../api';
import { TRANSITION_MS, useAnimatedModal } from '../components/activity/types';
import MultiSelect, { type MultiSelectOption } from '../components/MultiSelect';
import { LeadDetailPane } from './LeadDetailPage';

interface LeadUser {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  color: string | null;
}

interface Lead {
  id: number;
  company: string;
  domain: string | null;
  erp: string | null;
  num_erp_users: number | null;
  num_locations: number | null;
  buying_groups: string[] | null;
  associations: string | null;
  primary_industry: string | null;
  company_type: string | null;
  revenue_m: string | null;
  type: string | null;
  hq_phone: string | null;
  hq_timezone: string | null;
  user_id: number | null;
  user: LeadUser | null;
  has_unread_email: boolean;
}

interface Assignee {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  color: string | null;
  lead_count: number;
}

interface FilterOptions {
  erps: string[];
  industries: string[];
  company_types: string[];
  tiers: string[];
  timezones: string[];
  assignees: Assignee[];
}

const PAGE_SIZE = 50;

const TIMEZONE_LABELS: Record<string, string> = {
  'America/New_York': 'Eastern', 'America/Detroit': 'Eastern',
  'America/Indiana/Indianapolis': 'Eastern', 'America/Indiana/Vincennes': 'Eastern',
  'America/Indiana/Winamac': 'Eastern', 'America/Indiana/Marengo': 'Eastern',
  'America/Indiana/Petersburg': 'Eastern', 'America/Indiana/Vevay': 'Eastern',
  'America/Kentucky/Louisville': 'Eastern', 'America/Kentucky/Monticello': 'Eastern',
  'US/Eastern': 'Eastern',
  'America/Toronto': 'Eastern', 'America/Montreal': 'Eastern',
  'America/Iqaluit': 'Eastern', 'America/Nipigon': 'Eastern',
  'America/Thunder_Bay': 'Eastern', 'America/Pangnirtung': 'Eastern',
  'Canada/Eastern': 'Eastern',
  'America/Bogota': 'Eastern', 'America/Lima': 'Eastern',
  'America/Guayaquil': 'Eastern', 'America/Rio_Branco': 'Eastern',
  'America/Chicago': 'Central', 'America/Indiana/Knox': 'Central',
  'America/Indiana/Tell_City': 'Central', 'America/Menominee': 'Central',
  'America/North_Dakota/Beulah': 'Central', 'America/North_Dakota/Center': 'Central',
  'America/North_Dakota/New_Salem': 'Central', 'US/Central': 'Central',
  'America/Winnipeg': 'Central', 'America/Rainy_River': 'Central',
  'America/Rankin_Inlet': 'Central', 'America/Resolute': 'Central',
  'America/Regina': 'Central', 'America/Swift_Current': 'Central',
  'Canada/Central': 'Central', 'Canada/Saskatchewan': 'Central',
  'America/Mexico_City': 'Central', 'America/Costa_Rica': 'Central',
  'America/El_Salvador': 'Central', 'America/Guatemala': 'Central',
  'America/Managua': 'Central', 'America/Tegucigalpa': 'Central',
  'America/Merida': 'Central', 'America/Monterrey': 'Central',
  'America/Bahia_Banderas': 'Central',
  'America/Denver': 'Mountain', 'America/Boise': 'Mountain',
  'America/Phoenix': 'Mountain', 'US/Mountain': 'Mountain', 'US/Arizona': 'Mountain',
  'America/Edmonton': 'Mountain', 'America/Cambridge_Bay': 'Mountain',
  'America/Inuvik': 'Mountain', 'America/Yellowknife': 'Mountain',
  'America/Dawson_Creek': 'Mountain', 'America/Creston': 'Mountain',
  'America/Fort_Nelson': 'Mountain', 'Canada/Mountain': 'Mountain',
  'America/Chihuahua': 'Mountain', 'America/Mazatlan': 'Mountain',
  'America/Hermosillo': 'Mountain',
  'America/Los_Angeles': 'Pacific', 'US/Pacific': 'Pacific',
  'America/Vancouver': 'Pacific', 'America/Whitehorse': 'Pacific',
  'America/Dawson': 'Pacific', 'Canada/Pacific': 'Pacific', 'Canada/Yukon': 'Pacific',
  'America/Tijuana': 'Pacific', 'Mexico/BajaNorte': 'Pacific',
  'America/Sao_Paulo': 'South America', 'America/Argentina/Buenos_Aires': 'South America',
  'America/Argentina/Cordoba': 'South America', 'America/Argentina/Salta': 'South America',
  'America/Argentina/Tucuman': 'South America', 'America/Argentina/Mendoza': 'South America',
  'America/Argentina/San_Juan': 'South America', 'America/Argentina/San_Luis': 'South America',
  'America/Argentina/Jujuy': 'South America', 'America/Argentina/Catamarca': 'South America',
  'America/Argentina/La_Rioja': 'South America', 'America/Argentina/Rio_Gallegos': 'South America',
  'America/Argentina/Ushuaia': 'South America',
  'America/Montevideo': 'South America', 'America/Santiago': 'South America',
  'America/Asuncion': 'South America', 'America/Caracas': 'South America',
  'America/La_Paz': 'South America', 'America/Manaus': 'South America',
  'America/Cuiaba': 'South America', 'America/Campo_Grande': 'South America',
  'America/Fortaleza': 'South America', 'America/Recife': 'South America',
  'America/Belem': 'South America', 'America/Bahia': 'South America',
  'America/Maceio': 'South America', 'America/Araguaina': 'South America',
  'America/Cayenne': 'South America', 'America/Paramaribo': 'South America',
  'America/Guyana': 'South America',
  'America/Anchorage': 'Alaska', 'America/Juneau': 'Alaska', 'America/Sitka': 'Alaska',
  'America/Yakutat': 'Alaska', 'America/Nome': 'Alaska', 'America/Metlakatla': 'Alaska',
  'America/Adak': 'Alaska', 'US/Alaska': 'Alaska', 'US/Aleutian': 'Alaska',
  'Pacific/Honolulu': 'Hawaii', 'US/Hawaii': 'Hawaii',
};

function formatTimezone(iana: string | null): string | null {
  if (!iana) return null;
  if (TIMEZONE_LABELS[iana]) return TIMEZONE_LABELS[iana];
  if (iana.startsWith('Europe/')) return 'Europe';
  return iana;
}

function formatRevenue(revenueM: string | null): string | null {
  if (!revenueM) return null;
  const trimmed = revenueM.trim();
  if (!trimmed) return null;

  const numeric = Number(trimmed.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(numeric)) {
    return trimmed;
  }

  const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  if (numeric >= 1000) {
    return `$${formatter.format(numeric / 1000)}B`;
  }

  return `$${formatter.format(numeric)}M`;
}

function userDisplayName(user: LeadUser | Assignee | null): string {
  if (!user) return '';
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return full || user.email;
}

const DEFAULT_BDR_COLOR = '#6b7280';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function bdrBadgeStyle(color: string | null | undefined) {
  const hex = color || DEFAULT_BDR_COLOR;
  const rgb = hexToRgb(hex);
  if (!rgb) return {};
  return {
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`,
    color: hex,
  };
}

function LeadListItem({
  lead,
  selected,
  onSelect,
}: {
  lead: Lead;
  selected: boolean;
  onSelect: () => void;
}) {
  const timezoneLabel = formatTimezone(lead.hq_timezone);
  const revenueLabel = formatRevenue(lead.revenue_m);
  const assigneeLabel = userDisplayName(lead.user);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full border-l-2 px-4 py-3 text-left transition-colors',
        selected
          ? 'border-zinc-900 bg-zinc-50'
          : 'border-transparent hover:bg-zinc-50/80',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-zinc-900">{lead.company}</span>
            {lead.has_unread_email && (
              <span className="relative flex flex-shrink-0" title="Unread email">
                <EnvelopeIcon className="h-3.5 w-3.5 text-blue-500" />
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {lead.domain || lead.primary_industry || 'No domain available'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {assigneeLabel ? (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={bdrBadgeStyle(lead.user?.color)}
              >
                {assigneeLabel}
              </span>
            ) : (
              <span className="text-[11px] text-zinc-400">Unassigned</span>
            )}
            {lead.primary_industry && (
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                {lead.primary_industry}
              </span>
            )}
            {revenueLabel && (
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                {revenueLabel}
              </span>
            )}
            {timezoneLabel && (
              <span className="text-[11px] text-zinc-400">{timezoneLabel}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function LeadDetailMobileModal({
  leadId,
  leadName,
  entered,
  onClose,
}: {
  leadId: number;
  leadName: string | null;
  entered: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center bg-zinc-900/35 backdrop-blur-[1px] transition-opacity duration-200 ease-out xl:hidden ${entered ? 'opacity-100' : 'opacity-0'
        }`}
      role="dialog"
      aria-modal="true"
      aria-label={leadName ? `${leadName} details` : 'Company details'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`flex h-[96vh] w-[96vw] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl transition-all duration-200 ease-out ${entered ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.985] opacity-0'
          }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2 sm:px-5">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-zinc-600 transition hover:text-zinc-900"
            >
              Back to companies
            </button>
            {leadName && (
              <p className="truncate text-xs text-zinc-400">{leadName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Close company details"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden overscroll-contain p-2 sm:p-3">
          <LeadDetailPane leadId={leadId} embedded className="h-full min-h-0 overflow-y-auto no-scrollbar md:overflow-hidden" />
        </div>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const leadMatch = useMatch('/leads/:id');
  const isPrivileged = role === 'admin' || role === 'exec';

  const [data, setData] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(true);
  const [selectedBdrIds, setSelectedBdrIds] = useState<string[]>([]);
  const [selectedErps, setSelectedErps] = useState<string[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [selectedTimezones, setSelectedTimezones] = useState<string[]>([]);

  const defaultsApplied = useRef(false);

  useEffect(() => {
    setFilterOptionsLoading(true);
    api
      .get<FilterOptions>('/api/leads/filter-options')
      .then((res) => setFilterOptions(res.data))
      .catch(() => setFilterOptions(null))
      .finally(() => setFilterOptionsLoading(false));
  }, []);

  const DEFAULT_BDR_FIRST_NAMES = ['John', 'Andony'];

  useEffect(() => {
    if (defaultsApplied.current || !filterOptions || !isPrivileged) return;
    defaultsApplied.current = true;
    const defaultIds = filterOptions.assignees
      .filter((a) => DEFAULT_BDR_FIRST_NAMES.includes(a.first_name ?? ''))
      .map((a) => String(a.id));
    if (defaultIds.length) setSelectedBdrIds(defaultIds);
  }, [filterOptions, isPrivileged]);

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
    setLoading(true);

    const params: Record<string, string | number> = { page, page_size: PAGE_SIZE };
    if (appliedSearch) params.search = appliedSearch;
    if (selectedBdrIds.length) params.user_ids = selectedBdrIds.join(',');
    if (selectedErps.length) params.erps = selectedErps.join(',');
    if (selectedIndustries.length) params.industries = selectedIndustries.join(',');
    if (selectedTiers.length) params.tiers = selectedTiers.join(',');
    if (selectedTimezones.length) params.timezones = selectedTimezones.join(',');

    api
      .get('/api/leads', { params })
      .then((res) => {
        if (cancelled) return;
        setData(res.data.items);
        setTotal(res.data.total);
        setTotalPages(res.data.total_pages);
      })
      .catch(() => {
        if (cancelled) return;
        setData([]);
        setTotal(0);
        setTotalPages(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appliedSearch, page, selectedBdrIds, selectedErps, selectedIndustries, selectedTiers, selectedTimezones]);

  const bdrOptions = useMemo<MultiSelectOption[]>(
    () =>
      (filterOptions?.assignees ?? []).map((a) => ({
        value: String(a.id),
        label: `${userDisplayName(a)} (${a.lead_count})`,
      })),
    [filterOptions],
  );

  const erpOptions = useMemo<MultiSelectOption[]>(
    () => (filterOptions?.erps ?? []).map((e) => ({ value: e, label: e })),
    [filterOptions],
  );

  const industryOptions = useMemo<MultiSelectOption[]>(
    () => (filterOptions?.industries ?? []).map((i) => ({ value: i, label: i })),
    [filterOptions],
  );

  const tierOptions = useMemo<MultiSelectOption[]>(
    () => (filterOptions?.tiers ?? []).map((tier) => ({ value: tier, label: tier })),
    [filterOptions],
  );

  const timezoneOptions = useMemo<MultiSelectOption[]>(
    () => (filterOptions?.timezones ?? []).map((tz) => ({ value: tz, label: tz })),
    [filterOptions],
  );

  const parsedSelectedLeadId = leadMatch?.params.id ? Number(leadMatch.params.id) : null;
  const selectedLeadId = parsedSelectedLeadId != null && Number.isFinite(parsedSelectedLeadId)
    ? parsedSelectedLeadId
    : null;
  const [isDesktopLayout, setIsDesktopLayout] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1280px)').matches : false,
  );
  const mobileModal = useAnimatedModal();
  const [mobileLeadId, setMobileLeadId] = useState<number | null>(null);
  const [mobileLeadName, setMobileLeadName] = useState<string | null>(null);
  const mobileLeadClearTimerRef = useRef<number | null>(null);
  const showFrom = total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const showTo = total > 0 ? Math.min(page * PAGE_SIZE, total) : 0;
  const selectedLead = data.find((lead) => lead.id === selectedLeadId) ?? null;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1280px)');
    const handleChange = (event: MediaQueryListEvent) => setIsDesktopLayout(event.matches);
    setIsDesktopLayout(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    return () => {
      if (mobileLeadClearTimerRef.current) {
        window.clearTimeout(mobileLeadClearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (mobileLeadClearTimerRef.current) {
      window.clearTimeout(mobileLeadClearTimerRef.current);
      mobileLeadClearTimerRef.current = null;
    }

    if (!isDesktopLayout && selectedLeadId != null) {
      setMobileLeadId(selectedLeadId);
      setMobileLeadName(selectedLead?.company ?? null);
      mobileModal.open();
      return;
    }

    if (!mobileModal.mounted && !mobileModal.isOpen) {
      setMobileLeadId(null);
      setMobileLeadName(null);
      return;
    }

    mobileModal.close();
    mobileLeadClearTimerRef.current = window.setTimeout(() => {
      setMobileLeadId(null);
      setMobileLeadName(null);
      mobileLeadClearTimerRef.current = null;
    }, TRANSITION_MS);
  }, [isDesktopLayout, selectedLeadId, selectedLead?.company, mobileModal.close, mobileModal.isOpen, mobileModal.mounted, mobileModal.open]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-2">
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <div className="relative min-w-0 md:min-w-[280px] md:flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Company, domain, or industry…"
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

          {isPrivileged && (
            <MultiSelect
              options={bdrOptions}
              selected={selectedBdrIds}
              onChange={(ids) => { setSelectedBdrIds(ids); setPage(1); }}
              placeholder="All BDRs"
              selectedDisplay="labels"
              className="w-full md:w-auto md:max-w-[250px]"
              buttonClassName="w-full md:w-auto md:min-w-[10rem] md:max-w-[250px]"
              searchable
              loading={filterOptionsLoading}
              loadingText="Loading…"
              dropdownClassName="min-w-[16rem] w-80"
            />
          )}

          <MultiSelect
            options={erpOptions}
            selected={selectedErps}
            onChange={(v) => { setSelectedErps(v); setPage(1); }}
            placeholder="All ERPs"
            selectedDisplay="labels"
            className="w-full md:w-auto md:max-w-[250px]"
            buttonClassName="w-full md:w-auto md:min-w-[9rem] md:max-w-[250px]"
            searchable
            loading={filterOptionsLoading}
            loadingText="Loading…"
          />

          <MultiSelect
            options={industryOptions}
            selected={selectedIndustries}
            onChange={(v) => { setSelectedIndustries(v); setPage(1); }}
            placeholder="All industries"
            selectedDisplay="labels"
            className="w-full md:w-auto md:max-w-[250px]"
            buttonClassName="w-full md:w-auto md:min-w-[10rem] md:max-w-[250px]"
            searchable
            loading={filterOptionsLoading}
            loadingText="Loading…"
            dropdownClassName="min-w-full w-80"
          />

          {isPrivileged && (
            <MultiSelect
              options={tierOptions}
              selected={selectedTiers}
              onChange={(v) => { setSelectedTiers(v); setPage(1); }}
              placeholder="All tiers"
              selectedDisplay="labels"
              className="w-full md:w-auto md:max-w-[220px]"
              buttonClassName="w-full md:w-auto md:min-w-[9rem] md:max-w-[220px]"
              loading={filterOptionsLoading}
              loadingText="Loading…"
            />
          )}

          <MultiSelect
            options={timezoneOptions}
            selected={selectedTimezones}
            onChange={(v) => { setSelectedTimezones(v); setPage(1); }}
            placeholder="All timezones"
            selectedDisplay="labels"
            className="w-full md:w-auto md:max-w-[250px]"
            buttonClassName="w-full md:w-auto md:min-w-[10rem] md:max-w-[250px]"
            searchable
            loading={filterOptionsLoading}
            loadingText="Loading…"
            dropdownClassName="right-0 min-w-full w-72"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:min-h-0 xl:flex-1 xl:grid xl:grid-cols-[minmax(280px,20%)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white xl:flex xl:min-h-0 xl:flex-col">
          <div className="border-b border-zinc-100 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Companies</h2>
                <p className="text-xs text-zinc-400">
                  {total > 0 ? `Showing ${showFrom}\u2013${showTo} of ${total}` : 'No matching leads'}
                </p>
              </div>
              {selectedLeadId && (
                <button
                  type="button"
                  onClick={() => navigate('/leads')}
                  className="text-xs font-medium text-zinc-400 transition hover:text-zinc-600"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="relative xl:min-h-0 xl:flex-1">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/60 pt-8">
                <p className="text-sm text-zinc-500">Loading...</p>
              </div>
            )}

            {data.length === 0 && !loading ? (
              <div className="px-4 py-10 text-center text-sm text-zinc-500">
                No leads match the current filters.
              </div>
            ) : (
              <div className={loading ? 'pointer-events-none xl:h-full xl:overflow-hidden' : 'xl:h-full xl:overflow-hidden'}>
                <div className="divide-y divide-zinc-100 xl:h-full xl:overflow-y-auto no-scrollbar">
                  {data.map((lead) => (
                    <LeadListItem
                      key={lead.id}
                      lead={lead}
                      selected={lead.id === selectedLeadId}
                      onSelect={() => navigate(`/leads/${lead.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3">
              <span className="text-xs text-zinc-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="hidden min-w-0 xl:block xl:min-h-0 xl:overflow-hidden">
          {selectedLeadId ? (
            <LeadDetailPane leadId={selectedLeadId} embedded className="h-full" />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center xl:h-full">
              <div className="max-w-sm">
                <h2 className="text-lg font-semibold text-zinc-900">Select a company</h2>
                <p className="mt-2 text-sm text-zinc-500">
                  Choose a lead from the list to view company details, enrichment, contacts, and activity without leaving this page.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {mobileLeadId != null && mobileModal.mounted && (
        <LeadDetailMobileModal
          leadId={mobileLeadId}
          leadName={mobileLeadName}
          entered={mobileModal.entered}
          onClose={() => navigate('/leads')}
        />
      )}
    </div>
  );
}
