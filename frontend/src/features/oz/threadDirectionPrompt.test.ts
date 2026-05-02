import { describe, expect, it } from 'vitest'
import { encode } from 'gpt-tokenizer'

import {
  buildOzThreadDirectionSummaryBlock,
  OZ_THREAD_DIRECTION_SUMMARY_MAX_TOKENS,
  resolveOzChatThreadId,
  truncateToOzDirectionSummaryTokens,
} from '../../../../backend/oz/threadDirectionPrompt'

describe('threadDirectionPrompt', () => {
  it('resolves thread id from conversation_id then context.threadId', () => {
    expect(
      resolveOzChatThreadId({
        message: 'x',
        conversation_id: 'conv-a',
        context: { threadId: 'ctx-b' },
      }),
    ).toBe('conv-a')
    expect(
      resolveOzChatThreadId({
        message: 'x',
        context: { threadId: 'ctx-b' },
      }),
    ).toBe('ctx-b')
    expect(resolveOzChatThreadId({ message: 'x' })).toBeUndefined()
  })

  it('truncates to max tokens (o200k) server-side', () => {
    const long = 'word '.repeat(5000)
    const out = truncateToOzDirectionSummaryTokens(long)
    expect(out.truncated).toBe(true)
    expect(encode(out.text).length).toBeLessThanOrEqual(OZ_THREAD_DIRECTION_SUMMARY_MAX_TOKENS)
  })

  it('builds a block from direction_text and structured_refs under token cap', () => {
    const built = buildOzThreadDirectionSummaryBlock({
      thread_id: 't1',
      tenant: 'demo',
      direction_text: 'Focus on siding SKUs.',
      structured_refs: [{ kind: 'sku', id: 'DK1' }],
      set_at: '',
      set_by: null,
    })
    expect(built).not.toBeNull()
    if (!built) return
    expect(built.block).toContain('Focus on siding')
    expect(built.block).toContain('Structured refs')
    expect(encode(built.block).length).toBeLessThanOrEqual(OZ_THREAD_DIRECTION_SUMMARY_MAX_TOKENS)
  })

  it('returns null when direction row is empty', () => {
    expect(
      buildOzThreadDirectionSummaryBlock({
        thread_id: 't1',
        tenant: 'demo',
        direction_text: '  ',
        structured_refs: [],
        set_at: '',
        set_by: null,
      }),
    ).toBeNull()
  })
})
