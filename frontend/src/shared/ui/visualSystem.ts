export const ozColors = {
  spaceBlack: '#030407',
  panelBlack: '#080A12',
  deepNavy: '#07172F',
  electricBlue: '#23B8FF',
  nebulaBlue: '#0674FF',
  signalRed: '#E10600',
  hotRedOrange: '#FF3B00',
  starlightWhite: '#F5F7FF',
  mutedSlate: '#8B93A7',
  glassBorder: 'rgba(255,255,255,0.14)',
} as const

export type OzVisualTone = 'blue' | 'red' | 'white' | 'muted'

export const ozSurfaceClasses = {
  page: 'oz-space-background min-h-full text-[#F5F7FF]',
  panel:
    'rounded-3xl border border-white/14 bg-[#080A12]/86 text-[#F5F7FF] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl',
  card:
    'rounded-2xl border border-white/12 bg-white/[0.045] text-[#F5F7FF] shadow-[0_18px_50px_rgba(0,0,0,0.28)]',
  inset:
    'rounded-2xl border border-white/10 bg-[#030407]/60 text-[#F5F7FF]',
} as const

export const ozButtonClasses = {
  primary:
    'rounded-full border border-red-400/50 bg-[#E10600] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_24px_rgba(225,6,0,0.32)] transition hover:bg-[#FF3B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:pointer-events-none disabled:opacity-50',
  secondary:
    'rounded-full border border-[#23B8FF]/45 bg-[#0674FF]/16 px-4 py-2 text-sm font-semibold text-[#F5F7FF] shadow-[0_0_22px_rgba(35,184,255,0.18)] transition hover:bg-[#0674FF]/28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23B8FF] disabled:pointer-events-none disabled:opacity-50',
  ghost:
    'rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#F5F7FF] transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-50',
} as const

export const ozToneClasses: Record<OzVisualTone, string> = {
  blue: 'border-[#23B8FF]/45 bg-[#0674FF]/16 text-[#BDEBFF]',
  red: 'border-[#FF3B00]/45 bg-[#E10600]/16 text-[#FFD0C4]',
  white: 'border-white/30 bg-white/10 text-[#F5F7FF]',
  muted: 'border-white/12 bg-white/[0.04] text-[#8B93A7]',
}

export function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
