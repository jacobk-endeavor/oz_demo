import type { InteractionRecord, LocationTag, OzInsight, QueryId, RankedInsightItem } from './types'

function countBy(records: InteractionRecord[], getValue: (record: InteractionRecord) => string) {
  const counts = new Map<string, number>()

  records.forEach((record) => {
    const value = getValue(record).trim()
    if (!value) return
    counts.set(value, (counts.get(value) ?? 0) + 1)
  })

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map<RankedInsightItem>(([name, mentions], index) => ({
      name,
      mentions,
      trend: index < 3 ? `+${32 - index * 5}%` : `+${14 - index}%`,
    }))
}

function uniqueLocations(records: InteractionRecord[]) {
  return [...new Set(records.map((record) => record.locationTag))] as LocationTag[]
}

function recordsForQuery(queryId: QueryId, records: InteractionRecord[]) {
  if (queryId === 'pricing_objections') {
    return records.filter(
      (record) => record.tags.includes(queryId) && record.medium === 'call_center',
    )
  }

  return records.filter((record) => record.tags.includes(queryId))
}

function rankedItemsFor(queryId: QueryId, records: InteractionRecord[]) {
  if (queryId === 'complaints') return countBy(records, (record) => record.complaint)
  if (queryId === 'competitors') return countBy(records, (record) => record.competitorMentioned)
  if (queryId === 'lost_deals') return countBy(records, (record) => record.competitorMentioned)
  if (queryId === 'upsell_candidates') return countBy(records, (record) => record.productRequested)
  return countBy(records, (record) => record.productRequested).slice(0, 10)
}

const answerCopy: Record<QueryId, string> = {
  top_products:
    'Composite decking, exterior trim, and moisture barrier work are the strongest recurring product signals in the interaction set.',
  complaints:
    'The most common complaints cluster around delivery clarity, backorder reporting, and quote speed.',
  competitors:
    'TimberTech, Trex, AZEK, Boral, and James Hardie are showing up as active alternatives across calls, notes, and emails.',
  lost_deals:
    'Recent lost-deal evidence points to competitor pressure paired with delivery timing and pricing uncertainty.',
  pricing_objections:
    'Pricing objections are concentrated in phone call records, where customers are asking reps to justify bundles against named competitors.',
  upsell_candidates:
    'Several accounts are already buying the core product but show clear attach opportunities for fasteners, delivery, lighting, and sealant.',
}

const actionCopy: Record<QueryId, string> = {
  top_products: 'Generate a demand dashboard and prep bundle quote templates for the top requested categories.',
  complaints: 'Route the complaint summary to sales ops and create a weekly exception report for reps.',
  competitors: 'Build a competitor-risk lead list and arm reps with pricing and delivery comparison notes.',
  lost_deals: 'Create a win-back call list and pair each account with a revised quote or service commitment.',
  pricing_objections: 'Send reps a pricing objection talk track and flag high-confidence calls for quote review.',
  upsell_candidates: 'Create add-on quote drafts for the highlighted accounts before the next site visit.',
}

export function buildOzInsight(queryId: QueryId, records: InteractionRecord[]): OzInsight {
  const sourceRecords = recordsForQuery(queryId, records)

  return {
    id: queryId,
    answer: answerCopy[queryId],
    rankedItems: rankedItemsFor(queryId, sourceRecords),
    sourceRecordIds: sourceRecords.map((record) => record.id),
    highlightedLocationTags: uniqueLocations(sourceRecords),
    recommendedAction: actionCopy[queryId],
  }
}
