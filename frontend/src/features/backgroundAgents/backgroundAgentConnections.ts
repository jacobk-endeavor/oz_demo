import { companyLogoUrl } from './backgroundAgentAi'
import type { BackgroundAgentCompany, BackgroundAgentRecord } from './backgroundAgentModel'

/** Connections to show in the "Connecting to…" sequence and on cards (assumes integrations are available in the demo). */
export function connectionsForAgentRecord(rec: BackgroundAgentRecord): BackgroundAgentCompany[] {
  return resolveBackgroundAgentConnections(rec.companies, {
    assignment: rec.assignment,
    taskTitle: rec.taskTitle,
    taskDetail: rec.taskDetail,
    deliverable: rec.deliverable,
    schedule: rec.schedule,
  })
}

const ORDER = new Map<string, number>([
  ['salesforce.com', 0],
  ['hubspot.com', 0],
  ['office.com', 1],
  ['outlook.com', 2],
  ['google.com', 3],
])

/**
 * Merges persisted LLM "companies" with demo heuristics so cards always show
 * plausible integration connections (e.g. Salesforce + Excel + Outlook for a sales email report).
 */
export function resolveBackgroundAgentConnections(
  saved: readonly BackgroundAgentCompany[] | undefined,
  source: {
    assignment: string
    taskTitle?: string
    taskDetail?: string
    deliverable?: string
    schedule?: string
  },
): BackgroundAgentCompany[] {
  const text = [
    source.assignment,
    source.taskTitle,
    source.taskDetail,
    source.deliverable,
    source.schedule,
  ]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join(' ')

  const inferred = inferConnectionsFromText(text)
  return mergeByDomain([...(saved ?? []), ...inferred])
}

function mergeByDomain(items: readonly BackgroundAgentCompany[]): BackgroundAgentCompany[] {
  const by = new Map<string, BackgroundAgentCompany>()
  for (const c of items) {
    const k = c.domain.toLowerCase().replace(/^www\./, '')
    if (!k) continue
    if (!by.has(k)) by.set(k, { name: c.name, domain: k })
  }
  const out = [...by.values()]
  out.sort((a, b) => {
    const oa = ORDER.get(a.domain) ?? 99
    const ob = ORDER.get(b.domain) ?? 99
    if (oa !== ob) return oa - ob
    return a.name.localeCompare(b.name)
  })
  return out.slice(0, 8)
}

/**
 * Heuristic: which product logos to show (demo — assumes integrations exist).
 * Domains are chosen for `companyLogoUrl` and static overrides in the UI.
 */
export function inferConnectionsFromText(text: string): BackgroundAgentCompany[] {
  const t = text.toLowerCase()
  const out: BackgroundAgentCompany[] = []

  const wantsSalesCrm =
    /\b(salesforce|hubspot|crm|pipeline|revenue|quota|sales[\s-]?(?:team|rep|reps|staff)|salesm[ae]n|salespeople|salesperson|best\s+sales|top\s+sales|opportunit|deal[s]?)\b/.test(
      t,
    ) || /\b(sales|revenue)\b/.test(t)

  const wantsSheets =
    /\b(excel|xlsx|spreadsheet|worksheet|pivot|workbook|tableau|sheet)\b/.test(t) ||
    (/\breport(s)?\b/.test(t) && (wantsSalesCrm || /\b(email|e-?mail|summary|export)\b/.test(t)))

  const wantsEmail =
    /\b(e-?mail|outlook|inbox|smtp|gmail|send(ing)?\b.*\b(report|summary|update)|mail\s+me|email\s+me|weekly\s+.*\bmail)\b/.test(
      t,
    ) || /\b(?:email|e-mail)(?:\s+|\s+with\s+|\s+a\s+)a?\s*report/.test(t)

  if (/\bhubspot\b/.test(t)) {
    out.push({ name: 'HubSpot', domain: 'hubspot.com' })
  } else if (wantsSalesCrm) {
    out.push({ name: 'Salesforce', domain: 'salesforce.com' })
  }
  if (wantsSheets) {
    out.push({ name: 'Excel', domain: 'office.com' })
  }
  if (wantsEmail) {
    if (/\bgmail\b/.test(t)) {
      out.push({ name: 'Gmail', domain: 'google.com' })
    } else {
      out.push({ name: 'Outlook', domain: 'outlook.com' })
    }
  }

  return out
}

/** Prefer bundled PNGs for known products (clearer in the demo than favicons). */
export function connectionLogoSrc(domain: string): { src: string; local: boolean } {
  const d = domain.toLowerCase().replace(/^www\./, '')
  if (d === 'salesforce.com' || d.endsWith('.my.salesforce.com')) {
    return { src: '/lead-source-logos/salesforce.png', local: true }
  }
  if (d === 'outlook.com' || d === 'outlook.office.com') {
    return { src: '/lead-source-logos/outlook.png', local: true }
  }
  if (d === 'office.com' || d === 'excel.office.com' || d === 'microsoft.com') {
    return { src: '/knowledge-excel.png', local: true }
  }
  if (d === 'hubspot.com') {
    return { src: '/lead-source-logos/hubspot.png', local: true }
  }
  return { src: companyLogoUrl(domain), local: false }
}
