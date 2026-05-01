import { describe, expect, it } from 'vitest'
import { parseOzChatRoutePrefix } from '../../../../backend/oz/ozChatRoutePrefixes'

describe('parseOzChatRoutePrefix', () => {
  it('returns none for plain text', () => {
    const r = parseOzChatRoutePrefix('what is the warranty on Voyage?')
    expect(r.kind).toBe('none')
    expect(r.bareMessage).toBe('what is the warranty on Voyage?')
    expect(r.systemNote).toBeNull()
  })

  it('strips /vector and attaches system note', () => {
    const r = parseOzChatRoutePrefix('/vector decking colors')
    expect(r.kind).toBe('vector')
    expect(r.bareMessage).toBe('decking colors')
    expect(r.systemNote).toContain('kb_search')
  })

  it('is case-insensitive on command', () => {
    const r = parseOzChatRoutePrefix('/WIKI concepts/install')
    expect(r.kind).toBe('wiki')
    expect(r.bareMessage).toBe('concepts/install')
  })
})
