import { useState, useRef, useCallback } from 'react';
import {
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { useClickOutside } from './types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function DateTimePicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(value.getMonth());
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startDay = new Date(viewYear, viewMonth, 1).getDay();
  const blanks = Array.from({ length: startDay });
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const isSelected = (day: number) =>
    day === value.getDate() && viewMonth === value.getMonth() && viewYear === value.getFullYear();
  const isToday = (day: number) => {
    const t = new Date();
    return day === t.getDate() && viewMonth === t.getMonth() && viewYear === t.getFullYear();
  };

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }
  function pickDay(day: number) {
    const next = new Date(value);
    next.setFullYear(viewYear, viewMonth, day);
    onChange(next);
  }

  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const [h, m] = e.target.value.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return;
    const next = new Date(value);
    next.setHours(h, m);
    onChange(next);
  }

  const displayStr =
    value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium text-zinc-500 mb-1">Date & Time</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 transition hover:border-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDaysIcon className="h-4 w-4 text-zinc-400" />
          <span className="truncate">{displayStr}</span>
        </span>
        <ChevronDownIcon className={`h-4 w-4 text-zinc-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-64 rounded-md border border-zinc-200 bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 transition">
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-zinc-800">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 transition">
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center mb-1">
            {DAY_HEADERS.map((d) => (
              <span key={d} className="text-[10px] font-medium text-zinc-400">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 text-center gap-y-0.5">
            {blanks.map((_, i) => <span key={`b${i}`} />)}
            {days.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => pickDay(day)}
                className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition
                  ${isSelected(day)
                    ? 'bg-zinc-900 text-white font-medium'
                    : isToday(day)
                      ? 'border border-zinc-300 text-zinc-800 hover:bg-zinc-100'
                      : 'text-zinc-700 hover:bg-zinc-100'
                  }`}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-500">Time</label>
            <input
              type="time"
              value={timeStr}
              onChange={handleTimeChange}
              className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 [&::-webkit-calendar-picker-indicator]:hidden"
            />
          </div>
        </div>
      )}
    </div>
  );
}
