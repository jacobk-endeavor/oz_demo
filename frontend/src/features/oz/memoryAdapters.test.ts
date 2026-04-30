import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MEMORY_CONFIDENCE,
  DEFAULT_MEMORY_TTL_SECONDS,
  evaluateMemoryWritePolicy,
  sanitizeMemoryItem,
  sanitizeMemoryWrite,
} from '../../../../backend/oz/memoryAdapters'

describe('oz memory adapter guardrails', () => {
  it('fills safe defaults for confidence/provenance/ttl', () => {
    const sanitized = sanitizeMemoryItem({
      content: 'Remember customer preference',
    })
    expect(sanitized.confidence).toBe(DEFAULT_MEMORY_CONFIDENCE)
    expect(sanitized.provenance.length).toBeGreaterThan(0)
    expect(sanitized.ttl_seconds).toBe(DEFAULT_MEMORY_TTL_SECONDS)
  })

  it('denies writes below confidence threshold', () => {
    const candidate = sanitizeMemoryWrite({
      content: 'Uncertain memory candidate',
      confidence: 0.2,
      provenance: 'unit-test',
      ttl_seconds: 3600,
    })
    const policy = evaluateMemoryWritePolicy(candidate)
    expect(policy.allowed).toBe(false)
    expect(policy.reasons).toContain('confidence_below_minimum')
  })
})
