import { describe, expect, it } from 'vitest'
import { DEFAULT_MAX_EMBED_SPEND_USD, enforceEmbedSpendCap, IngestMetrics, projectEmbedCostUsd } from './observability'

describe('observability', () => {
  it('records day-one ingest metrics', () => {
    const metrics = new IngestMetrics()
    metrics.recordFile('tech-bulletin')
    metrics.recordFile('tech-bulletin')
    metrics.recordChunks('global', 4)
    metrics.recordExtractDuration('tech-bulletin', 123.4)
    metrics.recordEmbedCost('abcdef123456', 0.0023451)
    metrics.recordFailure('needs_ocr')
    metrics.recordFailure('needs_ocr')
    const snapshot = metrics.snapshot()
    expect(snapshot.filesByDocKind).toEqual({ 'tech-bulletin': 2 })
    expect(snapshot.chunksByScope).toEqual({ global: 4 })
    expect(snapshot.extractDurationMsByDocKind).toEqual({ 'tech-bulletin': [123] })
    expect(snapshot.embedCostUsdBySource).toEqual({ abcdef123456: 0.002345 })
    expect(snapshot.failuresByReason).toEqual({ needs_ocr: 2 })
  })

  it('projects embedding cost from token count', () => {
    expect(projectEmbedCostUsd(100_000)).toBe(0.002)
  })

  it('enforces default spend cap', () => {
    expect(enforceEmbedSpendCap({ projectedCostUsd: 0.5 })).toEqual({
      allowed: true,
      capUsd: DEFAULT_MAX_EMBED_SPEND_USD,
    })
    expect(() =>
      enforceEmbedSpendCap({
        projectedCostUsd: 11,
      }),
    ).toThrow('exceeds cap')
  })
})
