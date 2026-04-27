import { describe, expect, it } from 'vitest'
import { parseLumberyardCallTranscript } from './callTranscriptFormat'

describe('parseLumberyardCallTranscript', () => {
  it('splits header lines and rep/customer turns', () => {
    const raw = `# Title: Sample call
# Rep: Jordan — Russin
# Customer: Morgan — contractor
# Notable: Deck refresh

Jordan [rep]: Line one.
Morgan [customer]: Line two.`

    const p = parseLumberyardCallTranscript(raw)
    expect(p.mode).toBe('structured')
    if (p.mode !== 'structured') return
    expect(p.header).toEqual([
      { key: 'Title', value: 'Sample call' },
      { key: 'Rep', value: 'Jordan — Russin' },
      { key: 'Customer', value: 'Morgan — contractor' },
      { key: 'Notable', value: 'Deck refresh' },
    ])
    expect(p.turns).toEqual([
      { speaker: 'Jordan', role: 'rep', text: 'Line one.' },
      { speaker: 'Morgan', role: 'customer', text: 'Line two.' },
    ])
    expect(p.remainder).toBe('')
  })

  it('returns raw for non-demo plain text', () => {
    const p = parseLumberyardCallTranscript('Just a paragraph.\n\nNo structure.')
    expect(p.mode).toBe('raw')
    if (p.mode !== 'raw') return
    expect(p.raw).toContain('Just a paragraph')
  })
})
