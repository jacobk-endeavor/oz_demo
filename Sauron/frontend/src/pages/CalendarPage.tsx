import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
  PlayCircleIcon,
} from '@heroicons/react/24/outline';
import api from '../api';
import {
  browserTimeZone,
  toISODate,
  fromISODate,
  startOfDay,
  isSameDay,
  formatDateLabel,
  formatMeetingTimeRange,
} from '../dateUtils';

/* ── Types ────────────────────────────────────────────────── */

interface MeetingSalesRep {
  id: number;
  email: string | null;
  display_name: string;
}

interface Meeting {
  id: number;
  title: string;
  start_at: string | null;
  duration_minutes: number | null;
  description: string | null;
  meeting_url: string | null;
  location: string | null;
  sales_reps: MeetingSalesRep[];
  meeting_recording_ids: number[];
  company_names: string[];
  company_count: number;
  person_count: number;
}

interface MeetingListResponse {
  items: Meeting[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface CalendarGroup {
  key: string;
  label: string;
  salesRepEmail: string | null;
  meetings: Meeting[];
}

/* ── Timeline constants ───────────────────────────────────── */

const TIMELINE_START_HOUR = 6;
const TIMELINE_END_HOUR = 22;
const TIMELINE_TOTAL_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;
const TIMELINE_DEFAULT_VIEW_START = 7;
const TIMELINE_DEFAULT_VIEW_END = 17;
const TIMELINE_DEFAULT_VIEW_HOURS = TIMELINE_DEFAULT_VIEW_END - TIMELINE_DEFAULT_VIEW_START;
const TIMELINE_ROW_HEIGHT = 26;
const TIMELINE_COLLISION_PCT = 10;
const TIMELINE_FALLBACK_PX_PER_HOUR = 140;
const TIMELINE_HOUR_MARKERS = Array.from(
  { length: TIMELINE_TOTAL_HOURS + 1 },
  (_, i) => TIMELINE_START_HOUR + i,
);

/* ── Helpers ──────────────────────────────────────────────── */

function truncate(value: string | null, maxLength = 180): string | null {
  if (!value) return null;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function formatHourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function timelinePercent(startAt: string): number {
  const d = new Date(startAt);
  const hours = d.getHours() + d.getMinutes() / 60;
  const clamped = Math.max(TIMELINE_START_HOUR, Math.min(hours, TIMELINE_END_HOUR));
  return ((clamped - TIMELINE_START_HOUR) / TIMELINE_TOTAL_HOURS) * 100;
}

function hourPercent(hour: number): string {
  return `${((hour - TIMELINE_START_HOUR) / TIMELINE_TOTAL_HOURS) * 100}%`;
}

const MAX_VISIBLE_COMPANIES = 3;

/* ── Component ────────────────────────────────────────────── */

export default function CalendarPage() {
  const navigate = useNavigate();
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineInitDateRef = useRef<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [data, setData] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  const shiftDate = (days: number) =>
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + days);
      return d;
    });

  /* Fetch meetings for the selected day */
  useEffect(() => {
    let cancelled = false;
    const dateStr = toISODate(selectedDate);
    setLoading(true);
    setError(null);
    api
      .get<MeetingListResponse>('/api/meetings', {
        params: { page: 1, page_size: 1000, date_from: dateStr, date_to: dateStr, timezone: browserTimeZone() },
      })
      .then((res) => !cancelled && setData(res.data.items))
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load meetings');
        setData([]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [selectedDate]);

  /* Track timeline viewport width for scroll sizing */
  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    const update = () => setViewportWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* Timeline scroll initialization */
  const hourWidth = viewportWidth > 0
    ? viewportWidth / TIMELINE_DEFAULT_VIEW_HOURS
    : TIMELINE_FALLBACK_PX_PER_HOUR;
  const contentWidth = TIMELINE_TOTAL_HOURS * hourWidth;
  const dateKey = toISODate(selectedDate);

  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el || viewportWidth <= 0 || timelineInitDateRef.current === dateKey) return;
    el.scrollLeft = Math.max(0, TIMELINE_DEFAULT_VIEW_START - TIMELINE_START_HOUR) * hourWidth;
    timelineInitDateRef.current = dateKey;
  }, [dateKey, hourWidth, viewportWidth]);

  /* Group meetings by sales rep */
  const groupedCalendars = useMemo<CalendarGroup[]>(() => {
    const groupMap = new Map<string, CalendarGroup>();
    for (const meeting of data) {
      if (!meeting.sales_reps.length) continue;
      const seen = new Set<number>();
      for (const sr of meeting.sales_reps) {
        if (seen.has(sr.id)) continue;
        seen.add(sr.id);
        const key = `sr-${sr.id}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, { key, label: sr.display_name || sr.email || 'Unknown', salesRepEmail: sr.email, meetings: [] });
        }
        groupMap.get(key)!.meetings.push(meeting);
      }
    }
    const groups = [...groupMap.values()].sort((a, b) => a.label.localeCompare(b.label));
    for (const g of groups) {
      g.meetings.sort((a, b) => {
        const at = a.start_at ? new Date(a.start_at).getTime() : Infinity;
        const bt = b.start_at ? new Date(b.start_at).getTime() : Infinity;
        return at - bt;
      });
    }
    return groups;
  }, [data]);

  /* Timeline collision detection */
  const positionedMeetings = useMemo(() => {
    const sorted = data
      .filter((m) => m.start_at)
      .map((m) => ({ meeting: m, left: timelinePercent(m.start_at!) }))
      .sort((a, b) => a.left - b.left);

    const rows: number[][] = [[]];
    const result: Array<{ meeting: Meeting; left: number; row: number }> = [];

    for (const item of sorted) {
      let placed = false;
      for (let r = 0; r < rows.length; r++) {
        const lastEdge = rows[r][rows[r].length - 1] ?? -Infinity;
        if (item.left >= lastEdge) {
          rows[r].push(item.left + TIMELINE_COLLISION_PCT);
          result.push({ ...item, row: r });
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push([item.left + TIMELINE_COLLISION_PCT]);
        result.push({ ...item, row: rows.length - 1 });
      }
    }
    return { items: result, rowCount: Math.max(rows.length, 1) };
  }, [data]);

  const today = startOfDay(new Date());
  const isToday = isSameDay(selectedDate, today);

  const nowPosition = (() => {
    if (!isToday) return null;
    const now = new Date();
    const hours = now.getHours() + now.getMinutes() / 60;
    if (hours < TIMELINE_START_HOUR || hours > TIMELINE_END_HOUR) return null;
    return ((hours - TIMELINE_START_HOUR) / TIMELINE_TOTAL_HOURS) * 100;
  })();

  const handleWheel = (e: React.WheelEvent) => {
    const el = timelineScrollRef.current;
    if (!el) return;
    el.scrollLeft += Math.abs(e.deltaX) > 0 ? e.deltaX : e.deltaY;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.preventDefault();
  };

  const selectedDateLabel = formatDateLabel(selectedDate);
  const dateInputValue = toISODate(selectedDate);
  const timelineMeetingCount = positionedMeetings.items.length;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900">Calendar</h1>
      <p className="mb-6 text-sm text-zinc-500">
        View all team meetings for a single day, grouped by sales rep
      </p>

      {/* Date navigation */}
      <section className="mb-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                className="p-2 text-zinc-500 transition hover:bg-white hover:text-zinc-700"
                aria-label="Previous day"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <div className="h-6 w-px bg-zinc-200" />
              <button
                type="button"
                onClick={() => shiftDate(1)}
                className="p-2 text-zinc-500 transition hover:bg-white hover:text-zinc-700"
                aria-label="Next day"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-zinc-400">
                {isToday ? 'Today' : 'Selected day'}
              </p>
              <p className="truncate text-sm font-medium text-zinc-700">{selectedDateLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:ml-4">
            <label htmlFor="calendar-date-input" className="sr-only">Jump to date</label>
            <input
              id="calendar-date-input"
              type="date"
              value={dateInputValue}
              onChange={(e) => {
                const parsed = fromISODate(e.target.value);
                if (parsed) setSelectedDate(parsed);
              }}
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
            {!isToday && (
              <button
                type="button"
                onClick={() => setSelectedDate(today)}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
              >
                Today
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Day timeline */}
      <section className="mb-5 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
          <p className="text-xs font-medium text-zinc-600">
            Timeline: {timelineMeetingCount} meeting{timelineMeetingCount === 1 ? '' : 's'} with start times
          </p>
          <p className="hidden text-xs text-zinc-400 sm:block">Scroll to view full day</p>
        </div>

        <div ref={timelineScrollRef} className="no-scrollbar overflow-x-auto px-5 pb-3 pt-3" onWheel={handleWheel}>
          <div className="relative" style={{ minWidth: `${contentWidth}px` }}>
            {/* Hour labels — every 2 hours */}
            <div className="relative h-5">
              {TIMELINE_HOUR_MARKERS.filter((h) => h % 2 === 0).map((hour) => (
                <span
                  key={hour}
                  className="absolute text-[11px] text-zinc-400"
                  style={{
                    left: hourPercent(hour),
                    transform:
                      hour === TIMELINE_START_HOUR ? 'none'
                        : hour === TIMELINE_END_HOUR ? 'translateX(-100%)'
                        : 'translateX(-50%)',
                  }}
                >
                  {formatHourLabel(hour)}
                </span>
              ))}
            </div>

            {/* Track */}
            <div
              className="relative transition-[height] duration-200"
              style={{ height: `${positionedMeetings.rowCount * TIMELINE_ROW_HEIGHT + 14}px` }}
            >
              {TIMELINE_HOUR_MARKERS.map((hour) => (
                <div
                  key={hour}
                  className="absolute bottom-0 top-0 w-px bg-zinc-100"
                  style={{ left: hourPercent(hour) }}
                />
              ))}

              <div className="absolute left-0 right-0 top-0 h-px bg-zinc-200" />

              {nowPosition !== null && (
                <>
                  <div className="absolute bottom-0 w-0.5 bg-blue-500" style={{ left: `${nowPosition}%`, top: '-4px' }} />
                  <div className="absolute h-2.5 w-2.5 rounded-full bg-blue-500" style={{ left: `${nowPosition}%`, top: '-4px', transform: 'translateX(-50%)' }} />
                </>
              )}

              {positionedMeetings.items.map(({ meeting, left, row }) => (
                <button
                  key={meeting.id}
                  type="button"
                  onClick={() => navigate(`/meetings/${meeting.id}`)}
                  className="group absolute z-10 cursor-pointer rounded-md border border-indigo-100 bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50"
                  style={{ left: `${left}%`, top: `${row * TIMELINE_ROW_HEIGHT + 7}px`, transform: 'translateX(-50%)' }}
                >
                  <span className="block max-w-[120px] truncate">{meeting.title || 'Untitled'}</span>
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden max-w-xs -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-normal text-zinc-700 shadow-lg group-hover:block group-focus-visible:block">
                    {meeting.title || 'Untitled meeting'}
                  </span>
                </button>
              ))}

              {!loading && data.filter((m) => m.start_at).length === 0 && (
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-xs text-zinc-400">
                  No meetings on this day
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="mb-4 text-sm text-zinc-500">Loading meetings...</p>}
      {!loading && groupedCalendars.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500 shadow-sm">
          No meetings found for this day
        </div>
      )}

      <div className="space-y-4">
        {groupedCalendars.map((group) => (
          <section key={group.key} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-zinc-900">{group.label}</h2>
                {group.salesRepEmail && (
                  <p className="truncate text-xs text-zinc-500">{group.salesRepEmail}</p>
                )}
              </div>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
                {group.meetings.length} meeting{group.meetings.length === 1 ? '' : 's'}
              </span>
            </div>

            {group.meetings.length === 0 ? (
              <div className="px-4 py-6 text-sm text-zinc-500">No meetings</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {group.meetings.map((meeting) => {
                  const recordingCount = meeting.meeting_recording_ids.length;
                  const visibleCompanies = meeting.company_names.slice(0, MAX_VISIBLE_COMPANIES);
                  const hiddenCount = meeting.company_names.length - visibleCompanies.length;

                  return (
                    <article
                      key={meeting.id}
                      className="cursor-pointer px-4 py-3 transition hover:bg-zinc-50"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('a')) return;
                        navigate(`/meetings/${meeting.id}`);
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-zinc-900">
                            {meeting.title || 'Untitled meeting'}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
                              <ClockIcon className="h-3.5 w-3.5 text-zinc-500" />
                              {formatMeetingTimeRange(meeting.start_at, meeting.duration_minutes)}
                            </span>
                            <span>{meeting.person_count} attendees</span>
                            <span className="text-zinc-300">&bull;</span>
                            <span>{meeting.company_count} companies</span>
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                            recordingCount > 0
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                          }`}
                        >
                          <PlayCircleIcon className="h-4 w-4" />
                          {recordingCount > 0
                            ? `${recordingCount} recording${recordingCount === 1 ? '' : 's'} linked`
                            : 'No recording linked'}
                        </span>
                      </div>

                      {meeting.location && (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500">
                          <MapPinIcon className="h-4 w-4 text-zinc-400" />
                          {meeting.location}
                        </p>
                      )}

                      {visibleCompanies.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {visibleCompanies.map((name) => (
                            <span
                              key={`${meeting.id}-${name}`}
                              className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600"
                            >
                              {name}
                            </span>
                          ))}
                          {hiddenCount > 0 && (
                            <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-500">
                              +{hiddenCount} more
                            </span>
                          )}
                        </div>
                      )}

                      {meeting.description && (
                        <p className="mt-2 text-xs leading-5 text-zinc-600">{truncate(meeting.description)}</p>
                      )}

                      {meeting.meeting_url && (
                        <a
                          href={meeting.meeting_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex text-xs font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          Open meeting link
                        </a>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
