export type FieldNotesStage = 'idle' | 'listening' | 'thinking' | 'output' | 'pushed'

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'running_action'

export interface TranscriptLine {
  id: string
  speaker: 'rep' | 'oz'
  text: string
}

export interface SalesAction {
  id: string
  label: string
  detail: string
  owner: string
}

export interface FieldNotesDemo {
  customer: string
  rep: string
  meetingDate: string
  meetingType: string
  productContext: string
  priorInteractions: string[]
  rawNote: string
  transcript: TranscriptLine[]
  structuredSummary: string
  questionsToAsk: string[]
  upsellSuggestions: string[]
  pricingGuidance: string
  salesActions: SalesAction[]
  webActions: string[]
}
