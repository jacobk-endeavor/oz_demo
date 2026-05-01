export type SourceStatus = 'pending' | 'extracting' | 'embedding' | 'ready' | 'failed' | 'removed'

export type SourceMeta = Record<string, unknown>

export type SourceRecord = {
  sourceId: string
  path: string
  firstSeenPath: string
  sha256: string
  mime: string
  bytes?: number
  pageCount?: number
  sheetCount?: number
  ingestedAt: string
  status: SourceStatus
  meta: SourceMeta
}

export type RegisterSourceInput = {
  path: string
  sha256: string
  mime: string
  bytes?: number
  pageCount?: number
  sheetCount?: number
  ingestedAt?: string
  status?: SourceStatus
  meta?: SourceMeta
}

export type RegisterSourceResult = {
  created: boolean
  alreadyReady: boolean
  record: SourceRecord
}

const SOURCE_ID_HEX_LEN = 12
const SHA256_HEX_LEN = 64

const ALLOWED_TRANSITIONS: Record<SourceStatus, Set<SourceStatus>> = {
  pending: new Set(['extracting']),
  extracting: new Set(['embedding', 'failed']),
  embedding: new Set(['ready', 'failed']),
  ready: new Set(['embedding', 'removed']),
  failed: new Set(['pending']),
  removed: new Set([]),
}

function cloneRecord(record: SourceRecord): SourceRecord {
  return {
    ...record,
    meta: { ...record.meta },
  }
}

function normalizeSha256(sha256: string): string {
  const norm = sha256.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(norm)) {
    throw new Error('sha256 must be a 64-character lowercase/uppercase hex string')
  }
  return norm
}

function normalizePath(path: string): string {
  const norm = path.trim()
  if (norm.length === 0) {
    throw new Error('path is required')
  }
  return norm
}

function normalizeMime(mime: string): string {
  const norm = mime.trim().toLowerCase()
  if (norm.length === 0) {
    throw new Error('mime is required')
  }
  return norm
}

function assertTransition(from: SourceStatus, to: SourceStatus) {
  if (from === to) return
  if (!ALLOWED_TRANSITIONS[from].has(to)) {
    throw new Error(`invalid status transition: ${from} -> ${to}`)
  }
}

export function sourceIdFromSha256(sha256: string): string {
  const norm = normalizeSha256(sha256)
  return norm.slice(0, SOURCE_ID_HEX_LEN)
}

export function isValidSourceId(sourceId: string): boolean {
  return /^[0-9a-f]{12}$/.test(sourceId)
}

export class SourceRegistry {
  private readonly bySourceId = new Map<string, SourceRecord>()

  private readonly sourceIdBySha = new Map<string, string>()

  register(input: RegisterSourceInput): RegisterSourceResult {
    const sha256 = normalizeSha256(input.sha256)
    const path = normalizePath(input.path)
    const mime = normalizeMime(input.mime)
    const sourceId = sourceIdFromSha256(sha256)

    const existingId = this.sourceIdBySha.get(sha256)
    if (existingId != null) {
      const existing = this.bySourceId.get(existingId)
      if (existing == null) {
        throw new Error(`registry invariant violated for source_id=${existingId}`)
      }
      const updated: SourceRecord = {
        ...existing,
        path,
        mime,
        bytes: input.bytes ?? existing.bytes,
        pageCount: input.pageCount ?? existing.pageCount,
        sheetCount: input.sheetCount ?? existing.sheetCount,
        meta: input.meta == null ? { ...existing.meta } : { ...existing.meta, ...input.meta },
      }
      this.bySourceId.set(existingId, updated)
      return {
        created: false,
        alreadyReady: existing.status === 'ready',
        record: cloneRecord(updated),
      }
    }

    const ingestedAt = input.ingestedAt ?? new Date().toISOString()
    const status = input.status ?? 'pending'
    const record: SourceRecord = {
      sourceId,
      path,
      firstSeenPath: path,
      sha256,
      mime,
      bytes: input.bytes,
      pageCount: input.pageCount,
      sheetCount: input.sheetCount,
      ingestedAt,
      status,
      meta: { ...(input.meta ?? {}) },
    }

    this.bySourceId.set(sourceId, record)
    this.sourceIdBySha.set(sha256, sourceId)
    return { created: true, alreadyReady: false, record: cloneRecord(record) }
  }

  getBySourceId(sourceId: string): SourceRecord | null {
    const record = this.bySourceId.get(sourceId)
    return record == null ? null : cloneRecord(record)
  }

  getBySha256(sha256: string): SourceRecord | null {
    const norm = normalizeSha256(sha256)
    const sourceId = this.sourceIdBySha.get(norm)
    if (sourceId == null) return null
    return this.getBySourceId(sourceId)
  }

  setStatus(sourceId: string, nextStatus: SourceStatus): SourceRecord {
    const existing = this.bySourceId.get(sourceId)
    if (existing == null) {
      throw new Error(`source not found: ${sourceId}`)
    }
    assertTransition(existing.status, nextStatus)
    const updated = {
      ...existing,
      status: nextStatus,
    }
    this.bySourceId.set(sourceId, updated)
    return cloneRecord(updated)
  }

  patchMeta(sourceId: string, patch: SourceMeta): SourceRecord {
    const existing = this.bySourceId.get(sourceId)
    if (existing == null) {
      throw new Error(`source not found: ${sourceId}`)
    }
    const updated = {
      ...existing,
      meta: { ...existing.meta, ...patch },
    }
    this.bySourceId.set(sourceId, updated)
    return cloneRecord(updated)
  }

  list(): SourceRecord[] {
    return [...this.bySourceId.values()].map(cloneRecord)
  }
}

export const sourceRegistryConstants = {
  SOURCE_ID_HEX_LEN,
  SHA256_HEX_LEN,
} as const
