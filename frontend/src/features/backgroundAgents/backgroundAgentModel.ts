/**
 * Demo-only background agent builder: heuristics for "what" vs "when" in chat.
 */

export const BG_AGENT_STORAGE_KEY = 'oz-demo-background-agents' as const

export interface BackgroundAgentCompany {
  name: string
  domain: string
}

export interface BackgroundAgentRecord {
  id: string
  createdAt: string
  /** What the agent does (task / deliverable). */
  assignment: string
  /** When it runs (schedule summary). */
  schedule: string
  /** Short Title Case line for the card (optional; legacy records omit). */
  taskTitle?: string
  /** Longer description of scope and behavior. */
  taskDetail?: string
  /** One-line outcome. */
  deliverable?: string
  /** Vendors or platforms important for the agent (logos from domain in UI). */
  companies?: BackgroundAgentCompany[]
}

export function matchBackgroundAgentIntent(input: string): boolean {
  const t = input.toLowerCase()
  if (t.length < 3) return false
  if (/\bbackground\s+agent\b/.test(t)) return true
  if (/\b(create|make|add|set\s+up|schedule)\s+(a\s+)?background\s+agent\b/.test(t)) return true
  return false
}

/** Match schedule phrases (broad, demo heuristics). */
const WHEN_PARTS: RegExp[] = [
  /\b(?:daily|weekly|monthly|hourly)\b/gi,
  /\b(?:every|each)\s+(?:week|day|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning)\b/gi,
  /delivered\s+to\s+me\s+on\s+[^,]+/gi,
  /(?:\b|[^a-z])(?:(?:on|every)\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?)?/gi,
  /\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)\b/gi,
  /\b(?:at\s+)?9(?:\s*:\s*00)?\s*(?:am|a\.?m\.?)\b/gi,
  /\bruns?\s+at\s+[^,]+/gi,
]

function stripBackgroundAgentFiller(s: string): string {
  return s
    .replace(/\b(create|make|I\s+want|I\s+need|I'?d\s+like|add|set\s+up|schedule)\b/gi, ' ')
    .replace(/\b(a|an|the)\s+background\s+agent\b/gi, ' ')
    .replace(/\bbackground\s+agent\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectWhenSpans(s: string): { start: number; end: number; text: string }[] {
  const spans: { start: number; end: number; text: string }[] = []
  for (const re of WHEN_PARTS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    const r = new RegExp(re.source, re.flags)
    while ((m = r.exec(s)) != null) {
      const t = m[0]?.trim() ?? ''
      if (t.length < 2) continue
      spans.push({ start: m.index, end: m.index + m[0]!.length, text: t })
    }
  }
  spans.sort((a, b) => a.start - b.start)
  // Drop overlaps: keep later longer span if overlapping
  const out: { start: number; end: number; text: string }[] = []
  for (const sp of spans) {
    const last = out[out.length - 1]
    if (last && sp.start < last.end) {
      if (sp.end - sp.start > last.end - last.start) out[out.length - 1] = sp
      continue
    }
    out.push(sp)
  }
  return out
}

/**
 * Heuristic extraction. Example:
 * "create a weekly sales report ... on monday at 9am about which salesmen..."
 */
export function parseBackgroundAgentRequest(raw: string): { what: string; when: string } {
  const original = raw.trim()
  if (!original) return { what: '', when: '' }

  const lower = original.toLowerCase()
  const spans = collectWhenSpans(original)
  const whenText = spans
    .map((s) => s.text.replace(/\s+/g, ' ').trim())
    .filter((t, i, a) => t.length > 0 && a.indexOf(t) === i)
    .join(' · ')

  if (spans.length > 0) {
    let what = original
    for (const s of spans.slice().sort((a, b) => b.start - a.start)) {
      what = what.slice(0, s.start) + ' ' + what.slice(s.end)
    }
    what = stripBackgroundAgentFiller(what)
    const aboutFromOriginal = /\babout\s+(.+)$/i.exec(original)
    if (aboutFromOriginal?.[1]) {
      what = aboutFromOriginal[1]!.replace(/^[,.\s]+|[,.\s]+$/g, '').trim()
    } else {
      const aboutM = /\babout\s+(.+)$/i.exec(what)
      if (aboutM?.[1]) {
        what = aboutM[1]!.replace(/^[,.\s]+|[,.\s]+$/g, '').trim()
      } else {
        what = what.replace(/\s+/g, ' ').replace(/^[,.\s]+|[,.\s]+$/g, '').trim()
      }
      for (const re of WHEN_PARTS) {
        what = what.replace(new RegExp(re.source, re.flags), ' ')
      }
      what = what.replace(/\s+/g, ' ').replace(/^[,.\s]+|[,.\s]+$/g, '').trim()
    }
    if (whenText) return { what, when: whenText }
  }

  if (/\b(about|report|track|summarize|show|which|list|emails?|send)\b/.test(lower)) {
    return { what: stripBackgroundAgentFiller(original), when: '' }
  }
  if (lower.includes('report') || lower.includes('digest') || lower.includes('analysis')) {
    return { what: stripBackgroundAgentFiller(original), when: '' }
  }

  const fallback = stripBackgroundAgentFiller(original)
  if (fallback.length >= 12 && /[a-z]{4,}/i.test(fallback)) {
    return { what: fallback, when: '' }
  }

  return { what: '', when: '' }
}

function hasSubstantiveWhat(what: string): boolean {
  const w = what.trim()
  if (w.length < 10) return false
  if (!/[a-z]{4,}/i.test(w)) return false
  return true
}

function hasSubstantiveWhen(when: string): boolean {
  return when.trim().length >= 3
}

export function classifyBackgroundRequest(raw: string): {
  needWhat: boolean
  needWhen: boolean
} {
  const { what, when } = parseBackgroundAgentRequest(raw)
  return {
    needWhat: !hasSubstantiveWhat(what),
    needWhen: !hasSubstantiveWhen(when),
  }
}

function mergeText(a: string, b: string): string {
  const x = a.trim()
  const y = b.trim()
  if (!x) return y
  if (!y) return x
  if (x.toLowerCase().includes(y.toLowerCase()) || y.toLowerCase().includes(x.toLowerCase())) {
    return x.length >= y.length ? x : y
  }
  return `${x} — ${y}`
}

/** Stack a new user line into previously collected "what" / "when" fields. */
export function mergeLineIntoPartials(
  prior: { what: string; when: string },
  line: string,
): { what: string; when: string } {
  const p = parseBackgroundAgentRequest(line)
  return {
    what: mergeText(prior.what, p.what),
    when: mergeText(prior.when, p.when),
  }
}

export function tryCompleteBackgroundRequest(
  prior: { what: string; when: string } | null,
  raw: string,
):
  | { ok: true; what: string; when: string }
  | { ok: false; needWhat: boolean; needWhen: boolean; partial: { what: string; when: string } } {
  const merged = mergeLineIntoPartials(prior ?? { what: '', when: '' }, raw)
  const needWhat = !hasSubstantiveWhat(merged.what)
  const needWhen = !hasSubstantiveWhen(merged.when)
  if (needWhat || needWhen) {
    return { ok: false, needWhat, needWhen, partial: merged }
  }
  return { ok: true, what: merged.what.trim(), when: merged.when.trim() }
}

export function readBackgroundAgents(): BackgroundAgentRecord[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return []
    const raw = window.localStorage.getItem(BG_AGENT_STORAGE_KEY)
    if (raw == null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((e) => {
        if (typeof e !== 'object' || e === null) return null
        const o = e as Record<string, unknown>
        const id = typeof o.id === 'string' ? o.id : ''
        const createdAt = typeof o.createdAt === 'string' ? o.createdAt : ''
        const assignment = typeof o.assignment === 'string' ? o.assignment : ''
        const schedule = typeof o.schedule === 'string' ? o.schedule : ''
        if (!id || !assignment || !schedule) return null
        const rec: BackgroundAgentRecord = { id, createdAt, assignment, schedule }
        if (typeof o.taskTitle === 'string' && o.taskTitle.trim()) rec.taskTitle = o.taskTitle.trim()
        if (typeof o.taskDetail === 'string' && o.taskDetail.trim()) rec.taskDetail = o.taskDetail.trim()
        if (typeof o.deliverable === 'string' && o.deliverable.trim()) rec.deliverable = o.deliverable.trim()
        if (Array.isArray(o.companies)) {
          const cos: BackgroundAgentCompany[] = []
          for (const c of o.companies) {
            if (typeof c !== 'object' || c === null) continue
            const co = c as Record<string, unknown>
            const name = typeof co.name === 'string' ? co.name.trim() : ''
            const domain = typeof co.domain === 'string' ? co.domain.trim() : ''
            if (name && domain) cos.push({ name, domain })
          }
          if (cos.length) rec.companies = cos
        }
        return rec
      })
      .filter((e): e is BackgroundAgentRecord => e !== null)
  } catch {
    return []
  }
}

export function saveBackgroundAgents(agents: BackgroundAgentRecord[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(BG_AGENT_STORAGE_KEY, JSON.stringify(agents))
  } catch {
    // ignore
  }
}

export function makeBackgroundAgentId(): string {
  return `bga-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function appendBackgroundAgent(
  assignment: string,
  schedule: string,
  extra?: {
    taskTitle?: string
    taskDetail?: string
    deliverable?: string
    companies?: BackgroundAgentCompany[]
  },
): BackgroundAgentRecord {
  const rec: BackgroundAgentRecord = {
    id: makeBackgroundAgentId(),
    createdAt: new Date().toISOString(),
    assignment: assignment.trim(),
    schedule: schedule.trim(),
  }
  if (extra?.taskTitle?.trim()) rec.taskTitle = extra.taskTitle.trim()
  if (extra?.taskDetail?.trim()) rec.taskDetail = extra.taskDetail.trim()
  if (extra?.deliverable?.trim()) rec.deliverable = extra.deliverable.trim()
  if (extra?.companies && extra.companies.length > 0) rec.companies = extra.companies
  const all = readBackgroundAgents()
  saveBackgroundAgents([rec, ...all])
  return rec
}

/** Removes one agent from localStorage and returns the updated list. */
export function deleteBackgroundAgent(id: string): BackgroundAgentRecord[] {
  const next = readBackgroundAgents().filter((a) => a.id !== id)
  saveBackgroundAgents(next)
  return next
}

/** Card / notification title from stored fields (same logic as the Background agents list). */
export function backgroundAgentDisplayName(
  rec: Pick<BackgroundAgentRecord, 'taskTitle' | 'assignment'>,
): string {
  const t = rec.taskTitle?.trim()
  if (t) return t
  return rec.assignment.split(/[.!?]/)[0]?.trim() || 'Background Agent'
}

export type BackgroundAgentFlowState =
  | { kind: 'idle' }
  | {
      kind: 'collecting'
      needWhat: boolean
      needWhen: boolean
      partialWhat: string
      partialWhen: string
    }
