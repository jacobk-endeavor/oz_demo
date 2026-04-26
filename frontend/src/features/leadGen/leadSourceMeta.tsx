import type { ReactElement, SVGProps } from 'react'
import { joinClasses } from '../../shared/ui'

const LOGO_DIR = '/lead-source-logos'

const iconDefault = { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true as const }

function ClayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconDefault} viewBox="0 0 16 16" {...props}>
      <rect width="12" height="12" x="2" y="2" rx="2" fill="currentColor" opacity="0.35" />
      <rect width="5" height="5" x="2" y="2" rx="1" fill="currentColor" />
    </svg>
  )
}

function OutreachIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconDefault} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" {...props}>
      <path d="M2 3.5L8 1l6 2.5v9L8 15l-6-2.5v-9z" />
      <path d="M2 3.5L8 6l6-2.5M8 6v8.2" />
    </svg>
  )
}

function SalesloftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconDefault} viewBox="0 0 16 16" fill="currentColor" {...props}>
      <rect x="2" y="3" width="3" height="10" rx="0.4" />
      <rect x="6.5" y="2" width="3" height="12" rx="0.4" opacity="0.5" />
      <rect x="11" y="4" width="3" height="8" rx="0.4" />
    </svg>
  )
}

/** Simplified Google Chrome mark (4-color) for “Internet” leads */
function ChromeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden
      {...props}
    >
      <circle cx="8" cy="8" r="7.2" fill="#fff" />
      <path
        d="M8 1.2a6.8 6.8 0 0 1 5.2 2.4H8V1.2z"
        fill="#EA4335"
      />
      <path
        d="M1.2 5.1A6.8 6.8 0 0 1 2.5 2.2l2.2 3.8L8 3.1V1.2a6.8 6.8 0 0 0-6.8 3.9z"
        fill="#FBBC04"
      />
      <path
        d="M2.5 13.8A6.8 6.8 0 0 1 1.2 10.1l3.2.1 1.1 1.8-1.1 1.8a6.8 6.8 0 0 1-1.9 0z"
        fill="#34A853"
      />
      <path
        d="M8 14.8a6.8 6.8 0 0 0 5.2-2.4L8 8.3V14.8z"
        fill="#4285F4"
      />
      <circle cx="8" cy="8" r="2.8" fill="#fff" />
      <circle cx="8" cy="8" r="1.1" fill="#4285F4" />
    </svg>
  )
}

type IconFn = (p: SVGProps<SVGSVGElement>) => ReactElement

type SourceMeta =
  | { label: string; pillClass: string; kind: 'logo'; file: string }
  | { label: string; pillClass: string; kind: 'icon'; Icon: IconFn }

export const LEAD_SOURCE_IDS = [
  'salesforce',
  'clay',
  'outlook',
  'call_central',
  'apollo',
  'hubspot',
  'linkedin',
  'zoominfo',
  'outreach',
  'salesloft',
  'internet',
] as const

export type LeadSourceId = (typeof LEAD_SOURCE_IDS)[number]

const meta: Record<LeadSourceId, SourceMeta> = {
  salesforce: { kind: 'logo', file: 'salesforce.png', label: 'Salesforce', pillClass: 'bg-sky-50 text-sky-800 ring-sky-200/80' },
  clay: { kind: 'icon', Icon: ClayIcon, label: 'Clay', pillClass: 'bg-amber-50 text-amber-950 ring-amber-200/80' },
  outlook: { kind: 'logo', file: 'outlook.png', label: 'Outlook', pillClass: 'bg-sky-50 text-blue-800 ring-sky-200/70' },
  call_central: { kind: 'logo', file: 'ringcentral.png', label: 'RingCentral', pillClass: 'bg-orange-50 text-orange-950 ring-orange-200/80' },
  apollo: { kind: 'logo', file: 'apollo.png', label: 'Apollo', pillClass: 'bg-violet-50 text-violet-900 ring-violet-200/80' },
  hubspot: { kind: 'logo', file: 'hubspot.png', label: 'HubSpot', pillClass: 'bg-orange-50 text-orange-900 ring-orange-200/80' },
  linkedin: { kind: 'logo', file: 'linkedin.png', label: 'LinkedIn', pillClass: 'bg-blue-50 text-blue-900 ring-blue-200/80' },
  zoominfo: { kind: 'logo', file: 'zoominfo.png', label: 'ZoomInfo', pillClass: 'bg-red-50 text-red-900 ring-red-200/80' },
  outreach: { kind: 'icon', Icon: OutreachIcon, label: 'Outreach', pillClass: 'bg-purple-50 text-purple-900 ring-purple-200/80' },
  salesloft: { kind: 'icon', Icon: SalesloftIcon, label: 'Salesloft', pillClass: 'bg-rose-50 text-rose-900 ring-rose-200/80' },
  internet: { kind: 'icon', Icon: ChromeIcon, label: 'Internet', pillClass: 'bg-slate-50 text-slate-800 ring-slate-300/90' },
}

function SourceGlyph({ def }: { def: SourceMeta }) {
  if (def.kind === 'logo') {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-white/90 ring-1 ring-zinc-200/60">
        <img
          src={`${LOGO_DIR}/${def.file}`}
          alt=""
          width={16}
          height={16}
          draggable={false}
          className="h-full w-full object-contain p-px"
        />
      </span>
    )
  }
  const Icon = def.Icon
  return (
    <span className="shrink-0 text-current">
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}

export function LeadSourcePill({ id }: { id: LeadSourceId }) {
  const m = meta[id]
  return (
    <span
      className={joinClasses(
        'inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-1 pr-1.5 text-[10px] font-medium ring-1 ring-inset',
        m.pillClass,
      )}
      title={m.label}
    >
      <SourceGlyph def={m} />
      <span className="min-w-0 truncate">{m.label}</span>
    </span>
  )
}

export function getLeadSourceIdForIndex(i: number): LeadSourceId {
  return LEAD_SOURCE_IDS[i % LEAD_SOURCE_IDS.length]
}
