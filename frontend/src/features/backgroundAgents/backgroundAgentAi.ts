import { fetchOpenAiJsonObject } from '../../services/ozOpenAi'
import type { OzOpenAiMessage } from '../../services/ozOpenAi'

export type BackgroundAgentEnriched = {
  /** One-line, Title Case, for the card header */
  taskTitle: string
  /** 2–4 sentences describing scope, inputs, and how the run behaves */
  taskDetail: string
  /** One sentence: concrete output the user receives */
  deliverable: string
  /** Polished schedule, e.g. "Every Monday, 9:00 AM" */
  scheduleDisplay: string
  /** Kept in sync for storage: primary task string */
  assignment: string
  /** Kept in sync for storage: schedule string */
  schedule: string
  companies: { name: string; domain: string }[]
}

export type EvaluateBackgroundAgentResult =
  | { sufficient: true; enriched: BackgroundAgentEnriched }
  | { sufficient: false; questions: string[] }

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function parseCompanies(raw: unknown): { name: string; domain: string }[] {
  if (!Array.isArray(raw)) return []
  const out: { name: string; domain: string }[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    let domain = typeof item.domain === 'string' ? item.domain.trim() : ''
    domain = domain.replace(/^https?:\/\//i, '').split('/')[0] ?? domain
    if (name && domain) out.push({ name, domain })
  }
  return out.slice(0, 6)
}

/**
 * Public logo URL: Google favicon service (no API key; works in demo for known domains).
 */
export function companyLogoUrl(domain: string): string {
  const d = domain.replace(/^https?:\/\//i, '').split('/')[0] ?? domain
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`
}

/**
 * Uses the chat model to decide if the user gave enough to configure a background agent
 * and to produce enriched card copy + relevant companies (by domain for logos).
 */
export async function evaluateBackgroundAgentWithLlm(args: {
  lastUserMessage: string
  heuristicWhat: string
  heuristicWhen: string
  /** Short transcript for context, user lines only is fine */
  recentContext: string
}): Promise<EvaluateBackgroundAgentResult> {
  const system: OzOpenAiMessage = {
    role: 'system',
    content: `You evaluate whether a user has given **enough information** to configure a "background agent" in a sales-ops product demo: a **scheduled, repeatable task** with a clear **deliverable** (what they get) and a **run cadence** (when).

**Demo world (always assume this; do not contradict it in your copy or questions):**
- The org is already connected to the relevant CRM, sales data, email, and in-app notifications in this product. The user is not missing access, API keys, or "an automation tool" — Oz runs the job on the integrated stack.
- Do **not** tell the user to use Zapier, Integromat, custom scripts, "your IT team," or to "reach out to a developer" unless they literally asked for external tooling. Do not pad answers with checklists for data readiness, "identify your metrics" as a prerequisite, or generic project-management steps. If the ask is clear enough to schedule (e.g. "weekly email with top salesperson by revenue"), that is **sufficient** with sensible demo defaults.
- **taskDetail** and **deliverable** should describe what **this agent will do each run in the product** (who gets what, and what is ranked or summarized), not a how-to for standing up systems from zero.

Rules:
- **Sufficient** only if both (1) the work is specific enough to describe an agent run, and (2) when it runs is clear (e.g. daily, every Tuesday 8am, first Monday of month). Timezone can be default if not stated. Prefer "best salesperson" = top by revenue in CRM unless the user specified another metric; you may use one short clarifying question only if the intent is truly ambiguous.
- If something critical is missing, set sufficient to false and return **1–3 short, direct questions** (one sentence each) that clarify **the product behavior or schedule** — not connectivity, not generic setup advice. Do not repeat the whole spec.
- When sufficient, write in **clear English** with **Title Case** for the task title and **proper capitalization** for product and company names in descriptions.
- **companies** (integration connections for the card): 2–5 entries when the agent touches data + output; include the obvious stack. For sales/CRM + ranked report + email, include **Salesforce** (domain salesforce.com), **Excel** for the workbook or export (domain office.com), and **Outlook** for delivery (domain outlook.com) unless the user specified Gmail/Slack etc. Use real, plausible **domain** values (hubspot.com, google.com, slack.com, etc.). If none are relevant, use [].
- **assignment** and **schedule** should be compact strings suitable for a list (assignment = what it does; schedule = when).

Return **only** a JSON object with this shape (no markdown):
{
  "sufficient": boolean,
  "questions": string[],
  "taskTitle": string,
  "taskDetail": string,
  "deliverable": string,
  "scheduleDisplay": string,
  "assignment": string,
  "schedule": string,
  "companies": { "name": string, "domain": string }[]
}

If sufficient is false, set questions to a non-empty array and leave other string fields as empty string and companies as []. If sufficient is true, set questions to [].`,
  }

  const user: OzOpenAiMessage = {
    role: 'user',
    content: `## Latest user message
${args.lastUserMessage}

## Heuristic parse (best-effort, may be incomplete)
- Task / what: ${args.heuristicWhat || '(none)'}
- Schedule / when: ${args.heuristicWhen || '(none)'}

## Recent chat context
${args.recentContext || '(none)'}
`,
  }

  const raw = await fetchOpenAiJsonObject([system, user], { maxTokens: 1_200, temperature: 0.2 })
  if (!isRecord(raw)) {
    return { sufficient: false, questions: ['What exactly should the agent do each time, and when should it run?'] }
  }

  const sufficient = raw.sufficient === true
  const questions = Array.isArray(raw.questions)
    ? (raw.questions as unknown[]).filter((q): q is string => typeof q === 'string' && q.trim().length > 0).map((q) => q.trim())
    : []

  if (!sufficient) {
    const qs = questions.length > 0 ? questions : ['What should the agent produce or check each run, and on what schedule?']
    return { sufficient: false, questions: qs.slice(0, 3) }
  }

  const taskTitle = typeof raw.taskTitle === 'string' ? raw.taskTitle.trim() : ''
  const taskDetail = typeof raw.taskDetail === 'string' ? raw.taskDetail.trim() : ''
  const deliverable = typeof raw.deliverable === 'string' ? raw.deliverable.trim() : ''
  const scheduleDisplay = typeof raw.scheduleDisplay === 'string' ? raw.scheduleDisplay.trim() : ''
  let assignment = typeof raw.assignment === 'string' ? raw.assignment.trim() : ''
  let schedule = typeof raw.schedule === 'string' ? raw.schedule.trim() : ''

  if (!taskDetail || !scheduleDisplay) {
    return { sufficient: false, questions: ['What is the main deliverable each time, and what day and time should it run?'] }
  }

  if (!assignment) assignment = taskDetail
  if (!schedule) schedule = scheduleDisplay

  const companies = parseCompanies(raw.companies)

  return {
    sufficient: true,
    enriched: {
      taskTitle: taskTitle || assignment.slice(0, 80),
      taskDetail,
      deliverable: deliverable || `Run completes with the described output on schedule: ${scheduleDisplay}.`,
      scheduleDisplay,
      assignment,
      schedule,
      companies,
    },
  }
}
