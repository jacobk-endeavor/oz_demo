export type InteractionMedium = 'note' | 'call_center' | 'email'

export type LocationTag = 'zoom' | 'phone_call' | 'in_person'

export type InteractionType =
  | 'Product demand'
  | 'Complaint'
  | 'Competitor risk'
  | 'Lost deal'
  | 'Upsell signal'

export type QueryId =
  | 'top_products'
  | 'complaints'
  | 'competitors'
  | 'lost_deals'
  | 'pricing_objections'
  | 'upsell_candidates'

export interface InteractionRecord {
  id: string
  company: string
  representative: string
  date: string
  medium: InteractionMedium
  locationTag: LocationTag
  interactionType: InteractionType
  topic: string
  complaint: string
  productRequested: string
  competitorMentioned: string
  confidence: number
  transcriptExcerpt: string
  suggestedAction: string
  tags: QueryId[]
}

export interface QueryButton {
  id: QueryId
  label: string
  naturalLanguage: string
}

export interface RankedInsightItem {
  name: string
  mentions: number
  trend: string
}

export interface OzInsight {
  id: QueryId
  answer: string
  rankedItems: RankedInsightItem[]
  sourceRecordIds: string[]
  highlightedLocationTags: LocationTag[]
  recommendedAction: string
}
