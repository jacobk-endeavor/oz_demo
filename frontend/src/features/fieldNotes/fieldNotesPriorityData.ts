/**
 * Demo field sales org + priority “push” briefs with per-rep read receipts (managerial view).
 * Rep roster matches VOICE_MEMO_DEMO; mock briefs illustrate varied acknowledgment states.
 */

export type FieldSalesRep = { id: string; name: string }

/** Four demo field reps — same names as in voice memo rows. */
export const DEMO_FIELD_SALES_REPS: readonly FieldSalesRep[] = [
  { id: 'rep-marcus', name: 'Marcus Chen' },
  { id: 'rep-priya', name: 'Priya Nair' },
  { id: 'rep-jordan', name: 'Jordan Ellis' },
  { id: 'rep-alex', name: 'Alex Ruiz' },
] as const

export type PriorityBriefCard = {
  id: string
  text: string
  createdAtIso: string
  /** Rep id → ISO time when the rep’s app acknowledged the brief (omitted = not yet seen). */
  seenBy: Partial<Record<string, string>>
}

export function isMockPriorityBriefId(id: string): boolean {
  return id.startsWith('mock-')
}

/** Seeded manager alerts; read receipts are static for the demo. */
export const MOCK_PRIORITY_BRIEFS: readonly PriorityBriefCard[] = [
  {
    id: 'mock-brief-spf',
    text:
      "Push #2 dimensional SPF first — back-lot volume break runs through this Friday. Lead with 2×6x12 and 2×4 bundles on contractor deck framing.",
    createdAtIso: '2026-04-25T09:15:00-04:00',
    seenBy: {
      'rep-marcus': '2026-04-25T09:20:00-04:00',
      'rep-priya': '2026-04-25T09:18:00-04:00',
      'rep-jordan': '2026-04-25T09:32:00-04:00',
      'rep-alex': '2026-04-25T09:25:00-04:00',
    },
  },
  {
    id: 'mock-brief-deck',
    text:
      'Decks: bundle composite + aluminum rail (Trex and Westbury) for multi-lot and HOA jobs. Bring 18″ sample boards on every first visit this month.',
    createdAtIso: '2026-04-25T08:00:00-04:00',
    seenBy: {
      'rep-marcus': '2026-04-25T08:10:00-04:00',
      'rep-priya': '2026-04-25T08:12:00-04:00',
    },
  },
  {
    id: 'mock-brief-siding',
    text:
      'Siding: LP SmartSide in stock; if pros stall on color vs fiber-cement, share the install detail PDF and we’ll hold trim for 48h.',
    createdAtIso: '2026-04-24T16:00:00-04:00',
    seenBy: {},
  },
  {
    id: 'mock-brief-osb',
    text:
      'OSB: steer pros to Weyerhaeuser Edge for roof and wall stock before they default to big-box will-call. Quote bundle + delivery from our yard.',
    createdAtIso: '2026-04-24T11:30:00-04:00',
    seenBy: {
      'rep-jordan': '2026-04-24T11:40:00-04:00',
    },
  },
]
