/**
 * Field voice memo: append a row to the Field Notes “incoming voice memos” store.
 * Script 3 calls `appendCannedRepFieldMemo` after the rep pauses (VAD) on the post–“Ok, recording” turn.
 */
import { DEMO_REP_FIRST_NAME } from '../../config/demoRep'
import { appendVoiceMemo } from '../fieldNotes/voiceMemoStore'
import type { VoiceMemoRow } from '../fieldNotes/fieldNotesDashboardData'
import {
  DEMO_REP_FIELD_MEMO_CANNED_TEXT,
  VOICE_MEMO_RECORDING_ACK,
  VOICE_MEMO_SAVED_SYSTEM_LINE,
} from './fieldDemoVoiceCopy'

export type AppendFieldMemoOptions = {
  id?: string
  customer?: string
  salesman?: string
}

/**
 * Persist memo text as a voice-memo row. `notesPreview` is derived from the transcript.
 */
export function appendFieldMemoFromDictation(
  transcript: string,
  options?: AppendFieldMemoOptions,
): VoiceMemoRow {
  const tidied = transcript.trim()
  const preview =
    tidied.length > 90 ? `${tidied.slice(0, 87)}…` : tidied || '(empty transcript)'
  return appendVoiceMemo({
    id: options?.id,
    customer: options?.customer ?? 'Summit Ridge',
    salesman: options?.salesman ?? DEMO_REP_FIRST_NAME,
    atIso: new Date().toISOString(),
    notesPreview: preview,
    conversation: [
      { speaker: 'System', text: VOICE_MEMO_RECORDING_ACK },
      { speaker: 'Rep', text: tidied || '…' },
      { speaker: 'System', text: VOICE_MEMO_SAVED_SYSTEM_LINE },
    ],
  })
}

/** Append the canned demo field memo (customer sentiment); used from the Field App voice queue after VAD on that turn. */
export function appendCannedRepFieldMemo() {
  return appendFieldMemoFromDictation(DEMO_REP_FIELD_MEMO_CANNED_TEXT)
}
