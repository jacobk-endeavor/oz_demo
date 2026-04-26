/**
 * Maps the five prospect Q&A answers (visit Q&A in `RunProspectNotes`) onto
 * Job Cost Estimate Recap fields so the editable Excel sheet shows up
 * pre-filled with whatever the rep has already dictated. Anything left blank
 * falls back to the Kenny Hills demo defaults baked into the schema.
 */

const COMPACT = (s: string) => s.replace(/\s+/g, ' ').trim()

function customerNameFromAnswer(raw: string): string | null {
  const txt = COMPACT(raw)
  if (!txt) return null
  const m = txt.match(/^([^,.;\n:—-]+)/)
  return m && m[1] ? m[1].trim() : txt.slice(0, 80)
}

function buildJobDescription(answers: Record<number, string>): string | null {
  const lines = COMPACT(answers[3] ?? '')
  const ship = COMPACT(answers[4] ?? '')
  const insights = COMPACT(answers[2] ?? '')
  const competitors = COMPACT(answers[1] ?? '')
  const blocks: string[] = []
  if (lines) blocks.push(`Line items / SKUs: ${lines}`)
  if (ship) blocks.push(`Ship-to: ${ship}`)
  if (insights) blocks.push(`Call insights: ${insights}`)
  if (competitors) blocks.push(`Competitors / other quotes: ${competitors}`)
  return blocks.length > 0 ? blocks.join('\n') : null
}

export function jcrOverridesFromProspectAnswers(
  answers: Record<number, string>,
): Partial<Record<string, string | number>> {
  const overrides: Partial<Record<string, string | number>> = {}
  const customer = customerNameFromAnswer(answers[0] ?? '')
  if (customer) overrides.customer_name = customer
  const desc = buildJobDescription(answers)
  if (desc) overrides.job_description = desc
  return overrides
}
