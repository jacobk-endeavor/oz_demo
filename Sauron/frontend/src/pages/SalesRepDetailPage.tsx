import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  BarsArrowDownIcon,
  BarsArrowUpIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
  ClockIcon,
  FunnelIcon,
  ListBulletIcon,
  PlayCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import api from '../api';
import { useAuth } from '../AuthContext';
import { getStagePillColor } from '../dealStageUtils';
import { isCustomerMeeting } from '../meetingUtils';
import WeekCalendar, {
  type CalendarMeeting,
  getMonday,
  weekRangeLabel,
  REP_COLORS,
  DEFAULT_COLORS,
} from '../components/WeekCalendar';
import { addDays, browserTimeZone, toISODate, formatDateLabel, formatMeetingTimeRange, weeksSince, formatEngagementWeeks } from '../dateUtils';
import CalendarsSection from '../components/CalendarsSection';
import DateNavBar from '../components/DateNavBar';
import Dropdown from '../components/Dropdown';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SalesRepDetail {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  hubspot_owner_id: string | null;
  calendars: { id: number; sales_rep_id: number; label: string; calendar_url: string; created_at: string; updated_at: string }[];
}

interface RepMeeting {
  id: number;
  title: string;
  start_at: string | null;
  duration_minutes: number | null;
  meeting_recording_ids: number[];
  company_names: string[];
  sales_reps: { id: number; email: string | null; display_name: string }[];
}

interface RepMeetingListResponse {
  items: RepMeeting[];
  total: number;
}

interface RepCompany {
  id: number;
  name: string;
  meeting_count: number;
  deal_stage: string | null;
  key_contact_name: string | null;
  first_meeting_at: string | null;
}

type ViewMode = 'calendar' | 'list';

type CompanySortKey = 'meetings_desc' | 'meetings_asc' | 'name_asc' | 'name_desc' | 'stage' | 'engagement_desc' | 'engagement_asc';

const SORT_LABELS: Record<CompanySortKey, string> = {
  meetings_desc: 'Meetings (most)',
  meetings_asc: 'Meetings (fewest)',
  name_asc: 'Name (A–Z)',
  name_desc: 'Name (Z–A)',
  stage: 'Deal Stage',
  engagement_desc: 'Engagement (longest)',
  engagement_asc: 'Engagement (shortest)',
};

const STAGE_ORDER: Record<string, number> = {
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

function firstMeetingTime(c: RepCompany, fallback: number): number {
  return c.first_meeting_at ? new Date(c.first_meeting_at).getTime() : fallback;
}

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function MeetingRow({ meeting, onClick }: { meeting: RepMeeting; onClick: () => void }) {
  const recordingCount = meeting.meeting_recording_ids.length;
  return (
    <article className="cursor-pointer px-4 py-3 transition hover:bg-zinc-50" onClick={onClick}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-700">
          <ClockIcon className="h-4 w-4 text-zinc-400" />
          {formatMeetingTimeRange(meeting.start_at, meeting.duration_minutes)}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
            recordingCount > 0
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-zinc-200 bg-zinc-50 text-zinc-500'
          }`}
        >
          <PlayCircleIcon className="h-4 w-4" />
          {recordingCount > 0
            ? `${recordingCount} recording${recordingCount === 1 ? '' : 's'}`
            : 'No recording'}
        </span>
      </div>
      <h3 className="mt-1 text-sm font-semibold text-zinc-900">
        {meeting.title || 'Untitled meeting'}
      </h3>
      {meeting.company_names.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {meeting.company_names.map((name) => (
            <span
              key={`${meeting.id}-${name}`}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600"
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function CompanyRow({
  company,
  onClick,
}: {
  company: RepCompany;
  onClick: () => void;
}) {
  const engLabel = formatEngagementWeeks(weeksSince(company.first_meeting_at));
  return (
    <article
      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-zinc-50"
      onClick={onClick}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100">
        <BuildingOffice2Icon className="h-4 w-4 text-zinc-500" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-zinc-900">{company.name}</h3>
        <div className="mt-0.5 flex items-center gap-3">
          {company.key_contact_name && (
            <span className="truncate text-xs text-zinc-500">{company.key_contact_name}</span>
          )}
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${getStagePillColor(company.deal_stage)}`}>
            {company.deal_stage || '—'}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-zinc-600">
          {company.meeting_count} meeting{company.meeting_count === 1 ? '' : 's'}
        </span>
        {engLabel && (
          <span className="text-[11px] tabular-nums text-zinc-400">{engLabel}</span>
        )}
      </div>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-300" />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function SalesRepDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  /* ---- sessionStorage keys ---- */
  const SK_CACHE   = `salesRepCache_${id}`;
  const SK_FILTERS = `salesRepFilters_${id}`;
  const SK_SCROLL  = `salesRepScroll_${id}`;

  /* Read persisted cache + filters once on mount */
  const persistedRef = useRef<{ cache: Record<string, any>; filters: Record<string, any> } | null>(null);
  if (persistedRef.current === null) {
    const readJson = (key: string) => {
      try { const r = sessionStorage.getItem(key); return r ? JSON.parse(r) : {}; }
      catch { return {}; }
    };
    persistedRef.current = { cache: readJson(SK_CACHE), filters: readJson(SK_FILTERS) };
  }
  const { cache: cached, filters: savedFilters } = persistedRef.current;

  /* Core data (initialised from cache for stale-while-revalidate) */
  const [data, setData] = useState<SalesRepDetail | null>(cached.data ?? null);
  const [companies, setCompanies] = useState<RepCompany[]>(cached.companies ?? []);
  const [calMeetings, setCalMeetings] = useState<CalendarMeeting[]>(cached.calMeetings ?? []);
  const [meetings, setMeetings] = useState<RepMeeting[]>(cached.meetings ?? []);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [calLoading, setCalLoading] = useState(true);
  const [meetingsLoading, setMeetingsLoading] = useState(false);

  /* View & filter state (initialised from persisted filters) */
  const [viewMode, setViewMode] = useState<ViewMode>(savedFilters.viewMode ?? 'calendar');
  const [customerOnly, setCustomerOnly] = useState(savedFilters.customerOnly ?? true);
  const [companyWeeks, setCompanyWeeks] = useState(savedFilters.companyWeeks ?? 1);
  const [companySortKey, setCompanySortKey] = useState<CompanySortKey>(savedFilters.companySortKey ?? 'meetings_desc');
  const [stageFilter, setStageFilter] = useState<Set<string>>(new Set(savedFilters.stageFilter ?? []));

  /* Calendar / list navigation state */
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [meetingsDate, setMeetingsDate] = useState<Date>(todayMidnight);

  /* ---- Persist filters on change ---- */
  useEffect(() => {
    sessionStorage.setItem(SK_FILTERS, JSON.stringify({
      viewMode, customerOnly, companyWeeks, companySortKey, stageFilter: [...stageFilter],
    }));
  }, [viewMode, customerOnly, companyWeeks, companySortKey, stageFilter, SK_FILTERS]);

  /* ---- Scroll restoration ---- */
  const scrollRestoredRef = useRef(false);
  const hasCachedContent = cached.data != null;
  const contentReady = hasCachedContent
    ? !!data
    : !!data && !companiesLoading && (viewMode === 'calendar' ? !calLoading : !meetingsLoading);

  useEffect(() => {
    if (scrollRestoredRef.current || !contentReady) return;
    scrollRestoredRef.current = true;
    const saved = sessionStorage.getItem(SK_SCROLL);
    if (saved) {
      sessionStorage.removeItem(SK_SCROLL);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = document.getElementById('main-scroll');
          if (el) el.scrollTop = parseInt(saved, 10);
        }),
      );
    }
  }, [contentReady, SK_SCROLL]);

  const saveStateBeforeNavigation = useCallback(() => {
    const el = document.getElementById('main-scroll');
    if (el) sessionStorage.setItem(SK_SCROLL, String(el.scrollTop));
    sessionStorage.setItem(SK_CACHE, JSON.stringify({ data, companies, calMeetings, meetings }));
  }, [SK_SCROLL, SK_CACHE, data, companies, calMeetings, meetings]);

  /* ---- Data fetching ---- */

  const loadRep = useCallback(() => {
    api.get(`/api/sales-reps/${id}`).then((res) => setData(res.data));
  }, [id]);

  useEffect(() => { loadRep(); }, [loadRep]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setCompaniesLoading(true);
    api
      .get<{ items: RepCompany[] }>(`/api/sales-reps/${id}/companies`, { params: { weeks: companyWeeks } })
      .then((res) => { if (!cancelled) setCompanies(res.data.items); })
      .catch(() => { if (!cancelled) setCompanies([]); })
      .finally(() => { if (!cancelled) setCompaniesLoading(false); });
    return () => { cancelled = true; };
  }, [id, companyWeeks]);

  useEffect(() => {
    if (!id || viewMode !== 'list') return;
    let cancelled = false;
    const dateStr = toISODate(meetingsDate);
    setMeetingsLoading(true);
    api
      .get<RepMeetingListResponse>('/api/meetings', {
        params: { sales_rep_id: id, date_from: dateStr, date_to: dateStr, timezone: browserTimeZone(), page: 1, page_size: 1000 },
      })
      .then((res) => {
        if (cancelled) return;
        const sorted = [...res.data.items].sort((a, b) => {
          const aTime = a.start_at ? new Date(a.start_at).getTime() : Number.POSITIVE_INFINITY;
          const bTime = b.start_at ? new Date(b.start_at).getTime() : Number.POSITIVE_INFINITY;
          return aTime - bTime;
        });
        setMeetings(sorted);
      })
      .catch(() => { if (!cancelled) setMeetings([]); })
      .finally(() => { if (!cancelled) setMeetingsLoading(false); });
    return () => { cancelled = true; };
  }, [id, meetingsDate, viewMode]);

  useEffect(() => {
    if (!id || viewMode !== 'calendar') return;
    let cancelled = false;
    setCalLoading(true);
    api
      .get<RepMeetingListResponse>('/api/meetings', {
        params: { sales_rep_id: id, date_from: toISODate(weekStart), date_to: toISODate(addDays(weekStart, 4)), timezone: browserTimeZone(), page: 1, page_size: 1000 },
      })
      .then((res) => { if (!cancelled) setCalMeetings(res.data.items); })
      .catch(() => { if (!cancelled) setCalMeetings([]); })
      .finally(() => { if (!cancelled) setCalLoading(false); });
    return () => { cancelled = true; };
  }, [id, weekStart, viewMode]);

  /* ---- Derived data ---- */

  const filteredCalMeetings = useMemo(
    () => (customerOnly ? calMeetings.filter(isCustomerMeeting) : calMeetings),
    [calMeetings, customerOnly],
  );
  const filteredMeetings = useMemo(
    () => (customerOnly ? meetings.filter(isCustomerMeeting) : meetings),
    [meetings, customerOnly],
  );

  const availableStages = useMemo(() => {
    const stages = new Set<string>();
    for (const c of companies) if (c.deal_stage) stages.add(c.deal_stage);
    return [...stages].sort((a, b) => (STAGE_ORDER[a] ?? 99) - (STAGE_ORDER[b] ?? 99));
  }, [companies]);

  const displayedCompanies = useMemo(() => {
    let list = companies;
    if (stageFilter.size > 0) {
      list = list.filter((c) => c.deal_stage !== null && stageFilter.has(c.deal_stage));
    }
    const sorted = [...list];
    switch (companySortKey) {
      case 'meetings_desc':
        sorted.sort((a, b) => b.meeting_count - a.meeting_count || a.name.localeCompare(b.name));
        break;
      case 'meetings_asc':
        sorted.sort((a, b) => a.meeting_count - b.meeting_count || a.name.localeCompare(b.name));
        break;
      case 'name_asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name_desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'stage':
        sorted.sort(
          (a, b) =>
            (STAGE_ORDER[a.deal_stage ?? ''] ?? 99) - (STAGE_ORDER[b.deal_stage ?? ''] ?? 99) ||
            a.name.localeCompare(b.name),
        );
        break;
      case 'engagement_desc':
        sorted.sort((a, b) => firstMeetingTime(a, Infinity) - firstMeetingTime(b, Infinity) || a.name.localeCompare(b.name));
        break;
      case 'engagement_asc':
        sorted.sort((a, b) => firstMeetingTime(b, -Infinity) - firstMeetingTime(a, -Infinity) || a.name.localeCompare(b.name));
        break;
    }
    return sorted;
  }, [companies, stageFilter, companySortKey]);

  if (!data) return <p className="text-sm text-zinc-500">Loading...</p>;

  const displayName = [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Unnamed Rep';
  const repColorScheme = REP_COLORS[displayName] ?? DEFAULT_COLORS;

  /* ---- Render ---- */

  return (
    <div>
      <button
        onClick={() => navigate('/sales-reps')}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-700"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Back
      </button>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">{displayName}</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCustomerOnly((prev: boolean) => !prev)}
            aria-pressed={customerOnly}
            className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
              customerOnly
                ? 'border-zinc-700 bg-zinc-700 text-white'
                : 'border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200/70'
            }`}
          >
            <span>Customer Only</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
                customerOnly ? 'bg-zinc-600 text-zinc-100' : 'bg-zinc-200 text-zinc-500'
              }`}
            >
              {customerOnly ? 'ON' : 'OFF'}
            </span>
          </button>
          <div className="inline-flex overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition ${
                viewMode === 'calendar'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:bg-white hover:text-zinc-700'
              }`}
            >
              <CalendarDaysIcon className="h-3.5 w-3.5" />
              Calendar
            </button>
            <div className="w-px bg-zinc-200" />
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition ${
                viewMode === 'list'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:bg-white hover:text-zinc-700'
              }`}
            >
              <ListBulletIcon className="h-3.5 w-3.5" />
              List
            </button>
          </div>
        </div>
      </div>

      {/* Meetings: calendar or list view */}
      {viewMode === 'calendar' ? (
        <>
          <DateNavBar
            label={weekRangeLabel(weekStart)}
            onPrev={() => setWeekStart((prev) => addDays(prev, -7))}
            onNext={() => setWeekStart((prev) => addDays(prev, 7))}
            resetLabel="This Week"
            onReset={() => setWeekStart(getMonday(new Date()))}
          />
          <div className="mb-4">
            {calLoading && calMeetings.length === 0 ? (
              <div className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white py-20 text-sm text-zinc-500 shadow-sm">
                Loading calendar...
              </div>
            ) : (
              <WeekCalendar
                monday={weekStart}
                meetings={filteredCalMeetings}
                onMeetingClick={(meetingId) => navigate(`/meetings/${meetingId}`)}
                colorOverride={repColorScheme}
              />
            )}
          </div>
        </>
      ) : (
        <>
          <DateNavBar
            label={formatDateLabel(meetingsDate)}
            onPrev={() => setMeetingsDate((prev) => addDays(prev, -1))}
            onNext={() => setMeetingsDate((prev) => addDays(prev, 1))}
            resetLabel="Today"
            onReset={() => setMeetingsDate(todayMidnight())}
          />
          <div className="mb-4 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {meetingsLoading && meetings.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">Loading meetings...</div>
            ) : filteredMeetings.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No meetings on this day</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {filteredMeetings.map((m) => (
                  <MeetingRow key={m.id} meeting={m} onClick={() => navigate(`/meetings/${m.id}`)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Recent companies toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-zinc-900">
          Recent Companies
          {companies.length > 0 && (
            <span className="ml-2 text-sm font-normal text-zinc-400">
              ({displayedCompanies.length}{stageFilter.size > 0 ? ` of ${companies.length}` : ''})
            </span>
          )}
        </h2>
        <Dropdown
          className="w-36"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50"
            >
              Past {companyWeeks} week{companyWeeks > 1 ? 's' : ''}
              <ChevronUpDownIcon className="h-3.5 w-3.5 text-zinc-400" />
            </button>
          )}
        >
          {(close) =>
            [1, 2, 3, 4].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => { setCompanyWeeks(w); close(); }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition hover:bg-zinc-50 ${
                  companyWeeks === w ? 'font-medium text-zinc-900' : 'text-zinc-600'
                }`}
              >
                Past {w} week{w > 1 ? 's' : ''}
                {companyWeeks === w && <CheckIcon className="h-3.5 w-3.5 text-zinc-700" />}
              </button>
            ))
          }
        </Dropdown>

        <div className="ml-auto flex items-center gap-2">
          <Dropdown
            align="right"
            trigger={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50"
              >
                {companySortKey.includes('desc') || companySortKey === 'stage' ? (
                  <BarsArrowDownIcon className="h-3.5 w-3.5 text-zinc-400" />
                ) : (
                  <BarsArrowUpIcon className="h-3.5 w-3.5 text-zinc-400" />
                )}
                {SORT_LABELS[companySortKey]}
                <ChevronUpDownIcon className="h-3.5 w-3.5 text-zinc-400" />
              </button>
            )}
          >
            {(close) =>
              (Object.entries(SORT_LABELS) as [CompanySortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setCompanySortKey(key); close(); }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition hover:bg-zinc-50 ${
                    companySortKey === key ? 'font-medium text-zinc-900' : 'text-zinc-600'
                  }`}
                >
                  {label}
                  {companySortKey === key && <CheckIcon className="h-3.5 w-3.5 text-zinc-700" />}
                </button>
              ))
            }
          </Dropdown>

          <Dropdown
            align="right"
            className="w-48"
            trigger={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                  stageFilter.size > 0
                    ? 'border-zinc-700 bg-zinc-700 text-white'
                    : 'border-zinc-200 bg-white text-zinc-600 shadow-sm hover:bg-zinc-50'
                }`}
              >
                <FunnelIcon className="h-3.5 w-3.5" />
                Stage
                {stageFilter.size > 0 && (
                  <span className="rounded-full bg-zinc-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-zinc-100">
                    {stageFilter.size}
                  </span>
                )}
              </button>
            )}
          >
            {() =>
              availableStages.length === 0 ? (
                <p className="px-3 py-2 text-xs text-zinc-400">No stages available</p>
              ) : (
                <>
                  {availableStages.map((stage) => {
                    const active = stageFilter.has(stage);
                    return (
                      <button
                        key={stage}
                        type="button"
                        onClick={() =>
                          setStageFilter((prev) => {
                            const next = new Set(prev);
                            if (active) next.delete(stage);
                            else next.add(stage);
                            return next;
                          })
                        }
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-50"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            active ? 'border-zinc-700 bg-zinc-700 text-white' : 'border-zinc-300'
                          }`}
                        >
                          {active && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStagePillColor(stage)}`}>
                          {stage}
                        </span>
                      </button>
                    );
                  })}
                  {stageFilter.size > 0 && (
                    <>
                      <div className="my-1 border-t border-zinc-100" />
                      <button
                        type="button"
                        onClick={() => setStageFilter(new Set())}
                        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-700"
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                        Clear filters
                      </button>
                    </>
                  )}
                </>
              )
            }
          </Dropdown>
        </div>
      </div>

      {/* Company list */}
      <div className="mb-4 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {companiesLoading && companies.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">Loading companies...</div>
        ) : companies.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">No companies found</div>
        ) : displayedCompanies.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">No companies match the selected filters</div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {displayedCompanies.map((company) => (
              <CompanyRow
                key={company.id}
                company={company}
                onClick={() => {
                  saveStateBeforeNavigation();
                  navigate(`/companies/${company.id}`, { state: { backTo: `/sales-reps/${id}`, backLabel: displayName } });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Admin: calendar management */}
      {isAdmin && <CalendarsSection salesRepId={id!} calendars={data.calendars} onMutate={loadRep} />}
    </div>
  );
}
