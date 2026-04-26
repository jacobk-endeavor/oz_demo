import type { TableRowContextAttachment } from '../../shared/tableRowContext'
import type { DistributorRow } from './milwaukeeDistributorsMock'
import { formatCompactUsd } from './leadSpendProfiles'

export function makeLeadTableAttachment(
  row: DistributorRow,
  displayIndex: number,
): TableRowContextAttachment {
  const rowId = row.linkedInUrl
  const p = row.spendProfile
  const spendBit = p
    ? ` · LTM (synthetic) ${formatCompactUsd(p.ltmSpendUsd)} YoY ${
        p.yoyChangePct >= 0 ? `+${p.yoyChangePct.toFixed(1)}` : p.yoyChangePct.toFixed(1)
      }%`
    : ''
  return {
    key: `lead:${rowId}`,
    scope: 'lead',
    rowId,
    displayIndex,
    label: `<Row ${displayIndex}>`,
    modelLine: `(lead row id: \`${rowId}\`): **${row.name}** — ${row.primaryIndustry} · ${row.location}${spendBit}`,
  }
}
