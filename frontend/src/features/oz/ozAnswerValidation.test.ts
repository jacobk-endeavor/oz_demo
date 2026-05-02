import { describe, expect, it } from 'vitest'
import { sanitizeOzAnswer, validateOzAnswer } from '../../../../shared/oz/ozAnswerValidation'

describe('validateOzAnswer', () => {
  it('passes plain prose without numerics or ASCII quotes', () => {
    const r = validateOzAnswer('Hello world. No facts here.')
    expect(r.ok).toBe(true)
  })

  it('flags money without citation', () => {
    const r = validateOzAnswer('Revenue hit $1.2M last quarter. We are growing.')
    expect(r.ok).toBe(false)
    expect(r.nakedNumericSentences.length).toBeGreaterThan(0)
  })

  it('clears when a catalog citation is on the same sentence', () => {
    const r = validateOzAnswer('Revenue hit $1.2M [catalog:line=DK-MBC-VOYAGE] last quarter.')
    expect(r.ok).toBe(true)
  })

  it('flags double-quoted span without following citation', () => {
    const r = validateOzAnswer('The rep said "we will match pricing" and left.')
    expect(r.ok).toBe(false)
    expect(r.uncitedQuoteSpans.length).toBe(1)
  })

  it('clears when a doc citation immediately follows the quote', () => {
    const r = validateOzAnswer('The rep said "we will match pricing" [doc:abc_p001_00000].')
    expect(r.ok).toBe(true)
  })
})

describe('sanitizeOzAnswer', () => {
  it('removes uncited numeric sentences and leaves the rest', () => {
    const r = validateOzAnswer('Good sentence. Bad costs $50.')
    expect(r.ok).toBe(false)
    const out = sanitizeOzAnswer('Good sentence. Bad costs $50.', r)
    expect(out.toLowerCase()).not.toContain('$50')
    expect(out.toLowerCase()).toContain('good sentence')
  })

  it('drops uncited quotes', () => {
    const r = validateOzAnswer('x "y" z')
    const out = sanitizeOzAnswer('x "y" z', r)
    expect(out).not.toContain('"')
  })
})
