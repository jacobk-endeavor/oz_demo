/** Matches planned Track C chat uploads contract (docs/code-sandbox-and-artifact-generation.md). */
export const OZ_CHAT_UPLOADS_PATH = '/api/oz/chat/uploads'

const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_TURN_BYTES = 100 * 1024 * 1024

const ALLOWED_MIME = new Set([
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'text/plain',
  'image/png',
  'image/jpeg',
])

/** Fallback when the browser leaves `type` empty (common on drag-drop). */
const ALLOWED_EXT = new Set(['.csv', '.json', '.xlsx', '.pdf', '.txt', '.png', '.jpg', '.jpeg'])

/** Upload kinds that may be offered for KB promotion (docs/code-sandbox-and-artifact-generation.md §12.1.3). */
export const OZ_KB_PROMOTABLE_KINDS = new Set(['csv', 'xlsx', 'pdf', 'docx', 'txt', 'md'])

/**
 * Normalized extension-derived kind for KB promotion gating (not MIME — consistent with filename UX).
 */
export function uploadKindFromFilename(filename: string): string {
  const lower = filename.trim().toLowerCase()
  const dot = lower.lastIndexOf('.')
  const ext = dot >= 0 ? lower.slice(dot) : ''
  switch (ext) {
    case '.csv':
      return 'csv'
    case '.xlsx':
      return 'xlsx'
    case '.pdf':
      return 'pdf'
    case '.docx':
      return 'docx'
    case '.txt':
      return 'txt'
    case '.md':
    case '.markdown':
      return 'md'
    default:
      return 'other'
  }
}

export function isKbPromotableFilename(filename: string): boolean {
  return OZ_KB_PROMOTABLE_KINDS.has(uploadKindFromFilename(filename))
}

export function isAllowedComposerUploadFile(f: File): boolean {
  const mime = (f.type || '').trim().toLowerCase()
  if (mime && ALLOWED_MIME.has(mime)) return true
  const name = f.name.toLowerCase()
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot) : ''
  return ALLOWED_EXT.has(ext)
}

function normalizeUploadPayload(raw: unknown): { upload_id: string }[] {
  if (Array.isArray(raw)) {
    return raw
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const id = (row as Record<string, unknown>).upload_id
        return typeof id === 'string' && id.trim() ? { upload_id: id.trim() } : null
      })
      .filter((x): x is { upload_id: string } => x != null)
  }
  if (raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).upload_id === 'string') {
    const id = (raw as Record<string, unknown>).upload_id as string
    return id.trim() ? [{ upload_id: id.trim() }] : []
  }
  return []
}

export function validateComposerUploadFiles(files: File[]): { ok: true } | { ok: false; detail: string } {
  let total = 0
  for (const f of files) {
    if (!isAllowedComposerUploadFile(f)) {
      return { ok: false, detail: `${f.name}: type not allowed for chat uploads.` }
    }
    if (f.size > MAX_FILE_BYTES) {
      return { ok: false, detail: `${f.name} is larger than 25 MB.` }
    }
    total += f.size
    if (total > MAX_TURN_BYTES) {
      return { ok: false, detail: 'Attachments exceed 100 MB for this message.' }
    }
  }
  return { ok: true }
}

export type OzChatUploadResult =
  | { ok: true; uploadIds: string[] }
  | { ok: false; reason: 'unavailable' | 'validation' | 'http'; detail?: string }

/**
 * POST multipart to the chat uploads route when deployed. Returns `unavailable` on 404/405
 * so the composer can still attach files locally for display and prompt context.
 */
export async function postOzChatUploadsIfAvailable(files: File[]): Promise<OzChatUploadResult> {
  if (files.length === 0) return { ok: true, uploadIds: [] }
  const v = validateComposerUploadFiles(files)
  if (!v.ok) return { ok: false, reason: 'validation', detail: v.detail }

  const body = new FormData()
  for (const f of files) {
    body.append('file', f, f.name)
  }

  try {
    const res = await fetch(OZ_CHAT_UPLOADS_PATH, { method: 'POST', body })
    if (res.status === 404 || res.status === 405) {
      return { ok: false, reason: 'unavailable' }
    }
    if (!res.ok) {
      const t = await res.text()
      return {
        ok: false,
        reason: 'http',
        detail: t.slice(0, 240) || `HTTP ${res.status}`,
      }
    }
    const raw = (await res.json()) as unknown
    const rows = normalizeUploadPayload(raw)
    const uploadIds = rows.map((r) => r.upload_id)
    if (uploadIds.length !== files.length) {
      return {
        ok: false,
        reason: 'http',
        detail: 'Upload response did not include an id for each file.',
      }
    }
    return { ok: true, uploadIds }
  } catch (e) {
    return {
      ok: false,
      reason: 'http',
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}
