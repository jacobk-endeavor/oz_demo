const STAGE_COLORS: Record<string, { badge: string; pill: string }> = {
  'Discovery Booked': {
    badge: 'bg-blue-50/40 text-blue-400/70 ring-1 ring-inset ring-blue-300/25',
    pill: 'bg-blue-50/40 text-blue-400/70 border border-blue-200/30',
  },
  'Post Discovery': {
    badge: 'bg-cyan-50/40 text-cyan-400/70 ring-1 ring-inset ring-cyan-300/25',
    pill: 'bg-cyan-50/40 text-cyan-400/70 border border-cyan-200/30',
  },
  'Demo Booked': {
    badge: 'bg-violet-50/40 text-violet-400/70 ring-1 ring-inset ring-violet-300/25',
    pill: 'bg-violet-50/40 text-violet-400/70 border border-violet-200/30',
  },
  'Post Demo': {
    badge: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300/60',
    pill: 'bg-amber-100 text-amber-800 border border-amber-300/60',
  },
  'ROI Scheduled': {
    badge: 'bg-orange-50/40 text-orange-400/70 ring-1 ring-inset ring-orange-300/25',
    pill: 'bg-orange-50/40 text-orange-400/70 border border-orange-200/30',
  },
  'Final Review': {
    badge: 'bg-emerald-50/40 text-emerald-400/70 ring-1 ring-inset ring-emerald-300/25',
    pill: 'bg-emerald-50/40 text-emerald-400/70 border border-emerald-200/30',
  },
  Stagnated: {
    badge: 'bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-300/60',
    pill: 'bg-zinc-100 text-zinc-700 border border-zinc-300/60',
  },
  Dead: {
    badge: 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-300/60',
    pill: 'bg-rose-100 text-rose-700 border border-rose-300/60',
  },
  Disqualified: {
    badge: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300/60',
    pill: 'bg-slate-100 text-slate-700 border border-slate-300/60',
  },
};

const FALLBACK = {
  badge: 'bg-zinc-50/40 text-zinc-400/50 ring-1 ring-inset ring-zinc-200/25',
  pill: 'bg-zinc-50/40 text-zinc-400/50 border border-zinc-200/30',
};

export function getStageBadgeColor(stage: string): string {
  return (STAGE_COLORS[stage] ?? FALLBACK).badge;
}

export function getStagePillColor(stage: string | null): string {
  if (!stage) return FALLBACK.pill;
  return (STAGE_COLORS[stage] ?? FALLBACK).pill;
}
