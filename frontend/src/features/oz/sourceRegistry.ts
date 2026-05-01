import { classifyDocKind } from './docKindClassifier'

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
  firstPageText?: string
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
const FIRST_PAGE_MINHASH_THRESHOLD = 0.95
const MINHASH_SIGNATURE_SIZE = 64

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

function omitDocKindInference(meta: SourceMeta): SourceMeta {
  const {
    doc_kind: _docKind,
    doc_kind_confidence: _docKindConfidence,
    doc_kind_matched_by: _docKindMatchedBy,
    doc_kind_signals: _docKindSignals,
    ...rest
  } = meta
  return rest
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function asNormalizedNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeFilenameStem(path: string): string {
  const filename = path.split(/[\\/]/).pop() ?? path
  const withoutExtension = filename.replace(/\.[^.]+$/, '')
  const withoutParens = withoutExtension.replace(/\([^)]*\)\s*$/g, '')
  const withoutTrailingDate = withoutParens.replace(
    /(?:[-_\s]+)?(?:\d{1,2}[._-]\d{1,2}[._-]\d{2,4}|\d{8}|\d{4}[._-]\d{1,2}[._-]\d{1,2})\s*$/g,
    '',
  )
  return withoutTrailingDate.toLowerCase().replace(/[+\s]/g, '')
}

function fnv1a32(input: string, seed = 0): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0
  for (let idx = 0; idx < input.length; idx += 1) {
    hash ^= input.charCodeAt(idx)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function tokenShingles(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
  if (tokens.length === 0) return []
  if (tokens.length < 3) return [tokens.join(' ')]
  const shingles: string[] = []
  for (let idx = 0; idx <= tokens.length - 3; idx += 1) {
    shingles.push(`${tokens[idx]} ${tokens[idx + 1]} ${tokens[idx + 2]}`)
  }
  return shingles
}

function minhashSignature(text: string): number[] {
  const shingles = tokenShingles(text)
  if (shingles.length === 0) return []
  const signature = new Array<number>(MINHASH_SIGNATURE_SIZE).fill(Number.POSITIVE_INFINITY)
  for (const shingle of shingles) {
    for (let seed = 0; seed < MINHASH_SIGNATURE_SIZE; seed += 1) {
      const hashed = fnv1a32(shingle, seed)
      if (hashed < signature[seed]) {
        signature[seed] = hashed
      }
    }
  }
  return signature
}

function minhashSimilarity(left: string, right: string): number {
  const leftSig = minhashSignature(left)
  const rightSig = minhashSignature(right)
  if (leftSig.length === 0 || rightSig.length === 0 || leftSig.length !== rightSig.length) {
    return 0
  }
  let equal = 0
  for (let idx = 0; idx < leftSig.length; idx += 1) {
    if (leftSig[idx] === rightSig[idx]) equal += 1
  }
  return equal / leftSig.length
}

function firstPageTextFromMeta(meta: SourceMeta): string | null {
  const direct = asTrimmedString(meta.first_page_text)
  if (direct != null) return direct
  const alternate = asTrimmedString(meta.firstPageText)
  if (alternate != null) return alternate
  return null
}

function duplicateTupleFromMeta(meta: SourceMeta): string | null {
  const brand = asTrimmedString(meta.brand)?.toLowerCase()
  const productLine = asTrimmedString(meta.product_line ?? meta.line)?.toLowerCase()
  const year = asNormalizedNumber(meta.year)
  const docKind = asTrimmedString(meta.doc_kind)?.toLowerCase()
  if (brand == null || productLine == null || year == null || docKind == null) {
    return null
  }
  return `${brand}::${productLine}::${year}::${docKind}`
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

  private annotateNearDuplicatesForSource(sourceId: string): SourceRecord {
    const current = this.bySourceId.get(sourceId)
    if (current == null) {
      throw new Error(`source not found: ${sourceId}`)
    }
    const currentNormalizedFilename = normalizeFilenameStem(current.path)
    const currentTuple = duplicateTupleFromMeta(current.meta)
    const currentFirstPage = firstPageTextFromMeta(current.meta)

    const matches = new Set<string>()
    for (const candidate of this.bySourceId.values()) {
      if (candidate.sourceId === sourceId) continue

      const candidateNormalizedFilename = normalizeFilenameStem(candidate.path)
      if (
        currentNormalizedFilename.length > 0 &&
        currentNormalizedFilename === candidateNormalizedFilename
      ) {
        matches.add(candidate.sourceId)
      }

      const candidateTuple = duplicateTupleFromMeta(candidate.meta)
      if (currentTuple != null && candidateTuple != null && currentTuple === candidateTuple) {
        matches.add(candidate.sourceId)
      }

      const candidateFirstPage = firstPageTextFromMeta(candidate.meta)
      if (currentFirstPage != null && candidateFirstPage != null) {
        if (minhashSimilarity(currentFirstPage, candidateFirstPage) >= FIRST_PAGE_MINHASH_THRESHOLD) {
          matches.add(candidate.sourceId)
        }
      }
    }

    const nearDuplicates = [...matches].sort()
    const updated: SourceRecord = {
      ...current,
      meta: {
        ...current.meta,
        near_duplicates: nearDuplicates,
      },
    }
    this.bySourceId.set(sourceId, updated)
    return updated
  }

  private tryAnnotateNearDuplicates(sourceId: string): SourceRecord {
    try {
      return this.annotateNearDuplicatesForSource(sourceId)
    } catch {
      // Duplicate heuristics are advisory and should never block ingest flow.
      const existing = this.bySourceId.get(sourceId)
      if (existing == null) throw new Error(`source not found: ${sourceId}`)
      return existing
    }
  }

  register(input: RegisterSourceInput): RegisterSourceResult {
    const sha256 = normalizeSha256(input.sha256)
    const path = normalizePath(input.path)
    const mime = normalizeMime(input.mime)
    const sourceId = sourceIdFromSha256(sha256)

    const classification = classifyDocKind({
      path,
      mime,
      firstPageText: input.firstPageText,
      docKindOverride: typeof input.meta?.doc_kind_override === 'string' ? input.meta.doc_kind_override : undefined,
    })
    const inferredMetaFull: SourceMeta = {
      doc_kind: classification.doc_kind,
      doc_kind_confidence: classification.confidence,
      doc_kind_matched_by: classification.matched_by,
      doc_kind_signals: classification.signals,
      ...(classification.brand != null ? { brand: classification.brand } : {}),
      ...(classification.product_line != null ? { product_line: classification.product_line } : {}),
      ...(classification.year != null ? { year: classification.year } : {}),
      ...(classification.distributor_branded != null
        ? { distributor_branded: classification.distributor_branded }
        : {}),
    }
    const inputMeta = input.meta ?? {}
    const inferredMeta =
      inputMeta.doc_kind == null
        ? inferredMetaFull
        : omitDocKindInference(inferredMetaFull)

    const existingId = this.sourceIdBySha.get(sha256)
    if (existingId != null) {
      const existing = this.bySourceId.get(existingId)
      if (existing == null) {
        throw new Error(`registry invariant violated for source_id=${existingId}`)
      }
      const inferredMetaForExisting =
        classification.doc_kind === 'unknown' &&
        input.firstPageText == null &&
        inputMeta.doc_kind == null
          ? omitDocKindInference(inferredMeta)
          : inferredMeta
      const updated: SourceRecord = {
        ...existing,
        path,
        mime,
        bytes: input.bytes ?? existing.bytes,
        pageCount: input.pageCount ?? existing.pageCount,
        sheetCount: input.sheetCount ?? existing.sheetCount,
        meta: { ...existing.meta, ...inferredMetaForExisting, ...inputMeta },
      }
      this.bySourceId.set(existingId, updated)
      const annotated = this.tryAnnotateNearDuplicates(existingId)
      return {
        created: false,
        alreadyReady: annotated.status === 'ready',
        record: cloneRecord(annotated),
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
      meta: { ...inferredMeta, ...inputMeta },
    }

    this.bySourceId.set(sourceId, record)
    this.sourceIdBySha.set(sha256, sourceId)
    const annotated = this.tryAnnotateNearDuplicates(sourceId)
    return { created: true, alreadyReady: false, record: cloneRecord(annotated) }
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
  FIRST_PAGE_MINHASH_THRESHOLD,
} as const
