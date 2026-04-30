import { formatSpendForLlmRow } from './leadSpendProfiles'
import type { DistributorRow } from './milwaukeeDistributorsMock'
import {
  sourceLabelForChat,
  describeTableState,
  type LeadTableViewState,
} from './leadGenTableModel'

const DEFAULT_MAX_ROWS = 48
const DEFAULT_MAX_CHARS = 14_000

function escapeCell(s: string, maxLen: number): string {
  const oneLine = s.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (oneLine.length <= maxLen) return oneLine
  return `${oneLine.slice(0, maxLen - 1)}…`
}

function buildSpendSection(rows: DistributorRow[]): string {
  const spendAppend = rows
    .map((r, i) => {
      const p = r.spendProfile
      if (!p) return null
      return formatSpendForLlmRow(i + 1, r.name, p)
    })
    .filter((x): x is string => x != null)
  if (spendAppend.length === 0) return ''
  return `\n\n### Synthetic B2B spend (demo; USD; some accounts only)\nUse this block for **spend, LTM, YoY, and history** questions. Row numbers refer to the **current TSV above** (same sort as the grid).\n\n${spendAppend.join('\n\n')}\n`
}

/**
 * Packs the current list state + a TSV snapshot of the visible rows for OpenAI in Ask Oz.
 * Capped by row count and total characters; answers should cite by **row #** from the TSV.
 */
export function buildLeadTableLlmContext(
  state: LeadTableViewState,
  displayRows: DistributorRow[],
  options?: { maxRows?: number; maxChars?: number },
): string {
  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS
  const stateLine = describeTableState(state)
  const n = displayRows.length
  const take = displayRows.slice(0, maxRows)
  const header = [
    '#',
    'name',
    'source',
    'industry',
    'size',
    'type',
    'location',
    'country',
    'engagement',
    'description',
    'products_requested',
  ].join('\t')
  const lines = take.map((r, i) =>
    [
      String(i + 1),
      escapeCell(r.name, 64),
      escapeCell(sourceLabelForChat(r.sourceId), 20),
      escapeCell(r.primaryIndustry, 40),
      escapeCell(r.size, 20),
      escapeCell(r.type, 20),
      escapeCell(r.location, 32),
      escapeCell(r.country, 16),
      r.engagement,
      escapeCell(r.description, 100),
      escapeCell(r.productsRequested ?? '', 120),
    ].join('\t'),
  )
  const body = [header, ...lines].join('\n')
  const truncated = n > maxRows
  const note = truncated
    ? `\n_Note: table shows **${n}** rows; only the first **${maxRows}** (after current sort) are included — infer totals from these unless the user asked to expand the set._\n`
    : ''
  const spendSection = buildSpendSection(take)

  const block = `### Distributor lead list (authoritative; answer Q&A with this; cite __row #__ from the TSV)
**List state / sort:** ${stateLine}
**Row count in view:** ${n}

\`\`\`tsv
${body}
\`\`\`
${note}When the user asks to **sort** or **sub-sort**, the app’s command handler may have already changed the list — if so, the **list state** line above and the TSV are already updated for this turn. For natural-language questions, **use the TSV and state**; do not invent new rows.${spendSection}`

  if (block.length <= maxChars) return block
  for (let k = take.length; k > 3; k--) {
    const bodyShort = [header, ...lines.slice(0, k - 1)].join('\n')
    const sBlock = `### Distributor lead list (authoritative; cite **row #**)
**List state / sort:** ${stateLine}
**Row count in view:** ${n}

\`\`\`tsv
${bodyShort}
\`\`\`
_Table trimmed to stay under the token cap; **${n}** rows in the grid._${buildSpendSection(take.slice(0, k - 1))}`
    if (sBlock.length <= maxChars) return sBlock
  }
  return `### Lead list
**List state / sort:** ${stateLine}
**Row count in view:** ${n}
_The row snapshot was too large; ask the user to **filter** (e.g. by source) or **sort** a column to reduce the visible set, then re-ask._`
}
