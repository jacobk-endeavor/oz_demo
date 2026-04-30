export const DEFAULT_MEMORY_CONFIDENCE = 0.7
export const DEFAULT_MEMORY_TTL_SECONDS = 60 * 60 * 24 * 30
export const MIN_MEMORY_WRITE_CONFIDENCE = 0.6
export const DEFAULT_MEMORY_PROVENANCE = 'oz-runtime'

export type MemoryItem = {
  content: string
  confidence?: number
  provenance?: string
  ttl_seconds?: number
}

export type MemoryRecallInput = {
  query: string
  conversation_id?: string
  trace_id?: string
  rag_scope?: string
}

export type MemoryWriteInput = {
  content: string
  confidence?: number
  provenance?: string
  ttl_seconds?: number
  conversation_id?: string
  trace_id?: string
}

export type MemoryWriteResult = {
  accepted: boolean
  reason: string
}

export type MemoryRecallAdapter = (input: MemoryRecallInput) => Promise<MemoryItem[]>
export type MemoryWriteAdapter = (input: MemoryWriteInput) => Promise<MemoryWriteResult>

export type SanitizedMemoryWrite = {
  content: string
  confidence: number
  provenance: string
  ttl_seconds: number
  conversation_id?: string
  trace_id?: string
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_MEMORY_CONFIDENCE
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function safeTtl(ttlSeconds: number | undefined): number {
  if (!Number.isFinite(ttlSeconds) || !ttlSeconds || ttlSeconds <= 0) return DEFAULT_MEMORY_TTL_SECONDS
  return Math.floor(ttlSeconds)
}

export function sanitizeMemoryItem(item: MemoryItem): Required<MemoryItem> {
  return {
    content: String(item.content ?? '').trim(),
    confidence: clampConfidence(item.confidence ?? DEFAULT_MEMORY_CONFIDENCE),
    provenance: String(item.provenance ?? DEFAULT_MEMORY_PROVENANCE).trim() || DEFAULT_MEMORY_PROVENANCE,
    ttl_seconds: safeTtl(item.ttl_seconds),
  }
}

export function sanitizeMemoryWrite(input: MemoryWriteInput): SanitizedMemoryWrite {
  const normalized = sanitizeMemoryItem({
    content: input.content,
    confidence: input.confidence,
    provenance: input.provenance,
    ttl_seconds: input.ttl_seconds,
  })
  return {
    ...normalized,
    conversation_id: input.conversation_id,
    trace_id: input.trace_id,
  }
}

export function evaluateMemoryWritePolicy(
  input: SanitizedMemoryWrite,
): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (!input.content) reasons.push('content_empty')
  if (input.confidence < MIN_MEMORY_WRITE_CONFIDENCE) reasons.push('confidence_below_minimum')
  if (!input.provenance) reasons.push('provenance_missing')
  if (input.ttl_seconds <= 0) reasons.push('ttl_invalid')
  return { allowed: reasons.length === 0, reasons }
}

export async function noopMemoryRecall(): Promise<MemoryItem[]> {
  return []
}

export async function noopMemoryWrite(): Promise<MemoryWriteResult> {
  return {
    accepted: false,
    reason: 'memory_write_adapter_not_configured',
  }
}
