import type { TableRowContextAttachment } from '../../shared/tableRowContext'
import type { LumberyardCallRow } from './lumberyardTypes'

export function displayCustomerName(row: LumberyardCallRow): string {
  if (row.customerName?.trim()) return row.customerName.trim()
  const n = row.customerPersona.split(/\s*[—–]\s*/)[0]?.trim()
  return n || row.customerPersona.trim() || 'Customer'
}

export function makeLumberyardAttachment(
  row: LumberyardCallRow,
  displayIndex: number,
): TableRowContextAttachment {
  const who = displayCustomerName(row)
  return {
    key: `lumberyard:${row.id}`,
    scope: 'lumberyard',
    rowId: row.id,
    displayIndex,
    label: `<Row ${displayIndex}>`,
    modelLine: `(activity id: \`${row.id}\`): **${who}** — ${row.title}`,
  }
}
