import type { DocKind } from './docKindClassifier'

export const DEFAULT_MAX_EMBED_SPEND_USD = 10
export const PRICE_PER_1K_EMBED_TOKENS_USD = 0.00002

export type FailureReason = 'encrypted' | 'needs_ocr' | 'no_schema' | 'schema_validation_failed' | 'other'

export type IngestMetricsSnapshot = {
  filesByDocKind: Record<string, number>
  chunksByScope: Record<string, number>
  extractDurationMsByDocKind: Record<string, number[]>
  embedCostUsdBySource: Record<string, number>
  failuresByReason: Record<string, number>
}

export class IngestMetrics {
  private filesByDocKind = new Map<string, number>()
  private chunksByScope = new Map<string, number>()
  private extractDurationMsByDocKind = new Map<string, number[]>()
  private embedCostUsdBySource = new Map<string, number>()
  private failuresByReason = new Map<string, number>()

  recordFile(docKind: DocKind): void {
    this.filesByDocKind.set(docKind, (this.filesByDocKind.get(docKind) ?? 0) + 1)
  }

  recordChunks(scope: string, count: number): void {
    if (count <= 0) return
    this.chunksByScope.set(scope, (this.chunksByScope.get(scope) ?? 0) + count)
  }

  recordExtractDuration(docKind: DocKind, durationMs: number): void {
    const durations = this.extractDurationMsByDocKind.get(docKind) ?? []
    durations.push(Math.max(0, Math.round(durationMs)))
    this.extractDurationMsByDocKind.set(docKind, durations)
  }

  recordEmbedCost(sourceId: string, costUsd: number): void {
    this.embedCostUsdBySource.set(sourceId, Number(costUsd.toFixed(6)))
  }

  recordFailure(reason: FailureReason): void {
    this.failuresByReason.set(reason, (this.failuresByReason.get(reason) ?? 0) + 1)
  }

  snapshot(): IngestMetricsSnapshot {
    return {
      filesByDocKind: Object.fromEntries(this.filesByDocKind),
      chunksByScope: Object.fromEntries(this.chunksByScope),
      extractDurationMsByDocKind: Object.fromEntries(this.extractDurationMsByDocKind),
      embedCostUsdBySource: Object.fromEntries(this.embedCostUsdBySource),
      failuresByReason: Object.fromEntries(this.failuresByReason),
    }
  }
}

export function projectEmbedCostUsd(tokenCount: number): number {
  const safeTokens = Math.max(0, Math.round(tokenCount))
  return Number(((safeTokens / 1000) * PRICE_PER_1K_EMBED_TOKENS_USD).toFixed(6))
}

export function enforceEmbedSpendCap(input: {
  projectedCostUsd: number
  maxEmbedSpendUsd?: number
}): { allowed: true; capUsd: number } {
  const cap = input.maxEmbedSpendUsd ?? DEFAULT_MAX_EMBED_SPEND_USD
  if (!Number.isFinite(cap) || cap <= 0) {
    throw new Error('maxEmbedSpendUsd must be a positive number')
  }
  if (input.projectedCostUsd > cap) {
    throw new Error(
      `projected embedding spend $${input.projectedCostUsd.toFixed(6)} exceeds cap $${cap.toFixed(2)}; rerun with higher --max-embed-spend`,
    )
  }
  return { allowed: true, capUsd: cap }
}
