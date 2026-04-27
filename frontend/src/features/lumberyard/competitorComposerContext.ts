import type { TableRowContextAttachment } from '../../shared/tableRowContext'
import type { CompetitorOfferRow } from './competitorOffersTypes'

export function makeCompetitorOfferAttachment(
  row: CompetitorOfferRow,
  displayIndex: number,
): TableRowContextAttachment {
  return {
    key: `competitor:${row.id}`,
    scope: 'competitor',
    rowId: row.id,
    displayIndex,
    label: `<Row ${displayIndex}>`,
    modelLine: `(competitor listing id: \`${row.id}\`): **${row.competitor}** — ${row.product} @ ${row.price} ${row.priceUnit} · ${row.productPageUrl}`,
  }
}
