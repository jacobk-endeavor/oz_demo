import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
} from '@heroicons/react/24/outline';
import { addDays, toISODate, formatTime } from '../dateUtils';

/* ── Types ────────────────────────────────────────────────── */

interface MeetingSalesRep {
  id: number;
  email: string | null;
  display_name: string;
}

export interface CalendarMeeting {
  id: number;
  title: string;
  start_at: string | null;
  duration_minutes: number | null;
  sales_reps: MeetingSalesRep[];
  company_names: string[];
}

export interface RepColorScheme {
  bg: string;
  border: string;
  text: string;
  dot: string;
}

export interface ViewState {
  zoomIdx: number;
  scrollTop: number;
}

interface LayoutSlot {
  meeting: CalendarMeeting;
  col: number;
  totalCols: number;
}

/* ── Constants ────────────────────────────────────────────── */

export const REP_COLORS: Record<string, RepColorScheme> = {
  'Coral Ptashne':      { bg: 'bg-indigo-50',  border: 'border-l-indigo-300',  text: 'text-zinc-700',  dot: 'bg-indigo-400'  },
  'Dan Ulrich':         { bg: 'bg-emerald-50', border: 'border-l-emerald-300', text: 'text-zinc-700',  dot: 'bg-emerald-400' },
  'Dallas Deza':        { bg: 'bg-amber-50',   border: 'border-l-amber-300',   text: 'text-zinc-700',  dot: 'bg-amber-400'   },
  'Stirling Hedderich': { bg: 'bg-rose-50',    border: 'border-l-rose-300',    text: 'text-zinc-700',  dot: 'bg-rose-400'    },
};

export const VISIBLE_REPS = new Set(Object.keys(REP_COLORS));
export const DEFAULT_COLORS: RepColorScheme = { bg: 'bg-zinc-50', border: 'border-l-zinc-300', text: 'text-zinc-700', dot: 'bg-zinc-400' };

const ZOOM_LEVELS = [30, 48, 60, 80, 110];
const DEFAULT_ZOOM_IDX = 2;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEKDAYS = 5;
const MAX_MEETING_HOURS = 4;
const MIN_MEETING_PX = 16;

/* ── Helpers ──────────────────────────────────────────────── */

function repColor(meeting: CalendarMeeting, enabled: Set<string>): RepColorScheme {
  for (const sr of meeting.sales_reps) {
    if (enabled.has(sr.display_name) && REP_COLORS[sr.display_name]) return REP_COLORS[sr.display_name];
  }
  for (const sr of meeting.sales_reps) {
    if (REP_COLORS[sr.display_name]) return REP_COLORS[sr.display_name];
  }
  return DEFAULT_COLORS;
}

export function getMonday(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  return copy;
}

function dayLabel(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}

export function weekRangeLabel(monday: Date): string {
  const friday = addDays(monday, 4);
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const yearFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric' });
  return `${fmt.format(monday)} – ${fmt.format(friday)}, ${yearFmt.format(friday)}`;
}

function layoutOverlaps(meetings: CalendarMeeting[], hourHeight: number): LayoutSlot[] {
  if (meetings.length === 0) return [];

  const items = meetings
    .filter((m) => m.start_at)
    .map((m) => {
      const s = new Date(m.start_at!);
      const startPx = (s.getHours() + s.getMinutes() / 60) * hourHeight;
      const dur = Math.min(m.duration_minutes ?? 30, MAX_MEETING_HOURS * 60) / 60;
      const endPx = startPx + Math.max(dur * hourHeight, MIN_MEETING_PX);
      return { meeting: m, startPx, endPx };
    })
    .sort((a, b) => a.startPx - b.startPx || a.endPx - b.endPx);

  const result: LayoutSlot[] = [];
  let groupStart = 0;
  let groupEnd = -Infinity;

  for (let i = 0; i < items.length; i++) {
    if (items[i].startPx >= groupEnd) {
      assignColumns(groupStart, i);
      groupStart = i;
      groupEnd = items[i].endPx;
    } else {
      groupEnd = Math.max(groupEnd, items[i].endPx);
    }
  }
  assignColumns(groupStart, items.length);

  return result;

  function assignColumns(from: number, to: number) {
    if (from >= to) return;
    const cols: number[] = [];
    for (let i = from; i < to; i++) {
      let col = 0;
      while (cols[col] !== undefined && items[i].startPx < cols[col]) col++;
      cols[col] = items[i].endPx;
      result.push({ meeting: items[i].meeting, col, totalCols: 0 });
    }
    const totalCols = cols.length;
    for (let i = result.length - (to - from); i < result.length; i++) {
      result[i].totalCols = totalCols;
    }
  }
}

/* ── Component ────────────────────────────────────────────── */

export default function WeekCalendar({
  monday,
  meetings,
  enabledReps = VISIBLE_REPS,
  onMeetingClick,
  initialView,
  onViewChange,
  colorOverride,
}: {
  monday: Date;
  meetings: CalendarMeeting[];
  enabledReps?: Set<string>;
  onMeetingClick: (id: number) => void;
  initialView?: ViewState | null;
  onViewChange?: (s: ViewState) => void;
  colorOverride?: RepColorScheme;
}) {
  const [zoomIdx, setZoomIdx] = useState(() => {
    const idx = initialView?.zoomIdx;
    return typeof idx === 'number' && Number.isFinite(idx)
      ? Math.max(0, Math.min(Math.round(idx), ZOOM_LEVELS.length - 1))
      : DEFAULT_ZOOM_IDX;
  });
  const hourHeight = ZOOM_LEVELS[zoomIdx];
  const totalHeight = 24 * hourHeight;
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollInitialized = useRef(false);

  const days = useMemo(() => Array.from({ length: WEEKDAYS }, (_, i) => addDays(monday, i)), [monday]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || scrollInitialized.current) return;
    el.scrollTop = initialView && Number.isFinite(initialView.scrollTop)
      ? Math.max(initialView.scrollTop, 0)
      : 8 * hourHeight - 20;
    scrollInitialized.current = true;
  }, [hourHeight, initialView]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && onViewChange) onViewChange({ zoomIdx, scrollTop: el.scrollTop });
  }, [zoomIdx, onViewChange]);

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, CalendarMeeting[]>();
    for (const day of days) map.set(toISODate(day), []);
    for (const m of meetings) {
      if (!m.start_at) continue;
      map.get(toISODate(new Date(m.start_at)))?.push(m);
    }
    return map;
  }, [days, meetings]);

  const todayISO = toISODate(new Date());

  const handleScroll = useCallback(() => {
    if (scrollRef.current && onViewChange) {
      onViewChange({ zoomIdx, scrollTop: scrollRef.current.scrollTop });
    }
  }, [zoomIdx, onViewChange]);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 540 }} onScroll={handleScroll}>
        {/* Day headers + zoom (sticky) */}
        <div className="sticky top-0 z-10 flex border-b border-zinc-100 bg-white">
          <div className="flex w-14 shrink-0 items-center justify-center gap-0.5 border-r border-zinc-100 bg-zinc-50/60">
            <button
              type="button"
              onClick={() => setZoomIdx((i) => Math.max(i - 1, 0))}
              disabled={zoomIdx === 0}
              className="rounded p-0.5 text-zinc-400 transition hover:bg-zinc-200/70 hover:text-zinc-700 disabled:opacity-30"
            >
              <MagnifyingGlassMinusIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomIdx((i) => Math.min(i + 1, ZOOM_LEVELS.length - 1))}
              disabled={zoomIdx === ZOOM_LEVELS.length - 1}
              className="rounded p-0.5 text-zinc-400 transition hover:bg-zinc-200/70 hover:text-zinc-700 disabled:opacity-30"
            >
              <MagnifyingGlassPlusIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${WEEKDAYS}, 1fr)` }}>
            {days.map((d) => {
              const key = toISODate(d);
              return (
                <div
                  key={key}
                  className={`border-r border-zinc-100 px-2 py-2.5 text-center text-xs font-semibold last:border-r-0 ${
                    key === todayISO ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600'
                  }`}
                >
                  {dayLabel(d)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Time grid */}
        <div className="flex" style={{ height: totalHeight }}>
          <div className="relative w-14 shrink-0 border-r border-zinc-100 bg-zinc-50/50">
            {HOURS.map((h) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-zinc-400" style={{ top: h * hourHeight }}>
                {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
              </div>
            ))}
          </div>

          <div className="relative grid flex-1" style={{ gridTemplateColumns: `repeat(${WEEKDAYS}, 1fr)` }}>
            {days.map((d, colIdx) => {
              const key = toISODate(d);
              const dayMeetings = meetingsByDay.get(key) ?? [];
              return (
                <div key={key} className={`relative ${colIdx < WEEKDAYS - 1 ? 'border-r border-zinc-100' : ''}`}>
                  {HOURS.map((h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-zinc-100" style={{ top: h * hourHeight }} />
                  ))}
                  {layoutOverlaps(dayMeetings, hourHeight).map(({ meeting: m, col, totalCols }) => {
                    const start = new Date(m.start_at!);
                    const startHour = start.getHours() + start.getMinutes() / 60;
                    const duration = Math.min(m.duration_minutes ?? 30, MAX_MEETING_HOURS * 60) / 60;
                    const top = startHour * hourHeight;
                    const height = Math.max(duration * hourHeight, MIN_MEETING_PX);
                    const colors = colorOverride ?? repColor(m, enabledReps);
                    return (
                      <div
                        key={m.id}
                        onClick={(e) => { e.stopPropagation(); onMeetingClick(m.id); }}
                        className={`absolute cursor-pointer overflow-hidden rounded-sm border border-zinc-200/60 border-l-[3px] px-1.5 py-0.5 transition hover:shadow-sm ${colors.bg} ${colors.border}`}
                        style={{
                          top,
                          height,
                          left: `${(col / totalCols) * 100}%`,
                          width: `${100 / totalCols}%`,
                        }}
                        title={`${m.title}\n${formatTime(start)} · ${m.duration_minutes ?? '?'} min`}
                      >
                        <p className={`truncate text-[10px] font-semibold leading-tight ${colors.text}`}>{m.title}</p>
                        {height >= 32 && (
                          <p className="truncate text-[9px] text-zinc-500">
                            {formatTime(start)} · {m.duration_minutes ?? '?'}m
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
