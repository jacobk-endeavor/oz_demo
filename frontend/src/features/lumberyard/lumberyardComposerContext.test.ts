import { describe, expect, it } from 'vitest'
import { augmentUserMessageWithTableContext } from '../../shared/tableRowContext'
import { makeLumberyardAttachment } from './lumberyardComposerContext'
import type { LumberyardCallRow } from './lumberyardTypes'

const sampleRow: LumberyardCallRow = {
  id: 'a1',
  source: 'call_recording',
  title: 'OSB load check',
  customerPersona: 'BuildCo — rep',
  customerName: 'BuildCo',
  location: 'Regional hub',
  callDate: '2025-01-10',
  productTags: ['OSB'],
  tags: [],
  notable: [],
  repPersona: 'Rep',
  transcript: '',
  audio: null,
  transcriptText: '',
  audioUrl: null,
  transcriptPath: '',
}

describe('lumberyardComposerContext', () => {
  it('makeLumberyardAttachment + augment (lumberyard scope) includes row labels and id for the model', () => {
    const a = makeLumberyardAttachment(sampleRow, 3)
    expect(a.key).toBe('lumberyard:a1')
    const out = augmentUserMessageWithTableContext('What revenue is implied?', [a], {
      scopes: ['lumberyard'],
    })
    expect(out).toContain('<Row 3>')
    expect(out).toContain('`a1`')
    expect(out).toContain('BuildCo')
    expect(out).toContain('What revenue is implied?')
  })
})
