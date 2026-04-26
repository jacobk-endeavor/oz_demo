import { joinClasses } from '../../shared/ui'

const LOGO_DIR = '/lead-source-logos'

type SourceMeta = { label: string; pillClass: string; file: string }

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
  salesforce: { file: 'salesforce.png', label: 'Salesforce', pillClass: 'bg-sky-50 text-sky-800 ring-sky-200/80' },
  clay: { file: 'clay.png', label: 'Clay', pillClass: 'bg-amber-50 text-amber-950 ring-amber-200/80' },
  outlook: { file: 'outlook.png', label: 'Outlook', pillClass: 'bg-sky-50 text-blue-800 ring-sky-200/70' },
  call_central: { file: 'ringcentral.png', label: 'RingCentral', pillClass: 'bg-orange-50 text-orange-950 ring-orange-200/80' },
  apollo: { file: 'apollo.png', label: 'Apollo', pillClass: 'bg-violet-50 text-violet-900 ring-violet-200/80' },
  hubspot: { file: 'hubspot.png', label: 'HubSpot', pillClass: 'bg-orange-50 text-orange-900 ring-orange-200/80' },
  linkedin: { file: 'linkedin.png', label: 'LinkedIn', pillClass: 'bg-blue-50 text-blue-900 ring-blue-200/80' },
  zoominfo: { file: 'zoominfo.png', label: 'ZoomInfo', pillClass: 'bg-red-50 text-red-900 ring-red-200/80' },
  outreach: { file: 'outreach.png', label: 'Outreach', pillClass: 'bg-purple-50 text-purple-900 ring-purple-200/80' },
  salesloft: { file: 'salesloft.svg', label: 'Salesloft', pillClass: 'bg-rose-50 text-rose-900 ring-rose-200/80' },
  internet: { file: 'internet.png', label: 'Internet', pillClass: 'bg-slate-50 text-slate-800 ring-slate-300/90' },
}

function SourceGlyph({ def }: { def: SourceMeta }) {
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

export function LeadSourcePill({ id }: { id: LeadSourceId }) {
  const m = meta[id]
  return (
    <span
      className={joinClasses(
        'inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-[10px] font-medium leading-snug ring-1 ring-inset',
        m.pillClass,
      )}
      title={m.label}
    >
      <SourceGlyph def={m} />
      <span className="min-w-0 truncate leading-snug">{m.label}</span>
    </span>
  )
}

export function getLeadSourceIdForIndex(i: number): LeadSourceId {
  return LEAD_SOURCE_IDS[i % LEAD_SOURCE_IDS.length]
}
