/**
 * Demo-only rows for the Field Notes managerial dashboard (voice memos + weekly highlights).
 */

export type VoiceMemoConversationTurn = { speaker: 'Rep' | 'Customer' | 'System'; text: string }

export type VoiceMemoRow = {
  id: string
  customer: string
  salesman: string
  /** ISO 8601 */
  atIso: string
  /** Short line for the table */
  notesPreview: string
  conversation: VoiceMemoConversationTurn[]
}

const conv = (
  lines: [VoiceMemoConversationTurn['speaker'], string][],
): VoiceMemoConversationTurn[] => lines.map(([speaker, text]) => ({ speaker, text }))

export const VOICE_MEMO_DEMO: VoiceMemoRow[] = [
  {
    id: 'vm-1',
    customer: 'Hudson Valley Lumber',
    salesman: 'Marcus Chen',
    atIso: '2026-04-25T14:20:00-04:00',
    notesPreview: 'Decking quote, delivery by May 5…',
    conversation: conv([
      ['Rep', 'Thanks for walking the yard with me. What are you trying to close this month?'],
      ['Customer', 'We’ve got a multi-family porches job; need composite and aluminum rail, ideally one PO.'],
      ['Rep', 'I can bundle Trex and Westbury—if we lock SKUs this week I can hold the truck for Tuesday.'],
      ['Customer', 'Pricing is tight vs the box stores. Can you match last year’s cap?'],
      ['System', 'Call ended—note saved.'],
    ]),
  },
  {
    id: 'vm-2',
    customer: 'Northline Contractors',
    salesman: 'Priya Nair',
    atIso: '2026-04-25T11:05:00-04:00',
    notesPreview: 'LVL long spans, quoted…',
    conversation: conv([
      ['Rep', 'You mentioned 24′ spans in the spec—did the engineer sign off on 1.75″ LVL?'],
      ['Customer', 'They did. We need Boises on the truck before framing starts Monday.'],
      ['Rep', 'I’ll get availability from the DC and text you a cut sheet.'],
      ['System', 'Call ended—note saved.'],
    ]),
  },
  {
    id: 'vm-3',
    customer: 'Summit Pro Builders',
    salesman: 'Jordan Ellis',
    atIso: '2026-04-24T16:42:00-04:00',
    notesPreview: 'Siding color hold, next visit…',
    conversation: conv([
      ['Customer', 'Homeowner can’t choose between the two grays.'],
      ['Rep', 'I’ll bring 18″ sample boards and a trim pairing sheet.'],
      ['Customer', 'If we order by Friday we avoid the May price bump, right?'],
      ['Rep', 'I’ll confirm with the desk and hold the quote.'],
    ]),
  },
  {
    id: 'vm-4',
    customer: 'Erie Bay Supply',
    salesman: 'Marcus Chen',
    atIso: '2026-04-24T09:15:00-04:00',
    notesPreview: 'Stock-up on fasteners…',
    conversation: conv([
      ['Rep', 'You wanted to double structural screws for deck season.'],
      ['Customer', 'Yes, and the GRK promo last year moved—can we replicate?'],
      ['Rep', 'I will ask marketing and reply by EOD.'],
    ]),
  },
  {
    id: 'vm-5',
    customer: 'Maple Street Millwork',
    salesman: 'Alex Ruiz',
    atIso: '2026-04-23T15:00:00-04:00',
    notesPreview: 'Custom mullion lead time…',
    conversation: conv([
      ['Rep', 'Lead time for the mullion package is 3 weeks.'],
      ['Customer', 'That is tight for the school board bid — we might split stock items.'],
      ['Rep', 'I can float a partial release from shop stock on the common sizes.'],
    ]),
  },
  {
    id: 'vm-6',
    customer: 'Great Lakes Pro Desk',
    salesman: 'Priya Nair',
    atIso: '2026-04-23T10:30:00-04:00',
    notesPreview: 'Credit hold discussion…',
    conversation: conv([
      ['System', 'Rep joined existing thread with credit.'],
      ['Rep', 'I have got the release from AR — $50k for the week.'],
      ['Customer', 'Perfect — send the OSB and zip orders today.'],
    ]),
  },
  {
    id: 'vm-7',
    customer: 'Cornerstone Exteriors',
    salesman: 'Jordan Ellis',
    atIso: '2026-04-22T14:00:00-04:00',
    notesPreview: 'Flashing details, follow-up…',
    conversation: conv([
      ['Customer', 'We are seeing callbacks on the drip cap detail.'],
      ['Rep', 'I will bring the mfg install PDF and a photo pack from the last job.'],
      ['Customer', 'Set Tuesday morning with the lead carpenter.'],
    ]),
  },
  {
    id: 'vm-8',
    customer: 'Riverside Rental & Sales',
    salesman: 'Alex Ruiz',
    atIso: '2026-04-22T08:50:00-04:00',
    notesPreview: 'Tooling package renewal…',
    conversation: conv([
      ['Rep', 'Your renewal is coming due—any changes to the fleet mix?'],
      ['Customer', 'Add two more miter saws, drop one generator.'],
      ['Rep', 'I will have contract refresh ready Thursday.'],
    ]),
  },
  {
    id: 'vm-9',
    customer: 'Peninsula Truss & Supply',
    salesman: 'Marcus Chen',
    atIso: '2026-04-21T13:20:00-04:00',
    notesPreview: 'Truss revision R2…',
    conversation: conv([
      ['Rep', 'Engineer sent R2; heel height change on bay window run.'],
      ['Customer', 'We need a same-day re-quote for the framer.'],
      ['System', 'Rep flagged expedited pricing.'],
    ]),
  },
  {
    id: 'vm-10',
    customer: 'Ashford Cabinet Co.',
    salesman: 'Priya Nair',
    atIso: '2026-04-20T11:00:00-04:00',
    notesPreview: 'Hardware upgrade path…',
    conversation: conv([
      ['Rep', 'Soft-close on all cabs is still the default?'],
      ['Customer', 'Yes, but the client is sensitive on Blum vs generic.'],
      ['Rep', 'I will spec Blum and a value alt side-by-side.'],
    ]),
  },
]

export const WEEKLY_IMPORTANT_BOXES: { title: string; body: string }[] = [
  {
    title: 'Top asks',
    body:
      'Reps heard delivery windows and bundle pricing on outdoor projects most often. Composite plus railing kits are a recurring one-PO request; several accounts compared against big-box delivery.',
  },
  {
    title: 'Risks & follow-ups',
    body:
      'Credit holds and expedited truss revisions came up in multiple calls. A few exteriors jobs flagged flashing and install-callback details worth a technical ride-along this week.',
  },
  {
    title: 'Opportunities',
    body:
      'Stock-up and fastener promos remain a lever. Millwork and cabinet shops are open to value-engineered alternatives when lead times for custom packages stretch past bid dates.',
  },
]
