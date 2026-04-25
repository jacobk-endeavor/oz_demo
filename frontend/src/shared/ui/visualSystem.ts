// Light-mode design tokens for the Oz + Nebula demo.
//
// The original frontend (chat module) uses zinc neutrals with a blue accent
// and red for danger. The whole app should follow that vocabulary so screens
// feel like one product, not five different drafts.

export const tokens = {
  surface: {
    canvas: 'bg-zinc-50',
    raised: 'bg-white',
    sunken: 'bg-zinc-100',
    inset: 'bg-zinc-50',
  },
  border: {
    subtle: 'border-zinc-200',
    strong: 'border-zinc-300',
    focus: 'border-blue-500',
  },
  text: {
    primary: 'text-zinc-900',
    secondary: 'text-zinc-600',
    muted: 'text-zinc-500',
    inverted: 'text-white',
    accent: 'text-blue-600',
    danger: 'text-red-600',
  },
  radius: {
    sm: 'rounded-md',
    md: 'rounded-xl',
    lg: 'rounded-2xl',
    pill: 'rounded-full',
  },
  shadow: {
    sm: 'shadow-sm',
    card: 'shadow-sm shadow-zinc-200/60',
    pop: 'shadow-md shadow-zinc-300/40',
  },
} as const

export const surfaces = {
  page: 'min-h-full bg-zinc-50 text-zinc-900',
  card: 'rounded-2xl border border-zinc-200 bg-white shadow-sm',
  cardMuted: 'rounded-2xl border border-zinc-200 bg-zinc-50',
  inset: 'rounded-xl border border-zinc-200 bg-zinc-50',
} as const

export type Tone = 'blue' | 'red' | 'amber' | 'emerald' | 'zinc'

export const toneClasses: Record<Tone, string> = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  zinc: 'border-zinc-200 bg-zinc-100 text-zinc-700',
}

export const toneDot: Record<Tone, string> = {
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  zinc: 'bg-zinc-400',
}

export function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
