/**
 * Demo content for the **field-meeting voice memo** turn in the orb script
 * queue. When the rep finishes "dictating" (silence advances the turn), the
 * Field App appends this memo to the incoming-voice-memos store so it shows
 * up in the Field Notes page.
 *
 * Keep this content aligned to the Sammy Carter / automation-cell-upgrade
 * demo — the memo sets up Script 4's quote Q&A so the narrative flows:
 * walkthrough → memo → quote build.
 */
import { appendVoiceMemo } from '../fieldNotes/voiceMemoStore'
import type { VoiceMemoRow } from '../fieldNotes/fieldNotesDashboardData'

/** Stable id so repeated demo runs replace (don't duplicate) the memo. */
const DEMO_MEMO_ID = 'vm-demo-sammy-carter-walkthrough' as const

const DEMO_MEMO_DICTATION =
  'Just left Sammy Carter’s fab shop. Walked the floor with Sammy and his maintenance lead Mike. Sammy wants to upgrade the second packaging line — manual case packing is the bottleneck right now, they’re losing about an hour a day on changeover between the 12-pack and 24-pack runs. He’s looking at a robotic pick cell with vision verification and integrated PLC controls, install target before Q3. Cap-ex is tight so he’s open to leasing if it gets the cell installed faster, but they’d prefer to own. Action items: pull the Q25-1102 cell-build spec as the starting point, get the floor envelope from Mike next week, and walk back with the cost recap on the Job Cost template — target around two-eighty-five thousand all-in, holding forty-five-percent margin. Felt good — Sammy is bought in on the approach. Quote first, lease conversation second.'

/**
 * Append the Sammy Carter walkthrough memo to the field-notes voice-memo store.
 * Called from the orb script queue when the "Cool, recording" turn completes,
 * so the rep can navigate to Field Notes and see the memo land in the
 * "Incoming voice memos" table. Returns the stored row.
 */
export function captureSammyCarterFieldMemo(): VoiceMemoRow {
  return appendVoiceMemo({
    id: DEMO_MEMO_ID,
    customer: 'Sammy Carter',
    salesman: 'Alex',
    atIso: new Date().toISOString(),
    notesPreview:
      'Pre-quote walkthrough — automation cell upgrade, Q3 install target, ~$285k all-in.',
    conversation: [
      { speaker: 'System', text: 'Cool, recording.' },
      { speaker: 'Rep', text: DEMO_MEMO_DICTATION },
      { speaker: 'System', text: 'Memo saved to Field notes.' },
    ],
  })
}
