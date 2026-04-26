import { describe, expect, it } from 'vitest'
import { augmentUserMessageWithTableContext, type TableRowContextAttachment } from './tableRowContext'

describe('augmentUserMessageWithTableContext', () => {
  it('returns plain text when empty or no matching scope', () => {
    expect(augmentUserMessageWithTableContext('q', undefined)).toBe('q')
    const leadAtt: TableRowContextAttachment = {
      key: 'lead:u',
      scope: 'lead',
      rowId: 'u',
      displayIndex: 1,
      label: '<Row 1>',
      modelLine: 'z',
    }
    expect(augmentUserMessageWithTableContext('q', [leadAtt], { scopes: ['lumberyard'] })).toBe('q')
  })

  it('filters by scope', () => {
    const lead: TableRowContextAttachment = {
      key: 'lead:u',
      scope: 'lead',
      rowId: 'u',
      displayIndex: 2,
      label: '<Row 2>',
      modelLine: '(id `u`): only-lead',
    }
    const lum: TableRowContextAttachment = {
      key: 'lumberyard:a',
      scope: 'lumberyard',
      rowId: 'a',
      displayIndex: 1,
      label: '<Row 1>',
      modelLine: 'only-lumber',
    }
    const out = augmentUserMessageWithTableContext('question', [lead, lum], { scopes: ['lumberyard'] })
    expect(out).toContain('only-lumber')
    expect(out).not.toContain('only-lead')
    expect(out).toContain('question')
  })

  it('includes competitor scope when requested', () => {
    const comp: TableRowContextAttachment = {
      key: 'competitor:x',
      scope: 'competitor',
      rowId: 'x',
      displayIndex: 1,
      label: '<Row 1>',
      modelLine: 'competitor-line',
    }
    const out = augmentUserMessageWithTableContext('q', [comp], { scopes: ['competitor'] })
    expect(out).toContain('competitor-line')
  })
})
