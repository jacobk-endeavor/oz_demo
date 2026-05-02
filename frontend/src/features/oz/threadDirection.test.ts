import { describe, expect, it } from 'vitest'
import { sanitizeThreadDirectionPut } from '../../../../backend/oz/threadDirectionNormalize'

describe('oz thread direction input normalization', () => {
  it('trims direction text like memory content', () => {
    expect(
      sanitizeThreadDirectionPut({
        direction_text: '  ship the spec  ',
        structured_refs: { bd: 'Oz-Demo-abp' },
        set_by: ' tester ',
      }),
    ).toEqual({
      direction_text: 'ship the spec',
      structured_refs: { bd: 'Oz-Demo-abp' },
      set_by: 'tester',
    })
  })

  it('defaults structured_refs and set_by when omitted', () => {
    const s = sanitizeThreadDirectionPut({ direction_text: 'x' })
    expect(s.structured_refs).toEqual([])
    expect(s.set_by).toBe('anonymous')
  })
})
