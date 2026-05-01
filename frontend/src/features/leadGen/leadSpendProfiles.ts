/**
 * Synthetic B2B spend + monthly history (USD) for demo Q&A.
 * Matched to the first five entries in `CUSTOMER_CALLS_COMPANY_SEED` by LinkedIn company URL.
 */
export type LeadSpendHistoryMonth = {
  month: string
  amountUsd: number
  /** What drove the month in this toy model. */
  mix: string
}

export type LeadSpendProfile = {
  /** Trailing 12 months sum (synthetic). */
  ltmSpendUsd: number
  /** Year-over-year change vs prior LTM window, percent. */
  yoyChangePct: number
  months: LeadSpendHistoryMonth[]
  /** One line for tooltips / small UI. */
  summaryLine: string
}

function buildMonths(
  seed: number,
  base: number,
  wobble: number,
): LeadSpendHistoryMonth[] {
  const labels = [
    '2025-05',
    '2025-06',
    '2025-07',
    '2025-08',
    '2025-09',
    '2025-10',
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
  ]
  return labels.map((month, i) => {
    const t = (i - 6) / 5
    const wave = 1 + 0.06 * Math.sin(seed + t * 2.1) + (detRand(seed * 3 + i) - 0.5) * wobble
    const amountUsd = Math.round(base * wave / 1e3) * 1e3
    const mix =
      i % 4 === 0
        ? 'lumber & panels'
        : i % 4 === 1
          ? 'fasteners + consumables'
          : i % 4 === 2
            ? 'power tools & service parts'
            : 'mixed + delivery'
    return { month, amountUsd, mix }
  })
}

function detRand(seed: number) {
  const x = Math.sin(seed * 12.9898) * 10000
  return x - Math.floor(x)
}

const HUDSON_VALLEY_DECK: LeadSpendProfile = (() => {
  const months = buildMonths(1, 128_000, 0.16).map((m, i) => ({
    ...m,
    mix:
      ['exterior board & cap stock', 'rail + fasteners', 'rainscreen + WRB', 'jobsite consumables', 'milling / special order'][
        i % 5
      ]!,
  }))
  const ltm = months.reduce((s, m) => s + m.amountUsd, 0)
  return {
    ltmSpendUsd: ltm,
    yoyChangePct: 14.6,
    months,
    summaryLine:
      'High-end resi exteriors: Thermory / AZEK / Millboard and Deckorators rails; pull through Russin; spring deck season + siding.',
  }
})()

const NORTH_RIVER_LUMBER: LeadSpendProfile = (() => {
  const months = buildMonths(2, 1_220_000, 0.09).map((m, i) => ({
    ...m,
    mix: ['dealer stock + job packs', 'flatbed to yard', 'special order exteriors', 'trim + treat'][i % 4]!,
  }))
  const ltm = months.reduce((s, m) => s + m.amountUsd, 0)
  return {
    ltmSpendUsd: ltm,
    yoyChangePct: 7.4,
    months,
    summaryLine:
      'Dealer / pro desk: OSB, framing, and Russin-fulfilled specialty (composite, prefinish); contractor delivery heavy.',
  }
})()

const SENSIENT: LeadSpendProfile = (() => {
  const months = buildMonths(2, 95_000, 0.11).map((m, i) => ({
    ...m,
    mix: ['flavor & color', 'oils & extracts', 'packaging MRO', 'lab supplies'][i % 4]!,
  }))
  const ltm = months.reduce((s, m) => s + m.amountUsd, 0)
  return {
    ltmSpendUsd: ltm,
    yoyChangePct: 4.8,
    months,
    summaryLine: 'F&B mfg: ingredients, packaging, and MRO; steadier than construction.',
  }
})()

const AOS_MAIN: LeadSpendProfile = (() => {
  const months = buildMonths(3, 280_000, 0.1)
  const ltm = months.reduce((s, m) => s + m.amountUsd, 0)
  return {
    ltmSpendUsd: ltm,
    yoyChangePct: 6.1,
    months,
    summaryLine: 'Global water products: resi/commercial; Mexico & US plant pull-through on heaters.',
  }
})()

const AOS_DUP: LeadSpendProfile = (() => {
  const months = buildMonths(4, 210_000, 0.12)
  const ltm = months.reduce((s, m) => s + m.amountUsd, 0)
  return {
    ltmSpendUsd: ltm,
    yoyChangePct: 5.2,
    months: months.map((m, i) => ({
      ...m,
      mix: i % 3 === 0 ? 'tank + boiler MRO' : 'copper/steel fittings',
    })),
    summaryLine: 'Duplicate org chart line: overlapping NA facilities; de-dup in CRM; spend net of interco.',
  }
})()

const BY_URL: Record<string, LeadSpendProfile> = {
  'https://www.linkedin.com/company/hudson-valley-deck-porch': HUDSON_VALLEY_DECK,
  'https://www.linkedin.com/company/north-river-lumber-building-supply': NORTH_RIVER_LUMBER,
  'https://www.linkedin.com/company/sensient': SENSIENT,
  'https://www.linkedin.com/company/a-o-smith-corporation': AOS_MAIN,
  'https://www.linkedin.com/company/a.-o.-smith-corporation': AOS_DUP,
}

export function getSpendProfileForCompanyUrl(
  linkedInUrl: string,
): LeadSpendProfile | undefined {
  return BY_URL[linkedInUrl]
}

export function formatCompactUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

export function formatSpendForLlmRow(rowIndex1: number, name: string, p: LeadSpendProfile): string {
  const yoy = p.yoyChangePct >= 0 ? `+${p.yoyChangePct.toFixed(1)}%` : `${p.yoyChangePct.toFixed(1)}%`
  const monthsLine = p.months
    .map((m) => `${m.month}: $${(m.amountUsd / 1_000).toFixed(0)}k (${m.mix})`)
    .join('; ')
  return `**Row ${rowIndex1} — ${name}** · LTM est. **$${(p.ltmSpendUsd / 1).toLocaleString('en-US')}** · YoY **${yoy}**\n` +
    `${p.summaryLine}\n` +
    `Monthly (synthetic USD): ${monthsLine}`
}
