import { fetchOpenAiJsonObject, type OzOpenAiMessage } from '../../services/ozOpenAi'
import {
  defaultLeadTableViewState,
  describeTableState,
  type LeadTableViewState,
  type SortColumn,
} from './leadGenTableModel'
import { LEAD_SOURCE_IDS, type LeadSourceId } from './leadSourceMeta'

const SORT_COLUMNS: readonly SortColumn[] = [
  'name',
  'location',
  'country',
  'source',
  'description',
  'industry',
  'size',
  'type',
  'linkedin',
  'engagement',
] as const

const TABLE_INTERPRET_SYSTEM = `You control filters and sorting for a **Milwaukee-area distributor lead table** in a product demo. Reply with **a single JSON object** only (no markdown).

Use this exact shape. Omit keys you are not changing (except affectsTable and reply as needed).

{
  "affectsTable": boolean,
  "reply": "One short user-facing sentence when affectsTable is true; optional when false",
  "openMilwaukeeGrid": boolean,
  "resetAllFilters": boolean,
  "sourceFilter": null | string[],
  "columnTextFilters": object,
  "sortPrimary": string,
  "sortPrimaryDir": "asc" | "desc",
  "sortSecondary": string | null,
  "sortSecondaryDir": "asc" | "desc",
  "dataset": "standard" | "expanded",
  "engagement": "all" | "engaged"
}

Column keys for **columnTextFilters** and **sort\***: name, location, country, source, description, industry, size, type, linkedin, engagement. **Size** values in the table look like "51-200 employees", "1,001-5,000 employees", "10,001+ employees".

Rules:
- **affectsTable**: true for almost any request to change what rows show, how they are ordered, or the sample size — including one-word or fragment commands like "only in pharma", "employees >1000", "US only", "sort by size", "smallest first", "Wisconsin". True for filters on **any** column. **False** only for thanks, off-topic chit-chat, or questions that do not ask to change the list or its sort.
- **sourceFilter**: \`null\` = all lead sources. Array = OR across those system ids. Allowed: ${LEAD_SOURCE_IDS.join(', ')}. Map: "outlook" → outlook, "sales loft" / "salesloft" → salesloft, "salesforce" / "sfdc" / "sales force" → salesforce, "ring" / "ring central" / "call central" → call_central, "zoom" / "zoominfo" → zoominfo, "hub spot" → hubspot, "linked in" → linkedin, "chrome" (internet leads) → internet.
- **columnTextFilters**: substring (case-insensitive) must appear in the cell. Examples:
  - "employees \u003e 1000" / "over 1000 employees" / "\u003e1000" → set **size** to **"1,001"** (matches bands like 1,001-5,000 and 10,001+ in the sample data) or a substring that will match the user’s headcount range.
  - "only in pharma" / "pharmaceutical" / "biotech" → **industry** contains e.g. "pharma" or "Biotech" per the row text.
  - "in Wisconsin" / "WI" / "Germany" → **location** or **country** as appropriate.
- **resetAllFilters**: true clears source, all columnTextFilters, engagement=all.
- **openMilwaukeeGrid**: true for Milwaukee distributor / Milwaukee leads.
- **sortPrimary** / **sortSecondary**: user may request sort by **any** column, e.g. "sort by size desc", "order by name", "sub-sort by industry" — set sort fields accordingly; if only primary sort, set **sortSecondary** to null to clear a previous sub-sort.
- **engagement** "engaged" = only people we already know / net new hidden when appropriate from user wording.
- For "companies of a certain size", set **columnTextFilters.size** to a **short substring** that will match the Size column (digits and commas as shown in data).

**Always set affectsTable: true and fill columnTextFilters and/or sourceFilter and/or sort when the user is clearly asking to filter or sort the list**, even in two or three words. When in doubt, treat as a table request.`

function isSortColumn(s: string | undefined | null): s is SortColumn {
  if (!s) return false
  return (SORT_COLUMNS as readonly string[]).includes(s)
}

function isLeadSourceId(s: string): s is LeadSourceId {
  return (LEAD_SOURCE_IDS as readonly string[]).includes(s)
}

function normalizeLlmState(
  prev: LeadTableViewState,
  data: Record<string, unknown>,
  /** When the model set affectsTable: true we still apply a visible refresh even if the patch is empty. */
  affectsTableIntent: boolean,
): { state: LeadTableViewState; rephase: boolean; openLeadContext: boolean; delayMs: number } {
  if (data.openMilwaukeeGrid === true) {
    return {
      state: {
        ...defaultLeadTableViewState(),
        phaseToken: prev.phaseToken + 1,
        dataset: 'standard',
      },
      rephase: true,
      openLeadContext: true,
      delayMs: 1_500,
    }
  }

  let s: LeadTableViewState = { ...prev, phaseToken: prev.phaseToken }
  let changed = false

  if (data.resetAllFilters === true) {
    s = {
      ...s,
      sourceFilter: null,
      columnTextFilters: {},
      engagement: 'all',
    }
    changed = true
  }

  if (Array.isArray(data.sourceFilter)) {
    const ids = (data.sourceFilter as unknown[])
      .filter((x) => typeof x === 'string')
      .map((x) => x as string)
      .filter(isLeadSourceId)
    s = { ...s, sourceFilter: ids.length > 0 ? ids : null }
    changed = true
  } else if (data.sourceFilter === null) {
    s = { ...s, sourceFilter: null }
    changed = true
  }

  if (data.columnTextFilters !== undefined && data.columnTextFilters !== null) {
    if (typeof data.columnTextFilters === 'object' && !Array.isArray(data.columnTextFilters)) {
      const next: Partial<Record<SortColumn, string>> = {}
      for (const [k, v] of Object.entries(data.columnTextFilters as Record<string, unknown>)) {
        if (!isSortColumn(k) || v == null) continue
        if (typeof v === 'string' && v.trim()) {
          next[k as SortColumn] = v.trim()
        }
      }
      s = { ...s, columnTextFilters: next }
    } else {
      s = { ...s, columnTextFilters: {} }
    }
    changed = true
  }

  if (data.engagement === 'engaged' || data.engagement === 'all') {
    s = { ...s, engagement: data.engagement }
    changed = true
  }

  if (data.dataset === 'expanded' || data.dataset === 'standard') {
    s = { ...s, dataset: data.dataset }
    changed = true
  }

  if (isSortColumn(data.sortPrimary as string | undefined)) {
    s = {
      ...s,
      sortPrimary: data.sortPrimary as SortColumn,
      sortPrimaryDir: data.sortPrimaryDir === 'desc' ? 'desc' : 'asc',
    }
    if (data.sortSecondary === null) {
      s = { ...s, sortSecondary: null }
    } else if (isSortColumn(data.sortSecondary as string | undefined)) {
      s = {
        ...s,
        sortSecondary: data.sortSecondary as SortColumn,
        sortSecondaryDir: data.sortSecondaryDir === 'desc' ? 'desc' : 'asc',
      }
    }
    changed = true
  }

  if (changed) {
    s = { ...s, phaseToken: s.phaseToken + 1 }
  } else if (affectsTableIntent) {
    s = { ...s, phaseToken: s.phaseToken + 1 }
    changed = true
  }

  return {
    state: s,
    rephase: changed,
    openLeadContext: false,
    delayMs: 1_200,
  }
}

export type LeadTableLlmResult =
  | {
      handled: true
      state: LeadTableViewState
      reply: string
      rephase: boolean
      openLeadContext: boolean
      delayMs: number
    }
  | { handled: false }

/**
 * Uses the chat model (JSON mode) to interpret natural language table commands: sources with typos,
 * multi-column filters, size/industry, sort, expand, open Milwaukee grid, reset.
 * Returns **handled: false** when the message is not a table action or in tests / on error.
 */
export async function interpretLeadTableWithLlm(
  userText: string,
  prev: LeadTableViewState,
  _priorUserMessages: string[],
): Promise<LeadTableLlmResult> {
  if (import.meta.env.VITEST) {
    return { handled: false }
  }
  const trimmed = userText.trim()
  if (!trimmed) {
    return { handled: false }
  }

  const stateLine = describeTableState(prev)
  const user: OzOpenAiMessage = {
    role: 'user',
    content: `Current list state: ${stateLine}

User message: ${trimmed}`,
  }
  const messages: OzOpenAiMessage[] = [
    { role: 'system', content: TABLE_INTERPRET_SYSTEM },
    user,
  ]

  try {
    const raw = await fetchOpenAiJsonObject(messages, { maxTokens: 1_200, temperature: 0.15 })
    if (!raw || typeof raw !== 'object') {
      return { handled: false }
    }
    const data = raw as Record<string, unknown>
    if (data.affectsTable !== true) {
      return { handled: false }
    }
    const built = normalizeLlmState(prev, data, true)
    const reply =
      typeof data.reply === 'string' && data.reply.trim()
        ? data.reply.trim()
        : 'Updated the list using your request.'
    return {
      handled: true,
      state: built.state,
      reply,
      rephase: built.rephase,
      openLeadContext: built.openLeadContext,
      delayMs: built.delayMs,
    }
  } catch {
    return { handled: false }
  }
}
