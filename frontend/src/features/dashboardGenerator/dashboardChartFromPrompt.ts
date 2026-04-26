import { fetchOpenAiChatCompletion, isOpenAiConfigured } from '../../services/ozOpenAi'
import type { OzOpenAiMessage } from '../../services/ozOpenAi'
import {
  buildCustomerLeadSourceBars,
  buildCustomerProductRequestBars,
} from './productRequestCustomerDemandData'
import { matchProductRequestCustomerDashboardIntent } from './productRequestDashboardIntent'

export type DashboardChartKind = 'bar' | 'line'

export type DashboardChartSpec = {
  id: string
  title: string
  kind: DashboardChartKind
  series: { label: string; value: number }[]
}

function newId() {
  return `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Fresh ids for chart specs exported to the Dashboards workflow (avoids key collisions). */
export function cloneDashboardChartSpecsForExport(
  specs: ReadonlyArray<DashboardChartSpec>,
): DashboardChartSpec[] {
  return specs.map((c) => ({ ...c, id: newId() }))
}

export function newBatchId() {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

const CHART_SYSTEM = `You are a **dashboard spec generator** for a B2B sales/exteriors demo.

Return **JSON only** (no markdown) with this exact shape:
{
  "charts": [
    { "title": "string", "kind": "bar" | "line", "series": [ { "label": "string", "value": number } ] }
  ]
}

Rules:
- **Max 4 charts**, each with **3–12** points. Values must be non-negative numbers.
- Use titles that match the user's ask (e.g. product request mix, lead source, monthly trend).
- If they ask for a **line** or **trend** / **over time**, use **kind: "line"** with 6–12 month-like labels (Jan, Feb, …) or Q1…Q4.
- If they ask for a **dashboard** (and do not ask specifically for lead source mix or a time series), use **one bar chart**: **product lines requested** (realistic building-products labels like Thermory, AZEK, composite deck, siding).
- If they ask for **bar** of products / categories / sources, use **kind: "bar"**.
- Prefer plausible demo magnitudes (e.g. 10–200), not all identical.
`

function syntheticTrendLine(): { label: string; value: number }[] {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months.slice(0, 8).map((label, i) => ({
    label,
    value: 42 + i * 7 + (i % 3) * 4,
  }))
}

function safeParseJson(raw: string): unknown {
  const t = raw.trim()
  const noFence = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
  return JSON.parse(noFence) as unknown
}

function normalizeChartsFromApi(data: unknown): DashboardChartSpec[] | null {
  if (typeof data !== 'object' || data === null) return null
  const charts = (data as { charts?: unknown }).charts
  if (!Array.isArray(charts) || charts.length === 0) return null
  const out: DashboardChartSpec[] = []
  for (const c of charts.slice(0, 4)) {
    if (typeof c !== 'object' || c === null) continue
    const o = c as {
      title?: unknown
      kind?: unknown
      series?: unknown
    }
    const title = typeof o.title === 'string' ? o.title.trim() : 'Chart'
    const kind = o.kind === 'line' || o.kind === 'bar' ? o.kind : 'bar'
    const series: { label: string; value: number }[] = []
    if (Array.isArray(o.series)) {
      for (const p of o.series) {
        if (typeof p !== 'object' || p === null) continue
        const pl = p as { label?: unknown; value?: unknown }
        if (typeof pl.label === 'string' && typeof pl.value === 'number' && Number.isFinite(pl.value)) {
          series.push({ label: pl.label, value: Math.max(0, pl.value) })
        }
      }
    }
    if (series.length < 1) continue
    out.push({ id: newId(), title, kind, series })
  }
  return out.length > 0 ? out : null
}

/** Demo charts when the user has not used AI yet. */
export function buildDefaultChartsFromData(): DashboardChartSpec[] {
  return [
    {
      id: newId(),
      title: 'Product lines requested (customers)',
      kind: 'bar',
      series: buildCustomerProductRequestBars(),
    },
    {
      id: newId(),
      title: 'Demand by lead source',
      kind: 'bar',
      series: buildCustomerLeadSourceBars(),
    },
  ]
}

/**
 * Keyword fallback when the API is off or errors (e.g. in tests).
 * Still lets users “pretend” and see charts.
 */
function productRequestedBarSpec(title: string): DashboardChartSpec {
  return {
    id: newId(),
    title,
    kind: 'bar',
    series: buildCustomerProductRequestBars(),
  }
}

/** NL “dashboard” without an explicit lead-source or time-series ask → product-request bar (offline heuristics). */
function wantsProductRequestDashboardHeuristic(t: string): boolean {
  const lower = t.toLowerCase()
  if (matchProductRequestCustomerDashboardIntent(t)) return true
  if (!/\bdashboard\b/.test(lower)) return false
  if (/\b(lead )?source|by source|channel|apollo|hubspot|linkedin|salesforce|ring|lead system\b/.test(lower)) {
    return false
  }
  if (/\b(line|trend|over time|month|quarter|season|weekly|year)\b/.test(lower)) {
    return false
  }
  return true
}

export function heuristicsChartsForPrompt(t: string): DashboardChartSpec[] {
  const lower = t.toLowerCase()
  const base = buildDefaultChartsFromData()

  if (/\b(line|trend|over time|month|quarter|season)\b/.test(lower)) {
    return [
      {
        id: newId(),
        title: 'Request volume (trend, demo)',
        kind: 'line',
        series: syntheticTrendLine(),
      },
      ...base.slice(0, 1),
    ]
  }
  if (/\bsource|channel|apollo|hubspot|linkedin|salesforce|ring|lead system\b/.test(lower)) {
    return [
      {
        id: newId(),
        title: 'Demand by lead source',
        kind: 'bar',
        series: buildCustomerLeadSourceBars(),
      },
    ]
  }
  if (wantsProductRequestDashboardHeuristic(t)) {
    return [productRequestedBarSpec('Products requested (customers)')]
  }
  if (/\bproduct|thermory|azek|deck|request|sku|line\b/.test(lower)) {
    return [productRequestedBarSpec('Product lines requested (customers)')]
  }
  return base
}

export async function generateChartsFromPrompt(userText: string): Promise<DashboardChartSpec[]> {
  const text = userText.trim()
  if (!text) return heuristicsChartsForPrompt('default')

  if (isOpenAiConfigured() && !import.meta.env.VITEST) {
    try {
      const messages: OzOpenAiMessage[] = [
        { role: 'system', content: CHART_SYSTEM },
        { role: 'user', content: text },
      ]
      const raw = await fetchOpenAiChatCompletion(messages, {
        maxTokens: 2_200,
        temperature: 0.2,
        responseFormat: 'json_object',
      })
      const parsed = safeParseJson(raw)
      const next = normalizeChartsFromApi(parsed)
      if (next) return next
    } catch {
      // use heuristics
    }
  }
  return heuristicsChartsForPrompt(text)
}
