import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import api from '../api';
import { useAuth } from '../AuthContext';
import { addDays, browserTimeZone, toISODate } from '../dateUtils';
import { isCustomerMeeting } from '../meetingUtils';
import WeekCalendar, {
  type CalendarMeeting,
  type ViewState,
  DEFAULT_COLORS,
  REP_COLORS,
  VISIBLE_REPS,
  getMonday,
  weekRangeLabel,
} from '../components/WeekCalendar';

/* ── Types ────────────────────────────────────────────────── */

interface SalesRepCard {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  hubspot_owner_id: string | null;
  meetings_per_day: number;
  meeting_time_pct: number;
  total_pipeline: number;
  customers_past_week: number;
  customers_past_two_weeks: number;
}

const REP_AVATAR: Record<string, string> = {
  'Coral Ptashne':      'bg-indigo-400 text-white',
  'Dan Ulrich':         'bg-emerald-400 text-white',
  'Dallas Deza':        'bg-amber-400 text-white',
  'Stirling Hedderich': 'bg-rose-400 text-white',
};
const DEFAULT_AVATAR = 'bg-zinc-400 text-white';

/* ── Formatting helpers ───────────────────────────────────── */

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(' ');
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function initials(first: string | null, last: string | null): string {
  return [(first?.[0] ?? ''), (last?.[0] ?? '')].join('').toUpperCase() || '?';
}

function isVisibleRepName(name: string, isAe: boolean): boolean {
  return isAe || VISIBLE_REPS.has(name);
}

function filterCardsForRole(cards: SalesRepCard[], isAe: boolean): SalesRepCard[] {
  return cards.filter((rep) => isVisibleRepName(fullName(rep.first_name, rep.last_name), isAe));
}

function filterMeetingsForRole(meetings: CalendarMeeting[], isAe: boolean): CalendarMeeting[] {
  if (isAe) return meetings;
  return meetings.filter((meeting) =>
    meeting.sales_reps.some((salesRep) => VISIBLE_REPS.has(salesRep.display_name)),
  );
}

/* ── Page-level cache (survives remounts within the SPA) ── */

const pageCache = {
  cards: null as SalesRepCard[] | null,
  weekStartISO: toISODate(getMonday(new Date())),
  meetingsByWeek: new Map<string, CalendarMeeting[]>(),
  enabledRepNames: [...VISIBLE_REPS],
  view: null as ViewState | null,
  customerOnly: true,
  scrollTop: 0,
};

function cachedWeekStart(): Date {
  const [y, m, d] = pageCache.weekStartISO.split('-').map(Number);
  if (!y || !m || !d) return getMonday(new Date());
  const parsed = new Date(y, m - 1, d);
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

/* ── Main Page ────────────────────────────────────────────── */

function saveScrollAndNavigate(navigate: ReturnType<typeof useNavigate>, to: string) {
  const el = document.getElementById('main-scroll');
  if (el) pageCache.scrollTop = el.scrollTop;
  navigate(to);
}

export default function SalesRepsPage() {
  const { role } = useAuth();
  const isAe = role === 'ae';
  const navigate = useNavigate();
  const initWeek = cachedWeekStart();
  const initWeekKey = toISODate(initWeek);

  const [data, setData] = useState<SalesRepCard[]>(() =>
    filterCardsForRole(pageCache.cards ?? [], isAe),
  );
  const [loading, setLoading] = useState(() => !pageCache.cards);
  const [weekStart, setWeekStart] = useState(initWeek);
  const [meetings, setMeetings] = useState<CalendarMeeting[]>(() =>
    filterMeetingsForRole(pageCache.meetingsByWeek.get(initWeekKey) ?? [], isAe),
  );
  const [meetingsLoading, setMeetingsLoading] = useState(() => !pageCache.meetingsByWeek.has(initWeekKey));
  const [enabledReps, setEnabledReps] = useState<Set<string>>(() => {
    if (isAe) return new Set();
    const cached = pageCache.enabledRepNames.filter(Boolean);
    return new Set(cached.length > 0 ? cached : VISIBLE_REPS);
  });
  const [customerOnly, setCustomerOnly] = useState(() => pageCache.customerOnly);

  const toggleRep = (name: string) =>
    setEnabledReps((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const activeRepNames = useMemo(() => {
    const repNames = data.map((rep) => fullName(rep.first_name, rep.last_name)).filter(Boolean);
    return new Set(repNames.filter((name) => isVisibleRepName(name, isAe)));
  }, [data, isAe]);

  const filteredMeetings = useMemo(
    () =>
      meetings.filter((m) => {
        if (!m.sales_reps.some((sr) => enabledReps.has(sr.display_name))) return false;
        if (customerOnly && !isCustomerMeeting(m)) return false;
        return true;
      }),
    [meetings, enabledReps, customerOnly],
  );

  useEffect(() => {
    const el = document.getElementById('main-scroll');
    if (el && pageCache.scrollTop > 0) {
      el.scrollTop = pageCache.scrollTop;
    }
  }, []);

  useEffect(() => { pageCache.weekStartISO = toISODate(weekStart); }, [weekStart]);
  useEffect(() => { pageCache.enabledRepNames = [...enabledReps]; }, [enabledReps]);
  useEffect(() => { pageCache.customerOnly = customerOnly; }, [customerOnly]);
  useEffect(() => {
    setEnabledReps((prev) => {
      const next = [...prev].filter((name) => activeRepNames.has(name));
      return new Set(next.length > 0 ? next : activeRepNames);
    });
  }, [activeRepNames]);

  useEffect(() => {
    if (pageCache.cards) {
      setData(filterCardsForRole(pageCache.cards, isAe));
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get('/api/sales-reps/cards')
      .then((res) => {
        if (cancelled) return;
        pageCache.cards = res.data.items as SalesRepCard[];
        setData(filterCardsForRole(pageCache.cards, isAe));
      })
      .catch(() => !cancelled && setData([]))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [isAe]);

  useEffect(() => {
    const weekKey = toISODate(weekStart);
    const cached = pageCache.meetingsByWeek.get(weekKey);
    if (cached) {
      setMeetings(filterMeetingsForRole(cached, isAe));
      setMeetingsLoading(false);
      return;
    }
    let cancelled = false;
    setMeetingsLoading(true);
    api
      .get('/api/meetings', {
        params: {
          date_from: toISODate(weekStart),
          date_to: toISODate(addDays(weekStart, 4)),
          timezone: browserTimeZone(),
          page: 1,
          page_size: 1000,
        },
      })
      .then((res) => {
        if (cancelled) return;
        pageCache.meetingsByWeek.set(weekKey, res.data.items as CalendarMeeting[]);
        setMeetings(filterMeetingsForRole(res.data.items as CalendarMeeting[], isAe));
      })
      .catch(() => !cancelled && setMeetings([]))
      .finally(() => !cancelled && setMeetingsLoading(false));
    return () => { cancelled = true; };
  }, [isAe, weekStart]);

  const handleViewChange = useCallback((s: ViewState) => { pageCache.view = s; }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900">Sales Reps</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Track weekly rep activity and jump into each rep profile
      </p>

      <section className="mb-5 rounded-xl border border-zinc-200 bg-white shadow-sm">
        {/* Week navigation */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
            <button
              type="button"
              onClick={() => setWeekStart((prev) => addDays(prev, -7))}
              className="p-2 text-zinc-500 transition hover:bg-white hover:text-zinc-700"
              aria-label="Previous week"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <div className="h-5 w-px bg-zinc-200" />
            <button
              type="button"
              onClick={() => setWeekStart((prev) => addDays(prev, 7))}
              className="p-2 text-zinc-500 transition hover:bg-white hover:text-zinc-700"
              aria-label="Next week"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          <h2 className="truncate text-sm font-semibold text-zinc-800">{weekRangeLabel(weekStart)}</h2>

          <button
            type="button"
            onClick={() => setWeekStart(getMonday(new Date()))}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
          >
            This Week
          </button>

          <div className="flex-1" />

          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-600">
            {filteredMeetings.length} meeting{filteredMeetings.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setCustomerOnly((prev) => !prev)}
            aria-pressed={customerOnly}
            className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
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

          <div className="mx-1 h-4 w-px bg-zinc-200" />

          {Array.from(activeRepNames).map((name) => {
            const c = REP_COLORS[name] ?? DEFAULT_COLORS;
            const on = enabledReps.has(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleRep(name)}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                  on
                    ? 'border-zinc-300 bg-zinc-50 text-zinc-700'
                    : 'border-zinc-200 bg-white text-zinc-400'
                }`}
              >
                <span className={`inline-block h-2 w-2 rounded-full transition ${on ? c.dot : 'bg-zinc-300'}`} />
                {name}
              </button>
            );
          })}
        </div>
      </section>

      <div className="mb-6">
        {meetingsLoading && meetings.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white py-20 text-sm text-zinc-500 shadow-sm">
            Loading calendar...
          </div>
        ) : (
          <WeekCalendar
            monday={weekStart}
            meetings={filteredMeetings}
            enabledReps={enabledReps}
            onMeetingClick={(id) => saveScrollAndNavigate(navigate, `/meetings/${id}`)}
            initialView={pageCache.view}
            onViewChange={handleViewChange}
          />
        )}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">Sales Reps</h2>
          {!loading && (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
              {data.length} rep{data.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {loading ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500 shadow-sm">Loading reps...</div>
        ) : data.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500 shadow-sm">No sales reps found</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/60 text-xs font-medium text-zinc-500">
                  <th className="py-2.5 pl-4 pr-2">Rep</th>
                  <th className="px-2 py-2.5">
                    <span className="inline-flex items-center gap-1"><CalendarDaysIcon className="h-3.5 w-3.5" />Mtgs/Day</span>
                  </th>
                  <th className="px-2 py-2.5">
                    <span className="inline-flex items-center gap-1"><ClockIcon className="h-3.5 w-3.5" />In Meetings</span>
                  </th>
                  <th className="px-2 py-2.5">
                    <span className="inline-flex items-center gap-1"><UserGroupIcon className="h-3.5 w-3.5" />Customers (1w)</span>
                  </th>
                  <th className="px-2 py-2.5">
                    <span className="inline-flex items-center gap-1"><UserGroupIcon className="h-3.5 w-3.5" />Customers (2w)</span>
                  </th>
                  <th className="px-2 py-2.5">
                    <span className="inline-flex items-center gap-1"><CurrencyDollarIcon className="h-3.5 w-3.5" />Pipeline</span>
                  </th>
                  <th className="w-8 py-2.5 pr-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.map((rep) => {
                  const name = fullName(rep.first_name, rep.last_name) || 'Unnamed Rep';
                  const avatarColor = REP_AVATAR[name] ?? DEFAULT_AVATAR;
                  return (
                    <tr
                      key={rep.id}
                      onClick={() => saveScrollAndNavigate(navigate, `/sales-reps/${rep.id}`)}
                      className="group cursor-pointer transition hover:bg-zinc-50"
                    >
                      <td className="py-3 pl-4 pr-2">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor}`}>
                            {initials(rep.first_name, rep.last_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-zinc-900">{name}</div>
                            {rep.email && <div className="truncate text-xs text-zinc-400">{rep.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 tabular-nums text-zinc-700">{rep.meetings_per_day}</td>
                      <td className="px-2 py-3 tabular-nums text-zinc-700">{rep.meeting_time_pct}%</td>
                      <td className="px-2 py-3 tabular-nums text-zinc-700">{rep.customers_past_week}</td>
                      <td className="px-2 py-3 tabular-nums text-zinc-700">{rep.customers_past_two_weeks}</td>
                      <td className="px-2 py-3 tabular-nums text-zinc-700">
                        {rep.total_pipeline > 0 ? formatCurrency(rep.total_pipeline) : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <ChevronRightIcon className="h-4 w-4 text-zinc-300 transition group-hover:text-zinc-500" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
