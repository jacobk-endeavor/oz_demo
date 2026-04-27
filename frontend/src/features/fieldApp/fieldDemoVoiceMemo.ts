/**
 * Field voice memo: append a row to the Field Notes “incoming voice memos” store.
 * Script 3 uses live transcription; this module builds the row shape.
 */
import { appendVoiceMemo } from '../fieldNotes/voiceMemoStore'
import type { VoiceMemoRow } from '../fieldNotes/fieldNotesDashboardData'
import { VOICE_MEMO_RECORDING_ACK, VOICE_MEMO_SAVED_SYSTEM_LINE } from './fieldDemoVoiceCopy'

export type AppendFieldMemoOptions = {
  id?: string
  customer?: string
  salesman?: string
}

/**
 * Persist a memo from Whisper (or other STT) text. `notesPreview` is derived from the transcript.
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
    customer: options?.customer ?? 'Field visit',
    salesman: options?.salesman ?? 'Sami',
    atIso: new Date().toISOString(),
    notesPreview: preview,
    conversation: [
      { speaker: 'System', text: VOICE_MEMO_RECORDING_ACK },
      { speaker: 'Rep', text: tidied || '…' },
      { speaker: 'System', text: VOICE_MEMO_SAVED_SYSTEM_LINE },
    ],
  })
}
