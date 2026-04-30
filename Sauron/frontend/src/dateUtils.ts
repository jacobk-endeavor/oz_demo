export function browserTimeZone(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return resolved?.trim() || 'UTC';
}

export function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function fromISODate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) return null;
  return startOfDay(new Date(year, month - 1, day));
}

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatDateLabel(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

export function formatMeetingTimeRange(
  startAt: string | null,
  durationMinutes: number | null,
): string {
  if (!startAt) return 'No start time';
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return 'Invalid time';
  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const startLabel = timeFmt.format(start);
  if (!durationMinutes || durationMinutes <= 0) return startLabel;
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return `${startLabel} - ${timeFmt.format(end)}`;
}

export function formatTime(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function weeksSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / MS_PER_WEEK);
}

export function formatEngagementWeeks(weeks: number | null): string | null {
  if (weeks == null) return null;
  if (weeks === 0) return '<1 week engaged';
  return `${weeks} wk${weeks === 1 ? '' : 's'} engaged`;
}
