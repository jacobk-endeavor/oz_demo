/** Default tenant when multi-tenant middleware is not wired (§11.2.4 baseline). */
export const DEFAULT_OZ_TENANT = 'demo'

export type OzThreadDirectionRow = {
  thread_id: string
  tenant: string
  direction_text: string
  structured_refs: unknown
  set_at: string
  set_by: string | null
}

/** Request body for PUT /api/oz/chat/thread/:id/direction */
export type OzThreadDirectionPutInput = {
  direction_text?: string
  structured_refs?: unknown
  set_by?: string
}

export type SanitizedOzThreadDirectionPut = {
  direction_text: string
  structured_refs: unknown
  set_by: string
}

function trimText(value: string): string {
  return String(value ?? '').trim()
}

/** Normalize user input the same way memory write content is normalized in memoryAdapters. */
export function sanitizeThreadDirectionPut(input: OzThreadDirectionPutInput): SanitizedOzThreadDirectionPut {
  const direction_text = trimText(input.direction_text ?? '')
  let structured_refs: unknown = input.structured_refs
  if (structured_refs === undefined) structured_refs = []
  try {
    structured_refs = JSON.parse(JSON.stringify(structured_refs))
  } catch {
    structured_refs = []
  }
  const set_by_raw = trimText(input.set_by ?? '')
  const set_by = set_by_raw || 'anonymous'
  return { direction_text, structured_refs, set_by }
}

export function resolveOzTenant(readEnv: () => Record<string, string>): string {
  const env = readEnv()
  const t = trimText(process.env.OZ_TENANT || env.OZ_TENANT || '')
  return t || DEFAULT_OZ_TENANT
}
