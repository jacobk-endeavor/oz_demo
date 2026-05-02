/**
 * Track C §6 — citation quality / answer integrity for Oz chat answers.
 * Spec: docs/wiki-kb/track-c-chat-integration.md §6 (numeric claims + quote mode).
 */
import { extractCitations } from './citationGrammarResolver'

export type OzAnswerValidationReport = {
  ok: boolean
  /** Sentences that contain suspicious numerics but no citation token. */
  nakedNumericSentences: string[]
  /** Verbatim spans in ASCII double quotes missing a nearby citation. */
  uncitedQuoteSpans: string[]
}

const CITATION_HEAD = /(?:\[\[(?:wiki:)|\[(?:doc|call|image|catalog|recs):)/

/** Money, percents, comma-separated magnitudes, decimals (not dotted versions), large ints; units; exclude lone catalog years. */
function sentenceHasSuspiciousNumeric(sentence: string): boolean {
  const t = sentence.trim()
  if (!t) return false
  if (/\$\s*[\d,]+(?:\.\d+)?\b/.test(t)) return true
  if (/\d+(?:\.\d+)?\s*%/.test(t)) return true
  if (/\b\d{1,3}(?:,\d{3})+\b/.test(t)) return true
  if (/\b\d+\.\d+\.\d+\b/.test(t)) return false
  if (/\b\d+\.\d+\b/.test(t)) return true
  if (/\b(?:19|20)\d{2}\b/.test(t)) return false
  if (/\b\d{4,}\b/.test(t)) return true
  if (/\b\d+\s*(?:mm|ft|in(?:ch|ches)?|mil|lbs?|psi|°[CF]?)\b/i.test(t)) return true
  return false
}

function sentenceHasCitation(sentence: string): boolean {
  return extractCitations(sentence).length > 0
}

function splitSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n')
  const chunks: string[] = []
  for (const para of normalized.split(/\n\s*\n/)) {
    const lines = para.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const subs = trimmed.split(/(?<=[.!?])\s+(?=[A-Z\d"[(])/)
      for (const s of subs) {
        const u = s.trim()
        if (u) chunks.push(u)
      }
    }
  }
  return chunks.length > 0 ? chunks : [normalized.trim()].filter(Boolean)
}

function findUncitedQuoteSpans(text: string): string[] {
  const bad: string[] = []
  const re = /"([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const full = m[0]
    const inner = m[1] ?? ''
    if (inner.length === 0) continue
    const after = text.slice(m.index + full.length, m.index + full.length + 160)
    if (!CITATION_HEAD.test(after.trimStart())) {
      bad.push(inner.length > 80 ? `${inner.slice(0, 77)}…` : inner)
    }
  }
  return bad
}

export function validateOzAnswer(text: string): OzAnswerValidationReport {
  const seen = new Set<string>()
  const nakedNumericSentences: string[] = []
  for (const sentence of splitSentences(text)) {
    if (!sentenceHasSuspiciousNumeric(sentence)) continue
    if (sentenceHasCitation(sentence)) continue
    const clipped = sentence.length > 200 ? `${sentence.slice(0, 197)}…` : sentence
    if (seen.has(clipped)) continue
    seen.add(clipped)
    nakedNumericSentences.push(clipped)
  }
  const uncitedQuoteSpans = findUncitedQuoteSpans(text)
  const ok = nakedNumericSentences.length === 0 && uncitedQuoteSpans.length === 0
  return { ok, nakedNumericSentences, uncitedQuoteSpans }
}

export function formatValidationIssues(report: OzAnswerValidationReport): string {
  const lines: string[] = []
  if (report.nakedNumericSentences.length) {
    lines.push('Numeric claims without a structured citation ([doc:…], [catalog:…], [[wiki:…]], etc.):')
    for (const s of report.nakedNumericSentences) {
      lines.push(`- ${s}`)
    }
  }
  if (report.uncitedQuoteSpans.length) {
    lines.push('Double-quoted verbatim spans without an immediate citation after the closing quote:')
    for (const q of report.uncitedQuoteSpans) {
      lines.push(`- "${q}"`)
    }
  }
  return lines.join('\n')
}

const AMENDMENT_PREFIX =
  'Your previous assistant reply failed citation integrity checks. Rewrite the COMPLETE answer to comply:\n\n' +
  '1. Every sentence that states a numeric fact (money, percentages, measurements, large counts ≥10000, comma-separated magnitudes, decimals other than dotted version numbers) must include at least one valid citation token in that sentence: [doc:…], [call:…], [image:…], [catalog:…], [recs:…], or [[wiki:…]].\n\n' +
  '2. Every ASCII double-quoted verbatim span must have one of those citation tokens immediately after the closing quote (punctuation and whitespace allowed before the citation).\n\n' +
  'Do not introduce new factual claims. Preserve correct citations from the prior reply.\n\n' +
  'Issues detected:\n'

/** User message body for a single amendment attempt (agentic completion without tools). */
export function buildAnswerAmendmentUserMessage(report: OzAnswerValidationReport): string {
  const issues = formatValidationIssues(report).trim()
  const tail = issues.length > 0 ? issues : '(enforce citation rules on every numeric and quoted span in the prior reply.)'
  return `${AMENDMENT_PREFIX}${tail}`
}

function stripUncitedAsciiQuotes(text: string): string {
  return text.replace(/"([^"]*)"/g, (full, _inner: string, offset: number, whole: string) => {
    const tail = whole.slice(offset + full.length, offset + full.length + 160).trimStart()
    return CITATION_HEAD.test(tail) ? full : ''
  })
}

function stripUncitedNumericSentences(text: string): string {
  const kept: string[] = []
  for (const sentence of splitSentences(text)) {
    if (sentenceHasSuspiciousNumeric(sentence) && !sentenceHasCitation(sentence)) continue
    kept.push(sentence)
  }
  return kept.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Last-resort repair: drop uncited numeric sentences and remove failing quoted spans.
 * Spec: after retry failure, hedge/remove — we remove factual sentences that lack citations.
 */
export function sanitizeOzAnswer(text: string, _report: OzAnswerValidationReport): string {
  let out = stripUncitedAsciiQuotes(text)
  out = stripUncitedNumericSentences(out)
  out = out.replace(/\s{2,}/g, ' ').trim()

  if (!out) {
    return 'Answer withheld: citation policy could not be satisfied for numeric or quoted claims in this reply.'
  }
  return out
}
