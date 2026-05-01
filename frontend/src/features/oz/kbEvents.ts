export const KB_EVENT_VERSION = 1 as const

export type KbIngestedEvent = {
  event: 'kb.ingested'
  event_version: 1
  replay?: boolean
  source_id: string
  title: string
  chunk_ids: string[]
  locators: string[]
  extracted_text_path?: string
}

export type KbRefreshedEvent = {
  event: 'kb.refreshed'
  event_version: 1
  replay?: boolean
  source_id: string
  summary: {
    added: number
    modified: number
    removed: number
  }
}

export type KbEvent = KbIngestedEvent | KbRefreshedEvent

export type KbEventPublisher = {
  publish: (event: KbEvent) => Promise<void>
}

export type EmitKbEventInput = {
  publisher: KbEventPublisher
  event: Omit<KbEvent, 'event_version'>
  maxAttempts?: number
}

function normalizeAttempts(maxAttempts: number | undefined): number {
  const attempts = maxAttempts ?? 3
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('maxAttempts must be a positive integer')
  }
  return attempts
}

export async function emitKbEvent(input: EmitKbEventInput): Promise<{ delivered: true; attempts: number; payload: KbEvent }> {
  const maxAttempts = normalizeAttempts(input.maxAttempts)
  const payload = { ...input.event, event_version: KB_EVENT_VERSION } as KbEvent

  let attempts = 0
  let lastError: unknown = null
  while (attempts < maxAttempts) {
    attempts += 1
    try {
      await input.publisher.publish(payload)
      return { delivered: true, attempts, payload }
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(
    `failed to deliver ${payload.event} after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

export function buildKbIngestedEvent(input: Omit<KbIngestedEvent, 'event' | 'event_version'>): KbIngestedEvent {
  return {
    event: 'kb.ingested',
    event_version: KB_EVENT_VERSION,
    ...input,
  }
}

export function buildKbRefreshedEvent(input: Omit<KbRefreshedEvent, 'event' | 'event_version'>): KbRefreshedEvent {
  return {
    event: 'kb.refreshed',
    event_version: KB_EVENT_VERSION,
    ...input,
  }
}
