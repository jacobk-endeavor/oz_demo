import { createHash, randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'

/** Per-file cap (bytes). */
export const OZ_CHAT_UPLOAD_MAX_FILE_BYTES = 25 * 1024 * 1024

/** Per-request aggregate cap (bytes). */
export const OZ_CHAT_UPLOAD_MAX_AGGREGATE_BYTES = 100 * 1024 * 1024

/** Allowed multipart part Content-Type values (lowercase, no params). */
export const OZ_CHAT_UPLOAD_ALLOWED_MIMES = new Set([
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'text/plain',
  'image/png',
  'image/jpeg',
])

export type OzChatUploadKind = 'csv' | 'json' | 'xlsx' | 'pdf' | 'txt' | 'png' | 'jpeg'

const MIME_TO_KIND_AND_EXT: Record<string, { kind: OzChatUploadKind; ext: string }> = {
  'text/csv': { kind: 'csv', ext: 'csv' },
  'application/json': { kind: 'json', ext: 'json' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { kind: 'xlsx', ext: 'xlsx' },
  'application/pdf': { kind: 'pdf', ext: 'pdf' },
  'text/plain': { kind: 'txt', ext: 'txt' },
  'image/png': { kind: 'png', ext: 'png' },
  'image/jpeg': { kind: 'jpeg', ext: 'jpeg' },
}

export function normalizeMultipartMime(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return ''
  const base = raw.split(';')[0]?.trim().toLowerCase() ?? ''
  return base === 'image/jpg' ? 'image/jpeg' : base
}

export function resolveUploadKindAndExt(mimeNormalized: string): { kind: OzChatUploadKind; ext: string } | null {
  const entry = MIME_TO_KIND_AND_EXT[mimeNormalized]
  return entry ?? null
}

/**
 * Safe single path segment for Spaces keys: tenant / conversation / object name live elsewhere.
 */
export function sanitizeConversationIdSegment(raw: string): string | null {
  const s = String(raw ?? '').trim()
  if (!s || s.length > 200) return null
  if (!/^[a-zA-Z0-9._-]+$/.test(s)) return null
  return s
}

export function resolveOzUploadsBucket(env: NodeJS.ProcessEnv): string | undefined {
  const explicit = String(env.OZ_UPLOADS_BUCKET ?? '').trim()
  if (explicit) return explicit
  const suffix = String(env.OZ_UPLOAD_ENV ?? '').trim()
  if (suffix) return `oz-uploads-${suffix}`
  return undefined
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export function newUploadId(): string {
  return randomUUID()
}

export async function bufferReadableWithCaps(
  stream: Readable,
  opts: {
    maxFileBytes: number
    aggregateSoFar: number
    maxAggregateBytes: number
  },
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let fileSize = 0
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    fileSize += buf.length
    if (fileSize > opts.maxFileBytes) {
      stream.destroy()
      throw new RangeError(`file exceeds ${opts.maxFileBytes} bytes`)
    }
    if (opts.aggregateSoFar + fileSize > opts.maxAggregateBytes) {
      stream.destroy()
      throw new RangeError(`aggregate size exceeds ${opts.maxAggregateBytes} bytes`)
    }
    chunks.push(buf)
  }
  if (fileSize === 0) throw new RangeError('empty file')
  return Buffer.concat(chunks)
}
