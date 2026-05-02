import { describe, expect, it } from 'vitest'
import { threadDirectionUrl } from './threadDirectionApi'

describe('threadDirectionUrl', () => {
  it('encodes thread id for path segments', () => {
    expect(threadDirectionUrl('scope/a')).toBe('/api/oz/chat/thread/scope%2Fa/direction')
  })

  it('supports alphanumeric ids', () => {
    expect(threadDirectionUrl('int_001')).toBe('/api/oz/chat/thread/int_001/direction')
  })
})
