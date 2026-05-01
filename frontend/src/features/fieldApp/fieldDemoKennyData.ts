/**
 * Shared demo data for the Kenny Hills field story (table + context for screen + LLM + TTS).
 */

import { DEMO_REP_FIRST_NAME } from '../../config/demoRep'

export const KENNY_HILLS_ACCOUNT = 'Kenny Hills Custom Contracting'
export const KENNY_HILLS_BRANCH = 'Regional metro · contractor · Pro deck focus'

/** One-line snapshot for headers and models. */
export const KENNY_ACCOUNT_SNAPSHOT =
  'Four recorded orders in the last six months; newest is November deck resurfacing on AZEK Vintage Mahogany; recurring theme is hidden fasteners and clean face detail.'

export const KENNY_SALES_ROWS: readonly {
  date: string
  product: string
  qty: string
  lineNote: string
  estValue: string
}[] = [
  {
    date: '2025-11-18',
    product: 'TimberTech AZEK Vintage capped composite (Mahogany)',
    qty: '420 sq ft deck field',
    lineNote: 'Pool deck resurfacing; customer asked for low maint.',
    estValue: '~$18.2k',
  },
  {
    date: '2025-10-04',
    product: 'Westbury C10 rail + drink rail kit',
    qty: '1 line / 42 lf',
    lineNote: 'Pool side; matched rail to new deck color',
    estValue: '~$4.1k',
  },
  {
    date: '2025-09-03',
    product: 'Apex Hidden Fasteners — clip system',
    qty: '1 job pack',
    lineNote: 'Next-day add-on after main order closed',
    estValue: '~$890',
  },
  {
    date: '2025-06-12',
    product: 'Trim & fascia bundle (mixed lengths)',
    qty: 'Starter for long perimeter runs',
    lineNote: 'Tie-in to earlier deck quote',
    estValue: '~$2.4k',
  },
] as const

export const KENNY_NOTES: readonly { who: string; text: string }[] = [
  {
    who: 'You · Aug 14',
    text: 'Asked for TimberTech samples; keeps coming back to hidden-fastener look — walk the board with him on site before you quote add-ons.',
  },
  {
    who: `${DEMO_REP_FIRST_NAME} · field note`,
    text: 'Price check on Pro line vs AZEK line; willing to trade up if margin story is clear and lead time beats Big Box.',
  },
  {
    who: 'Service',
    text: 'One delivery slip last spring; fixed same week. No open service debt; good for an upsell conversation.',
  },
]

/**
 * Single paragraph for Eleven Labs “hear summary” (demo script; may not enumerate every row in `KENNY_SALES_ROWS`).
 */
export const KENNY_TTS_AUDIO_BRIEF = [
  'Kenny Hills Contracting is a reliable customer that is currently focusing on selling pool deck lines.',
  "In November, they bought a heavy lift cap composite resurfacing option, and it's the biggest dollar item on the account.",
  "From there, they've bought Westbury Rail to match their pool deck collection and have been looking for hidden fasteners of different types to make their orders pop for their customers.",
  'They are really pushing for clean surfaces with no screws showing.',
].join(' ')
