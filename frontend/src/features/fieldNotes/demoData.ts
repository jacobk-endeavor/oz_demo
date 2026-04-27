import { DEMO_REP_FIRST_NAME, DEMO_REP_FULL_NAME } from '../../config/demoRep'
import type { FieldNotesDemo } from './types'

export const fieldNotesDemo: FieldNotesDemo = {
  customer: 'ABC Building Supply',
  rep: DEMO_REP_FULL_NAME,
  meetingDate: 'Apr 29, 2026',
  meetingType: 'Field visit',
  productContext: 'Composite decking, railing kits, and jobsite delivery windows',
  priorInteractions: [
    'Asked twice about faster delivery on composite decking.',
    'Compared Endeavor quote against Northstar Supply pricing.',
    'Recently won three contractor bids that require matched railing kits.',
  ],
  rawNote:
    'ABC needs composite decking faster for two May jobs. They like the slate gray board but competitor is four percent lower. Ask about railing, fasteners, and whether weekend delivery helps them hit install dates.',
  transcript: [
    {
      id: 't1',
      speaker: 'rep',
      text: 'I just left ABC Building Supply. They need slate gray composite decking for two May jobs and asked if we can deliver faster than the normal window.',
    },
    {
      id: 't2',
      speaker: 'rep',
      text: 'Northstar is coming in about four percent lower, but ABC cares more about avoiding a missed install date.',
    },
    {
      id: 't3',
      speaker: 'rep',
      text: 'They also mentioned railing kits, but I did not get quantities. I should ask about hidden fasteners and whether weekend delivery matters.',
    },
  ],
  structuredSummary:
    'ABC Building Supply is likely to buy slate gray composite decking if Endeavor can protect the May install schedule. Price pressure exists, but delivery confidence and attached accessories are stronger levers than discounting alone.',
  questionsToAsk: [
    'Which May job has the hardest delivery deadline, and what date would create a penalty?',
    'Do the railing kits need to match the slate gray boards or can we quote a stocked contrast option?',
    'Should we bundle hidden fasteners and jobsite delivery into one reviewed quote?',
  ],
  upsellSuggestions: [
    'Add hidden fastener packs and color-matched fascia boards to reduce installer callbacks.',
    'Cross-sell aluminum railing kits for the second May job where stock availability is stronger.',
  ],
  pricingGuidance:
    'Hold list price on the decking, offer a 2% bundle credit if ABC includes fasteners and fascia, and position expedited delivery as the value offset against Northstar.',
  salesActions: [
    {
      id: 'quote',
      label: 'Draft bundle quote',
      detail: 'Composite decking, hidden fasteners, fascia, and expedited delivery option.',
      owner: DEMO_REP_FIRST_NAME,
    },
    {
      id: 'specs',
      label: 'Show product specs',
      detail: 'Push slate gray board and aluminum railing spec cards to Nebula.',
      owner: 'Oz',
    },
    {
      id: 'follow-up',
      label: 'Send follow-up prompt',
      detail: 'Ask for job deadline, railing quantity, and weekend delivery preference.',
      owner: DEMO_REP_FIRST_NAME,
    },
  ],
  webActions: ['show_product_specs', 'draft_quote', 'create_follow_up_task'],
}
