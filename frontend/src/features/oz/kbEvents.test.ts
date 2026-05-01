import { describe, expect, it } from 'vitest'
import { buildKbIngestedEvent, buildKbRefreshedEvent, emitKbEvent, KB_EVENT_VERSION } from './kbEvents'

describe('kbEvents', () => {
  it('builds kb.ingested event payload with event_version=1', () => {
    const event = buildKbIngestedEvent({
      source_id: 'abcdef123456',
      title: 'Deck Guide',
      chunk_ids: ['abc_00001'],
      locators: ['page=1'],
      replay: true,
    })
    expect(event).toEqual({
      event: 'kb.ingested',
      event_version: KB_EVENT_VERSION,
      source_id: 'abcdef123456',
      title: 'Deck Guide',
      chunk_ids: ['abc_00001'],
      locators: ['page=1'],
      replay: true,
    })
  })

  it('builds kb.refreshed event payload with event_version=1', () => {
    const event = buildKbRefreshedEvent({
      source_id: 'abcdef123456',
      summary: { added: 3, modified: 2, removed: 1 },
    })
    expect(event.event).toBe('kb.refreshed')
    expect(event.event_version).toBe(1)
    expect(event.summary).toEqual({ added: 3, modified: 2, removed: 1 })
  })

  it('retries publish to support at-least-once delivery', async () => {
    const attempts: number[] = []
    let counter = 0
    const publisher = {
      publish: async () => {
        counter += 1
        attempts.push(counter)
        if (counter < 3) throw new Error('transient')
      },
    }
    const delivered = await emitKbEvent({
      publisher,
      event: {
        event: 'kb.ingested',
        source_id: 'abcdef123456',
        title: 'Doc',
        chunk_ids: ['c1'],
        locators: ['page=1'],
      } as Omit<import('./kbEvents').KbEvent, 'event_version'>,
      maxAttempts: 3,
    })
    expect(delivered.attempts).toBe(3)
    expect(attempts).toEqual([1, 2, 3])
  })

  it('fails after max attempts', async () => {
    await expect(
      emitKbEvent({
        publisher: {
          publish: async () => {
            throw new Error('downstream unavailable')
          },
        },
        event: {
          event: 'kb.refreshed',
          source_id: 'abcdef123456',
          summary: { added: 1, modified: 0, removed: 0 },
          replay: true,
        } as Omit<import('./kbEvents').KbEvent, 'event_version'>,
        maxAttempts: 2,
      }),
    ).rejects.toThrow('failed to deliver kb.refreshed after 2 attempts')
  })
})
