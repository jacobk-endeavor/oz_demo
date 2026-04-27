import type { LeadSourceId } from './leadSourceMeta'
import { LEAD_SOURCE_IDS } from './leadSourceMeta'
import type { DistributorRow } from './milwaukeeDistributorsMock'

export type SortColumn =
  | 'name'
  | 'location'
  | 'country'
  | 'source'
  | 'description'
  | 'industry'
  | 'size'
  | 'type'
  | 'linkedin'
  | 'engagement'

export interface LeadTableViewState {
  /** Standard ~28, expanded adds many more. */
  dataset: 'standard' | 'expanded'
  engagement: 'all' | 'engaged'
  /**
   * `null` = all lead sources. Non-null = only these (one or more); rows match if `sourceId` is in the set.
   */
  sourceFilter: readonly LeadSourceId[] | null
  /**
   * Substring (case-insensitive) match on the column’s cell value; all set entries are ANDed.
   * Set via AI interpretation or in-app; empty object = no text filters.
   */
  columnTextFilters: Partial<Record<SortColumn, string>>
  sortPrimary: SortColumn
  sortPrimaryDir: 'asc' | 'desc'
  sortSecondary: SortColumn | null
  sortSecondaryDir: 'asc' | 'desc'
  /** Bump to replay row-reveal animation. */
  phaseToken: number
}

export const defaultLeadTableViewState = (): LeadTableViewState => ({
  dataset: 'standard',
  engagement: 'all',
  sourceFilter: null,
  columnTextFilters: {},
  sortPrimary: 'name',
  sortPrimaryDir: 'asc',
  sortSecondary: 'industry',
  sortSecondaryDir: 'asc',
  phaseToken: 0,
})

function colValue(row: DistributorRow, col: SortColumn): string {
  switch (col) {
    case 'name':
      return row.name
    case 'location':
      return row.location
    case 'country':
      return row.country
    case 'source':
      return row.sourceId
    case 'description':
      return [row.description, row.productsRequested]
        .filter((x) => x != null && String(x).trim() !== '')
        .join(' ')
    case 'industry':
      return row.primaryIndustry
    case 'size':
      return row.size
    case 'type':
      return row.type
    case 'linkedin':
      return row.linkedInUrl
    case 'engagement':
      return row.engagement
    default:
      return ''
  }
}

function compare(a: string, b: string, dir: 'asc' | 'desc'): number {
  const c = a.localeCompare(b, undefined, { sensitivity: 'base' })
  return dir === 'asc' ? c : -c
}

export function applyLeadTableView(rows: DistributorRow[], s: LeadTableViewState): DistributorRow[] {
  let out = rows.filter((r) => {
    if (s.engagement === 'engaged' && r.engagement !== 'engaged') return false
    if (s.sourceFilter && s.sourceFilter.length > 0 && !s.sourceFilter.includes(r.sourceId)) {
      return false
    }
    for (const col of Object.keys(s.columnTextFilters) as SortColumn[]) {
      const needle = s.columnTextFilters[col]
      if (!needle || !String(needle).trim()) continue
      const cell = colValue(r, col)
      if (!cell.toLowerCase().includes(String(needle).trim().toLowerCase())) {
        return false
      }
    }
    return true
  })

  const sorted = [...out].sort((a, b) => {
    const p = compare(
      colValue(a, s.sortPrimary),
      colValue(b, s.sortPrimary),
      s.sortPrimaryDir,
    )
    if (p !== 0) return p
    if (s.sortSecondary) {
      const q = compare(
        colValue(a, s.sortSecondary),
        colValue(b, s.sortSecondary),
        s.sortSecondaryDir,
      )
      if (q !== 0) return q
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return sorted
}

/**
 * Detects chat that should open / refresh the Milwaukee distributor lead grid.
 * Kept permissive so “give me milwaukee distributors”, “Milwaukee leads”, etc. all work.
 */
export function matchMilwaukeeLeadGridIntent(raw: string): boolean {
  const t = raw.trim()
  if (!t) return false
  const lower = t.toLowerCase()
  if (!/\bmilwaukee\b/i.test(t)) return false

  if (
    /\b(distributors?|dealer|dealers|distribution)\b/i.test(lower) ||
    /distribut/i.test(lower)
  ) {
    return true
  }
  if (/\b(leads?|accounts?|pipeline|grid|table|list)\b/i.test(lower)) return true
  if (/\bmilwaukee\s+(?:area|metro|region|wi|wisconsin)\b/i.test(lower)) return true
  if (/^(?:find|get|give|show|list|pull)\s+(?:me\s+)?(?:the\s+)?milwaukee\b/im.test(t)) return true
  return false
}

export function sourceLabelForChat(id: LeadSourceId): string {
  const map: Record<LeadSourceId, string> = {
    salesforce: 'Salesforce',
    clay: 'Clay',
    outlook: 'Outlook',
    call_central: 'RingCentral',
    apollo: 'Apollo',
    hubspot: 'HubSpot',
    linkedin: 'LinkedIn',
    zoominfo: 'ZoomInfo',
    outreach: 'Outreach',
    salesloft: 'Salesloft',
    internet: 'Internet',
  }
  return map[id] ?? id
}

/**
 * Every distinct lead source name found in the message, in a stable “priority” order
 * (same as legacy single-match) so “apollo and outlook” returns both, not the first only.
 */
export function matchAllSourcesFromChat(t: string): LeadSourceId[] {
  const s = t.toLowerCase()
  const out: LeadSourceId[] = []
  const add = (id: LeadSourceId) => {
    if (!out.includes(id)) out.push(id)
  }
  if (/\bring\s*central|ringcentral|call\s*central\b/.test(s)) add('call_central')
  if (/\bzoominfo\b|\bzoom info\b/.test(s)) add('zoominfo')
  if (/\bsalesloft\b/.test(s)) add('salesloft')
  if (/\bsales\s+lofts?\b/.test(s)) add('salesloft')
  if (/\bsalesforce\b/.test(s)) add('salesforce')
  if (/\bsales\s+force\b/.test(s)) add('salesforce')
  if (/\bclay\b/.test(s)) add('clay')
  if (/\boutlook\b/.test(s)) add('outlook')
  if (/\bapollo\b/.test(s)) add('apollo')
  if (/\bhubspot\b/.test(s)) add('hubspot')
  if (/\blinkedin\b/.test(s)) add('linkedin')
  if (/\boutreach\b/.test(s)) add('outreach')
  if (/\binternet\b|\bweb (?:lead|source)|\bchrome\b/i.test(s)) add('internet')
  for (const id of LEAD_SOURCE_IDS) {
    if (!out.includes(id) && s.includes(id.replace(/_/g, ' '))) add(id)
  }
  return out
}

export function matchSourceFromChat(t: string): LeadSourceId | null {
  return matchAllSourcesFromChat(t)[0] ?? null
}

function sourceNamesMarkdownList(ids: readonly LeadSourceId[]): string {
  const parts = ids.map((id) => `**${sourceLabelForChat(id)}**`)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

/** “Source column: …” / “filter on source” should not clobber a sort the user already set. */
function shouldKeepSortOnSourceFilter(t: string): boolean {
  if (/\b(?:sort|order|sub[-\s]?sort|subsort|group|bucket|then)\b/i.test(t)) return false
  return (
    /\b(?:in|on|for|by|from)\s+(?:the\s+)?(?:source|lead[ -]?source|system)\s+(?:column|field|only)\b/i.test(
      t,
    ) ||
    /\b(?:source|lead[ -]?source|system)\s*[:#]/.test(t) ||
    /\bfilter\s+(?:on|in|to)\s+(?:the\s+)?(?:source|lead[ -]?source|system)(?:\s+column)?\b/i.test(t) ||
    /\bthe\s+source\s+column\b/i.test(t)
  )
}

/**
 * True when the user is asking to narrow the grid to a lead source (in addition to
 * “only from X” / “filter to”). Handles “give me all of the apollo leads”, “all
 * apollo”, “show me hubspot”, “apollo leads”, “apollo and outlook”, etc.
 */
function isSourceFilterCommandIntent(t: string): boolean {
  const fromChat = matchAllSourcesFromChat(t)
  if (fromChat.length === 0) return false
  if (fromChat.length >= 2) return true
  if (
    /\b(?:in|on|for|by|from)\s+(?:the\s+)?(?:source|lead[ -]?source|system)\s+(?:column|field|only)\b/i.test(t) ||
    /\b(?:source|lead[ -]?source|system)\s*[:#]/.test(t) ||
    /\bfilter\s+(?:on|in|to)\s+(?:the\s+)?(?:source|lead[ -]?source|system)(?:\s+column)?\b/i.test(t) ||
    /\bthe\s+source\s+column\b/i.test(t)
  ) {
    return true
  }
  if (/\b(only|just)\s+(?:a\s+)?(?:leads?\s+)?from\s+/i.test(t)) return true
  if (/\bfilter\s+(?:to|by)\b/i.test(t)) return true
  if (
    /\bonly\s+(?:from\s+)?(salesforce|hubspot|outlook|clay|apollo|zoom|linkedin|ring|outreach|salesloft|internet|web|hub spot|ring\s*central)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/\b(only|just)\b/i.test(t)) return true
  if (/\b(give|show|get|list|pull|want|need)\s+me\b/i.test(t)) return true
  if (/\b(give|show|get|list|pull)\s+us\b/i.test(t)) return true
  if (/\b(all|all of|all of the|each|every|everyone'?s?)\b/i.test(t) && /\b(leads?|accounts?|rows?|lines?|records?)\b/i.test(t)) {
    return true
  }
  if (/\b(leads?|rows?|accounts?)\s+from\s+/i.test(t)) return true
  if (
    /\b(?:the|those|my|this)\s+(salesforce|hubspot|outlook|clay|apollo|zoom|linkedin|ring|outreach|salesloft|internet|ringcentral)\s+leads?\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/\b(salesforce|hubspot|outlook|clay|apollo|zoom|linkedin|outreach|salesloft|internet|ring)\s+leads?\b/i.test(t)) {
    return true
  }
  if (/\b(all|all of|all of the)\s+\w+/i.test(t) && t.length < 64) return true
  if (/^(?:all|just|only)\s+/i.test(t.trim()) && t.length < 56) return true
  if (/\bjust\s+the\s+\w+\s+leads?\b/i.test(t)) return true
  return false
}

const SORT_ALIASES: { pat: RegExp; col: SortColumn }[] = [
  { pat: /^(sort|order) by (?:the )?name\b/i, col: 'name' },
  { pat: /^(sort|order) by (?:the )?(location|city|where)\b/i, col: 'location' },
  { pat: /^(sort|order) by (?:the )?(country|nation)\b/i, col: 'country' },
  { pat: /^(sort|order) by (?:the )?(source|system|from)\b/i, col: 'source' },
  { pat: /^(sort|order) by (?:the )?(description|blurb|about)\b/i, col: 'description' },
  { pat: /^(sort|order) by (?:the )?(industry|vertical)\b/i, col: 'industry' },
  { pat: /^(sort|order) by (?:the )?(size|headcount|employees)\b/i, col: 'size' },
  { pat: /^(sort|order) by (?:the )?(type|entity)\b/i, col: 'type' },
  { pat: /^(sort|order) by (?:the )?(linkedin|url|profile link)\b/i, col: 'linkedin' },
  { pat: /^(sort|order) by (?:the )?(engagement|relationship|stage)\b/i, col: 'engagement' },
  { pat: /\b(sort|order) (?:by|on) (?:the )?name\b/i, col: 'name' },
  { pat: /\b(sort|order) (?:by|on) (?:the )?location\b/i, col: 'location' },
  { pat: /\b(sort|order) (?:by|on) (?:the )?country\b/i, col: 'country' },
  { pat: /\b(sort|order) (?:by|on) (?:the )?lead source\b/i, col: 'source' },
  { pat: /\b(sort|order) (?:by|on) (?:the )?industry\b/i, col: 'industry' },
  { pat: /\b(sort|order) (?:by|on) (?:the )?size\b/i, col: 'size' },
  { pat: /\b(sort|order) (?:by|on) (?:the )?type\b/i, col: 'type' },
  { pat: /\b(sort|order) (?:by|on) (?:the )?description\b/i, col: 'description' },
  { pat: /\b(sort|order) (?:by|on) (?:the )?linkedin\b/i, col: 'linkedin' },
  { pat: /\b(sort|order) (?:by|on) (?:the )?engagement\b/i, col: 'engagement' },
]

const SUB_ALIASES: { pat: RegExp; col: SortColumn }[] = [
  { pat: /sub[-\s]?sort (?:by|on) (?:the )?name\b/i, col: 'name' },
  { pat: /sub[-\s]?sort (?:by|on) (?:the )?(?:location|where|city)\b/i, col: 'location' },
  { pat: /sub[-\s]?sort (?:by|on) (?:the )?country\b/i, col: 'country' },
  { pat: /sub[-\s]?sort (?:by|on) (?:the )?(?:source|system|from)\b/i, col: 'source' },
  { pat: /sub[-\s]?sort (?:by|on) (?:the )?industry\b/i, col: 'industry' },
  { pat: /sub[-\s]?sort (?:by|on) (?:the )?size\b/i, col: 'size' },
  { pat: /sub[-\s]?sort (?:by|on) (?:the )?type\b/i, col: 'type' },
  { pat: /sub[-\s]?sort (?:by|on) (?:the )?description\b/i, col: 'description' },
  { pat: /sub[-\s]?sort (?:by|on) (?:the )?linkedin\b/i, col: 'linkedin' },
  { pat: /sub[-\s]?sort (?:by|on) (?:the )?engagement\b/i, col: 'engagement' },
  { pat: /then (?:by|sort) (?:the )?name\b/i, col: 'name' },
  { pat: /then (?:by|sort) (?:the )?location\b/i, col: 'location' },
  { pat: /then (?:by|sort) (?:the )?country\b/i, col: 'country' },
  { pat: /then (?:by|sort) (?:the )?source\b/i, col: 'source' },
  { pat: /then (?:by|sort) (?:the )?industry\b/i, col: 'industry' },
  { pat: /then (?:by|sort) (?:the )?size\b/i, col: 'size' },
  { pat: /then (?:by|sort) (?:the )?type\b/i, col: 'type' },
  { pat: /then (?:by|sort) (?:the )?description\b/i, col: 'description' },
  { pat: /then (?:by|sort) (?:the )?linkedin\b/i, col: 'linkedin' },
  { pat: /then (?:by|sort) (?:the )?engagement\b/i, col: 'engagement' },
  { pat: /break (?:all )?ties? (?:by|on|with) (?:the )?name\b/i, col: 'name' },
  { pat: /break (?:all )?ties? (?:by|on|with) (?:the )?(?:location|city)\b/i, col: 'location' },
  { pat: /break (?:all )?ties? (?:by|on|with) (?:the )?industry\b/i, col: 'industry' },
  { pat: /break (?:all )?ties? (?:by|on|with) (?:the )?size\b/i, col: 'size' },
  { pat: /break (?:all )?ties? (?:by|on|with) (?:the )?type\b/i, col: 'type' },
  { pat: /break (?:all )?ties? (?:by|on|with) (?:the )?description\b/i, col: 'description' },
  { pat: /break (?:all )?ties? (?:by|on|with) (?:the )?(?:source|system)\b/i, col: 'source' },
  { pat: /second(?:ary)? sort (?:by|on) (?:the )?name\b/i, col: 'name' },
  { pat: /second(?:ary)? sort (?:by|on) (?:the )?location\b/i, col: 'location' },
  { pat: /second(?:ary)? sort (?:by|on) (?:the )?country\b/i, col: 'country' },
  { pat: /second(?:ary)? sort (?:by|on) (?:the )?source\b/i, col: 'source' },
  { pat: /second(?:ary)? sort (?:by|on) (?:the )?description\b/i, col: 'description' },
  { pat: /second(?:ary)? sort (?:by|on) (?:the )?industry\b/i, col: 'industry' },
  { pat: /second(?:ary)? sort (?:by|on) (?:the )?size\b/i, col: 'size' },
  { pat: /second(?:ary)? sort (?:by|on) (?:the )?type\b/i, col: 'type' },
  { pat: /second(?:ary)? sort (?:by|on) (?:the )?linkedin\b/i, col: 'linkedin' },
  { pat: /second(?:ary)? sort (?:by|on) (?:the )?engagement\b/i, col: 'engagement' },
  { pat: /(?:within|inside) (?:each )?source,?\s*(?:sort|order) (?:by|on) (?:the )?name\b/i, col: 'name' },
  { pat: /,\s*then (?:the )?name\b/i, col: 'name' },
  { pat: /,\s*then (?:the )?industry\b/i, col: 'industry' },
  { pat: /,\s*then (?:the )?location\b/i, col: 'location' },
]

const COLUMN_WORD: Record<SortColumn, string> = {
  name: 'name',
  location: 'location',
  country: 'country',
  source: 'lead source',
  description: 'description',
  industry: 'industry',
  size: 'size',
  type: 'type',
  linkedin: 'LinkedIn',
  engagement: 'engagement',
}

/** For UI copy and for LLM “sort / sub-sort / filters” context. */
export function describeTableState(s: LeadTableViewState): string {
  const filters: string[] = []
  if (s.sourceFilter && s.sourceFilter.length > 0) {
    filters.push(`${sourceNamesMarkdownList(s.sourceFilter)} only`)
  }
  if (s.engagement === 'engaged') filters.push('**engaged** only')
  const colFilters = s.columnTextFilters
  for (const col of Object.keys(colFilters) as SortColumn[]) {
    const v = colFilters[col]
    if (v && String(v).trim()) {
      filters.push(
        `**${COLUMN_WORD[col]}** ≈ “${String(v).replace(/\*/g, '')}”`,
      )
    }
  }
  const base = filters.length > 0 ? filters.join(' · ') : 'all sources, all engagement'
  const dirW = s.sortPrimaryDir === 'asc' ? 'ascending' : 'descending'
  if (s.sortSecondary) {
    const subW = s.sortSecondaryDir === 'asc' ? 'ascending' : 'descending'
    return `${base} — primary: **${COLUMN_WORD[s.sortPrimary]}** (${dirW}) — sub-sort: **${
      COLUMN_WORD[s.sortSecondary]
    }** (${subW}) (ties within a primary bucket).`
  }
  return `${base} — sorted by **${COLUMN_WORD[s.sortPrimary]}** (${dirW})`
}

/**
 * When true, a short line still looks like a list filter, sort, or column constraint
 * (don’t use the “snippy” follow-up; user may be in AI/Ask mode for natural phrasing).
 */
function looksLikeNaturalTableFilterOrSort(t: string): boolean {
  const t2 = t.trim()
  if (t2.length > 200) return true
  if (/[.?!]\s*$/m.test(t2)) return true
  if (
    /\b(sort|order|sub[-\s]?sort|subsort|sub-sort|group|filter|only|just|where|over|under|at least|at most|headcount|head\s*count|employees?|firms?|companies?|larger?|smaller?|bigger?|in\s+the|in\s+pharma|pharmaceutical?|pharma|biotech|manufact|wholesale|retail|location|country|industry|size|source|engagement|type|name|smallest|largest|show\s+me|hide|clear|reset|desc|asc)\b/i.test(
      t2,
    )
  ) {
    return true
  }
  if (/\b(>\s*|\u003e|≥|≤|&gt;|&lt;|more than|less than|only in)\b/i.test(t2)) return true
  if (/\d{2,4}\s*\+|\b\d{1,2},\d{3}\b|[<>]\s*\d+/.test(t2)) return true
  if (/^\s*(?:only|just)\s+in\s+/i.test(t2)) return true
  return false
}

/**
 * No-API backup: common natural phrases → columnTextFilters.
 */
function tryHeuristicColumnTextFilters(
  t: string,
  prev: LeadTableViewState,
): { state: LeadTableViewState; reply: string; delayMs: number } | null {
  const next: Partial<Record<SortColumn, string>> = { ...prev.columnTextFilters }
  const notes: string[] = []
  let did = false

  if (
    /\b(?:employees?|headcount|head\s*count|people|staff)\b[^.!?\n]{0,32}[>≥]\s*1,?0{3}\b/i.test(t) ||
    /[>≥]\s*1,?0{3}\b(?:\s*employees?)?/i.test(t) ||
    /\bover\s+1,?0{3}\b(?:\s*employees?)?/i.test(t) ||
    /^\s*>\s*1000\b/i.test(t.trim()) ||
    /\b>\s*1000\b/.test(t)
  ) {
    next.size = '1,001'
    did = true
    notes.push('**Size** (cells whose label includes 1,001+ for this demo data)')
  }

  const onlyInM = t.match(/\bonly\s+in\s+(?:the\s+)?([^.\n?!]{1,40})/i)
  if (onlyInM?.[1]) {
    const raw = onlyInM[1].trim()
    const frag = raw.replace(/\b(sector|industry|only|firms?|leads?)\b/gi, '').trim() || raw
    if (frag.length >= 2) {
      next.industry = frag
      did = true
      notes.push(`**industry** (contains “${frag}”)`)
    }
  }

  if (!did) return null

  const s: LeadTableViewState = {
    ...prev,
    columnTextFilters: next,
    phaseToken: prev.phaseToken + 1,
  }
  const what = notes.length > 0 ? notes.join(' · ') : 'your **column** filters'
  return {
    state: s,
    reply: `Narrowing the list with ${what} — the grid is rephasing. Say **reset filter** to clear, or rephrase in Ask for a different slice.`,
    delayMs: 600,
  }
}

function conversationalLeadTableFallback(
  t: string,
  s: LeadTableViewState,
  priorUser: string[],
): string {
  const lower = t.trim().toLowerCase()
  const stateLine = describeTableState(s)
  const stateLinePunct = stateLine.endsWith('.') ? stateLine : `${stateLine}.`
  if (
    priorUser.length > 0 &&
    lower.length < 32 &&
    !/[.?!]/.test(t) &&
    !looksLikeNaturalTableFilterOrSort(t)
  ) {
    return `I caught that, but I did not run it as a table command. Right now: ${stateLinePunct} Re-try with **sort**, a source (e.g. **Apollo and Outlook**), **only from…**, or **find more leads**?`
  }
  if (/\b(why|how come|huh\??)\b/.test(lower) && priorUser.length > 0) {
    return `Makes sense to ask. ${stateLinePunct} If you want a different slice, name a column, a source, or “more leads.”`
  }
  return `I did not map that to a table action yet. ${stateLinePunct} In **Ask** with an API key, say what you want in plain language (sources, size, industry, country, etc.). You can also try: **sort by location**, **only from Salesforce**, **HubSpot and LinkedIn**, or **find more leads**.`
}

const DESC_WORDS = /(?:\bdesc\b|descending|z-a|reverse|high to low|newest|largest first|from high|z\s*to\s*a)/i

/** For regexes that must match what users type (“source” vs our label “lead source”). */
function sortColumnAsRegexFragment(col: SortColumn): string {
  switch (col) {
    case 'name':
      return 'name'
    case 'source':
      return '(?:lead[\\s-])?source'
    case 'description':
      return 'description|blurb|about'
    case 'linkedin':
      return 'linkedin|profile link'
    case 'industry':
      return 'industry|vertical'
    case 'engagement':
      return 'engagement|relationship|we know|net new'
    default:
      return COLUMN_WORD[col].replace(/ /g, '\\s+')
  }
}

/** Direction for the *secondary* sort when a sub-sort / break-ties / “then by” is present. */
function inferSecondaryDir(t: string, secondaryCol: SortColumn): 'asc' | 'desc' {
  const colFrag = sortColumnAsRegexFragment(secondaryCol)
  if (
    new RegExp(
      `(?:sub[-\\s]?sort|subsort|second(?:ary)?\\s*sort|break (?:all )?ties?)[^\\n]{0,120}(${colFrag})[^\\n]{0,50}${DESC_WORDS.source}`,
      'i',
    ).test(t) ||
    new RegExp(
      `break (?:all )?ties?\\s+(?:by|on|with)\\s+[^\\n]{0,50}(${colFrag})[^\\n]{0,50}${DESC_WORDS.source}`,
      'i',
    ).test(t) ||
    new RegExp(`,\\s*then (?:the )?(${colFrag})[^\\n]{0,30}${DESC_WORDS.source}`, 'i').test(t)
  ) {
    return 'desc'
  }
  return 'asc'
}

export function parseSortColumn(t: string): {
  primary?: SortColumn
  secondary?: SortColumn
  secondaryDir?: 'asc' | 'desc'
  descending: boolean
} {
  const lower = t.toLowerCase()
  const descending = /\b(desc|descending|newest|z-a|reverse|high to low)\b/.test(lower)

  if (/\bdouble sort\b/i.test(t) && /source|lead source/i.test(t) && /then.+\bname\b/i.test(t)) {
    return { primary: 'source', secondary: 'name', secondaryDir: inferSecondaryDir(t, 'name'), descending }
  }

  let secondary: SortColumn | undefined
  for (const { pat, col } of SUB_ALIASES) {
    if (pat.test(t)) {
      secondary = col
      break
    }
  }
  if (/\b(group|hash|bucket)\b.+\b(source|from)\b|stack(?:ed)?\s+by\s+source/i.test(t) && !secondary) {
    secondary = 'name'
  }

  const tForPrimary = t.replace(/sub[-\s]sort|subsort/gi, (m) => m.replace(/sort|Sort|SORT/g, 'SRT'))
  let primary: SortColumn | undefined
  for (const { pat, col } of SORT_ALIASES) {
    if (pat.test(tForPrimary)) {
      primary = col
      break
    }
  }

  if (secondary && !primary) {
    return { primary: 'source', secondary, secondaryDir: inferSecondaryDir(t, secondary), descending }
  }
  if (primary && secondary && primary === secondary) {
    secondary = undefined
  }
  const secondaryDir = secondary ? inferSecondaryDir(t, secondary) : undefined
  return { primary, secondary, secondaryDir, descending }
}

/**
 * @returns { state, reply, rephase, openLeadContext, delayMs }
 */
export function processLeadTableChat(
  text: string,
  prev: LeadTableViewState,
  _page: string,
  options?: { priorUserMessages?: string[] },
): {
  state: LeadTableViewState
  reply: string
  rephase: boolean
  openLeadContext: boolean
  delayMs: number
} {
  const priorUser = options?.priorUserMessages ?? []
  const t = text.trim()
  const lower = t.toLowerCase()
  let s: LeadTableViewState = { ...prev, phaseToken: prev.phaseToken }
  let reply: string | null = null
  let rephase = false
  let openLeadContext = false
  let delayMs = 360

  if (matchMilwaukeeLeadGridIntent(t)) {
    openLeadContext = true
    rephase = true
    s = {
      ...defaultLeadTableViewState(),
      phaseToken: prev.phaseToken + 1,
      dataset: 'standard',
    }
    reply =
      'Pulling the Milwaukee distributor grid — I’m phasing it in on the right. Ask to narrow, sort, or sub-sort (e.g. by source, then by industry or location).'
    return { state: s, reply, rephase, openLeadContext, delayMs: 600 }
  }

  if (/\bfind more|more leads|expand (?:the )?set|bigger (?:data )?set\b/i.test(t)) {
    s.dataset = 'expanded'
    s.phaseToken += 1
    rephase = true
    reply = `Expanding the sample — ${s.dataset === 'expanded' ? 'a lot' : 'more'} of leads are materializing, staggered on purpose.`
    delayMs = 700
    return { state: s, reply, rephase, openLeadContext: false, delayMs }
  }

  const sourceIntent = isSourceFilterCommandIntent(t)
  if (sourceIntent) {
    const ids = matchAllSourcesFromChat(t)
    if (ids.length > 0) {
      s.sourceFilter = ids
      if (!shouldKeepSortOnSourceFilter(t)) {
        s.sortPrimary = 'source'
        s.sortPrimaryDir = 'asc'
      }
      s.phaseToken += 1
      rephase = true
      const list = sourceNamesMarkdownList(ids)
      const scope = ids.length > 1 ? 'those sources' : 'that source'
      reply = shouldKeepSortOnSourceFilter(t)
        ? `Filtering to ${list} — your sort is unchanged; the grid is narrowed in the **Source** column.`
        : `Filtering to ${list} — re-hashing under ${scope}, then your sub-sorts apply.`
      return { state: s, reply, rephase, openLeadContext: false, delayMs: 450 }
    }
  }
  if (/\bclear (?:the )?source|all sources|drop source filter\b/i.test(t)) {
    s.sourceFilter = null
    s.phaseToken += 1
    rephase = true
    reply = 'Cleared the source filter. Re-sorting the full set.'
    return { state: s, reply, rephase, openLeadContext: false, delayMs: 450 }
  }

  if (
    /\bfind only people (?:who|that) (?:we|I)'?ve|only people (?:who|that) (?:we|I)'?ve|we'?ve (?:met|contacted|spoken|engaged|talked|known)|only engaged|only existing/i.test(
      t,
    ) ||
    (lower.includes("we've") && /met|contact|spoke|worked|engaged|known|talked|already/.test(t)) ||
    (t.length < 90 && /only people who we'?ve|people we'?ve/i.test(t))
  ) {
    s.engagement = 'engaged'
    s.phaseToken += 1
    rephase = true
    reply =
      'Keeping **people we already know** (engaged / net-new is filtered). Rows are repainting with a relationship bias.'
    return { state: s, reply, rephase, openLeadContext: false, delayMs: 450 }
  }

  if (/\ball leads|show everyone|include net.?new|reset filter|clear engagement|drop engagement filter\b/i.test(t)) {
    s.engagement = 'all'
    s.sourceFilter = null
    s.columnTextFilters = {}
    s.phaseToken += 1
    rephase = true
    reply = 'Opening back up: **all** engagement types, sources, and column text filters. Watch the set breathe back in row by row.'
    return { state: s, reply, rephase, openLeadContext: false, delayMs: 500 }
  }

  const sortBits = parseSortColumn(t)
  if (sortBits.primary) {
    s.sortPrimary = sortBits.primary
    s.sortPrimaryDir = sortBits.descending ? 'desc' : 'asc'
    if (sortBits.secondary) {
      s.sortSecondary = sortBits.secondary
      s.sortSecondaryDir = sortBits.secondaryDir ?? 'asc'
    } else {
      s.sortSecondary = null
    }
    s.phaseToken += 1
    rephase = true
    const pWord = COLUMN_WORD[sortBits.primary]
    reply = sortBits.secondary
      ? `Primary: **${pWord}** (${s.sortPrimaryDir}). Sub-sort: **${COLUMN_WORD[sortBits.secondary]}** (${
        s.sortSecondaryDir
      }) so buckets (e.g. under **Salesforce**) are stable, then ties break.`
      : `Sorting by **${pWord}** (${s.sortPrimaryDir}) — the table is reflowing.`
    return { state: s, reply, rephase, openLeadContext: false, delayMs: 400 }
  }

  if (
    /^help$/i.test(t) ||
    t === '?' ||
    /what can (?:you|I) do|how (?:do I )?sort|leads? table (?:help|commands)/i.test(t)
  ) {
    return {
      state: s,
      reply:
        'Try: **“Find more leads”** to expand, **“only people we’ve met”** to filter engaged, **“sort by location”** or **“double sort: source, then name”** / **“sub-sort by industry descending”** (tie-breaks within a bucket), **“break ties by name”**, **“only from Salesforce”**, **“Source: Apollo”** (column-style filter, keeps your sort), **“Apollo and Outlook”** (OR across those systems), or use the **funnel** on the **Source** column. **Natural language in Ask** (e.g. **employees \u003e 1000**, **only in pharma**, **sort by size**) is interpreted by the same handler when an API key is on. Click other headers to sort, too.',
      rephase: false,
      openLeadContext: false,
      delayMs: 360,
    }
  }

  const heur = tryHeuristicColumnTextFilters(t, s)
  if (heur) {
    return { state: heur.state, reply: heur.reply, rephase: true, openLeadContext: false, delayMs: heur.delayMs }
  }

  if (reply == null) {
    reply = conversationalLeadTableFallback(t, s, priorUser)
  }

  return { state: s, reply, rephase, openLeadContext, delayMs }
}
