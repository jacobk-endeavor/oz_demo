import type {
  InteractionMedium,
  InteractionRecord,
  InteractionType,
  LocationTag,
  QueryButton,
  QueryId,
} from './types'

const companies = [
  'Russin Lumber',
  'North Ridge Builders',
  'Hudson Valley Supply',
  'Beacon Yard Supply',
  'Pine State Contractors',
  'Metro Frame & Finish',
  'Summit Exterior Pros',
  'Blue Line Renovation',
  'CedarWorks Collective',
  'Forge Street Builders',
  'Riverbend Lumber',
  'Westlake Design Build',
  'Iron Hill Supply',
  'Old Mill Construction',
  'Keystone Roofing',
  'BrightPath Builders',
  'Harbor Point Supply',
  'Maple Ridge Homes',
  'Atlas Commercial Build',
  'Crown Valley Exteriors',
] as const

const representatives = ['Sami', 'Ava', 'Mia', 'Noah', 'Lena', 'Eli', 'Jordan', 'Priya'] as const

const products = [
  'Composite decking bundle',
  'Hidden fastener system',
  'Exterior trim',
  'PVC railing kit',
  'Moisture barrier wrap',
  'Fiber cement siding',
  'Jobsite delivery package',
  'Deck lighting package',
  'Premium cedar boards',
  'Weatherproof sealant',
] as const

const complaints = [
  'Lead times are unclear',
  'Needs cleaner reporting on backorders',
  'Pricing objection',
  'Missing spec sheets',
  'Delivery window slipped',
  'Quote turnaround is slow',
  'Warranty details are confusing',
  'Inventory visibility is weak',
] as const

const competitors = ['TimberTech', 'Boral', 'Trex', 'James Hardie', 'AZEK'] as const

const mediums: InteractionMedium[] = ['call_center', 'note', 'email']
const locationTags: LocationTag[] = ['phone_call', 'in_person', 'zoom']

const interactionTypes: InteractionType[] = [
  'Product demand',
  'Complaint',
  'Competitor risk',
  'Lost deal',
  'Upsell signal',
]

const topicTemplates = [
  'Composite decking availability',
  'Fastener upsell',
  'Quarterly buying plan',
  'Railing package comparison',
  'Backorder review',
  'Siding conversion',
  'Delivery coordination',
  'Pricing objection follow-up',
  'Cedar board substitution',
  'Sealant reorder planning',
] as const

function formatDate(index: number) {
  const day = String((index % 28) + 1).padStart(2, '0')
  return `2026-04-${day}`
}

function tagsFor(index: number, complaint: string, competitorMentioned: string): QueryId[] {
  const tags: QueryId[] = ['top_products']

  if (complaint) tags.push('complaints')
  if (competitorMentioned) tags.push('competitors')
  if (complaint === 'Pricing objection' || index % 11 === 0) tags.push('pricing_objections')
  if ([8, 17, 26, 35, 44, 53].includes(index)) tags.push('lost_deals')
  if (index % 5 === 1 || index % 9 === 0) tags.push('upsell_candidates')

  return tags
}

export const queryButtons: QueryButton[] = [
  {
    id: 'top_products',
    label: 'Top 10 requested products',
    naturalLanguage: 'Tell me about the ten products people have been requesting.',
  },
  {
    id: 'complaints',
    label: 'Customer complaints',
    naturalLanguage: 'Query customer complaints.',
  },
  {
    id: 'competitors',
    label: 'Competitor mentions',
    naturalLanguage: 'Which competitors are selling these products?',
  },
  {
    id: 'lost_deals',
    label: 'Lost deals in recent months',
    naturalLanguage: 'Have we lost to those competitors in the last several months?',
  },
  {
    id: 'pricing_objections',
    label: 'Calls with pricing objections',
    naturalLanguage: 'Show mining from phone calls for pricing objections.',
  },
  {
    id: 'upsell_candidates',
    label: 'Upsell candidates',
    naturalLanguage: 'Find accounts where reps can attach an add-on product.',
  },
]

export const callMiningInteractions: InteractionRecord[] = Array.from({ length: 60 }, (_, index) => {
  const productRequested = products[index % products.length]
  const complaint = index % 4 === 1 ? '' : complaints[index % complaints.length]
  const competitorMentioned = index % 3 === 1 ? '' : competitors[index % competitors.length]
  const medium = mediums[index % mediums.length]
  const locationTag = locationTags[(index + Math.floor(index / 3)) % locationTags.length]
  const interactionType = interactionTypes[index % interactionTypes.length]
  const company = companies[index % companies.length]
  const representative = representatives[(index + 2) % representatives.length]
  const confidence = 0.78 + (index % 18) / 100
  const tags = tagsFor(index, complaint, competitorMentioned)

  return {
    id: `int_${String(index + 1).padStart(3, '0')}`,
    company,
    representative,
    date: formatDate(index),
    medium,
    locationTag,
    interactionType,
    topic: topicTemplates[index % topicTemplates.length],
    complaint,
    productRequested,
    competitorMentioned,
    confidence,
    transcriptExcerpt: `${company} discussed ${productRequested.toLowerCase()} with ${representative}. ${
      competitorMentioned
        ? `${competitorMentioned} was named as an active comparison.`
        : 'No competitor was named in this record.'
    } ${complaint || 'The note reads as a clean demand signal.'}`,
    suggestedAction:
      tags.includes('lost_deals')
        ? `Escalate ${company} for a win-back quote on ${productRequested}.`
        : tags.includes('upsell_candidates')
          ? `Bundle ${productRequested} with the next rep follow-up.`
          : `Prepare a focused follow-up on ${productRequested}.`,
    tags,
  }
})
