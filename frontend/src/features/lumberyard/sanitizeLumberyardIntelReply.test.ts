import { describe, expect, it } from 'vitest'
import { sanitizeLumberyardIntelReply } from './sanitizeLumberyardIntelReply'

describe('sanitizeLumberyardIntelReply', () => {
  it('removes Remove statements… and optional (call id: …) on the same run', () => {
    const raw = `Here is a fact.\n\nRemove statements like this from the response. (call id: \`lumber-01-cedar-timbertech-diy\`)\n\nMore.`
    expect(sanitizeLumberyardIntelReply(raw)).toBe('Here is a fact.\nMore.')
  })

  it('removes duplicate remove lines and standalone (call id) line', () => {
    const raw =
      'A\n\nRemove statements like this from the response.\nRemove statements like this from the response. (call id: `lumber-01-cedar-timbertech-diy`)\n\nB'
    expect(sanitizeLumberyardIntelReply(raw).includes('Remove statements')).toBe(false)
    expect(sanitizeLumberyardIntelReply(raw)).toContain('A')
    expect(sanitizeLumberyardIntelReply(raw)).toContain('B')
  })

  it('removes a standalone call-id-only line', () => {
    const out = sanitizeLumberyardIntelReply("Intro.\n\n(call id: `lumber-99-test-id`)\n\nEnd.")
    expect(out).toBe('Intro.\n\nEnd.')
  })
})
