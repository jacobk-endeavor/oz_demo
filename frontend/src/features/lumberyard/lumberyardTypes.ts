export type LumberyardSource = 'call_recording' | 'field_notes' | 'email'

export type LumberyardCallRow = {
  id: string
  source: LumberyardSource
  /** ISO date (YYYY-MM-DD) when present in the manifest. */
  callDate?: string
  title: string
  /** For table + modal; derived from customerPersona for legacy calls if omitted in JSON. */
  customerName: string
  /** City, ST or similar. */
  location: string
  /** Concrete SKUs / lines the customer asked about (UI tags). */
  productTags?: string[]
  tags: string[]
  notable: string[]
  repPersona: string
  customerPersona: string
  transcript: string
  audio: string | null
  /** Unified text for Q&A and call rows (file transcript). For email/field, mirrors the modal body. */
  transcriptText: string
  audioUrl: string | null
  transcriptPath: string
  /** True length of the MP3 (ffprobe); browsers often lie on naive-concat MP3s. */
  durationSec?: number | null
  /** Email thread / body; only for `source === 'email'`. */
  emailTranscript?: string
  /** Rep voice-to-text from the field; only for `source === 'field_notes'`. */
  fieldNotesText?: string
}

export type SyntheticTelemetry = {
  intelligenceProvenance: string
  revenueByProductGroupApprox: {
    group: string
    approxPercentOfLumberYardRevenue: number
    citedInCallIds: string[]
  }[]
  channelNotes: string
  competitorMentionIndex: { name: string; callIds: string[] }[]
}

export type LumberyardLibraryResponse = {
  ok: boolean
  version?: number
  synthetic: SyntheticTelemetry | null
  calls: LumberyardCallRow[]
}

export type LumberyardIntelResponse = {
  reply: string
  usedWebSearch?: boolean
}
