import { describe, expect, it } from 'vitest'
import { runOzChatLoop, type OzChatStreamEvent } from '../../../../backend/oz/chatRuntime'

async function collectEvents(stream: AsyncGenerator<OzChatStreamEvent>): Promise<OzChatStreamEvent[]> {
  const events: OzChatStreamEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

describe('oz chat transcript tools runtime', () => {
  it('emits contract-compliant stream events for the tool loop', async () => {
    const events = await collectEvents(
      runOzChatLoop(
        {
          message: 'summarize customer request',
          trace_id: 'trace-123',
          conversation_id: 'conv-456',
          ragScope: 'Jacob',
        },
        {
          now: () => new Date('2026-04-30T00:00:00.000Z'),
          transcripts: {
            registry: {
              async search_transcripts() {
                return {
                  query: 'summarize customer request',
                  scope: 'Jacob',
                  hits: [
                    {
                      call_id: 'call_002',
                      chunk_id: 'chunk_002',
                      chunk_index: 1,
                      owner_user_id: 'Jacob',
                      content: 'Customer requested lead time details.',
                    },
                  ],
                  provenance: {
                    source: 'postgres_call_rag_chunks',
                    retrieval: 'semantic_vector',
                    top_k: 8,
                  },
                  citations: [{ kind: 'transcript_chunk', id: 'chunk_002', label: 'call_002#1' }],
                }
              },
              async read_transcript() {
                return {
                  call_id: 'call_002',
                  scope: 'Jacob',
                  chunks: [
                    {
                      chunk_id: 'chunk_002',
                      chunk_index: 1,
                      owner_user_id: 'Jacob',
                      content: 'Customer requested lead time details.',
                    },
                  ],
                  provenance: { source: 'postgres_call_rag_chunks', retrieval: 'call_lookup' },
                  citations: [{ kind: 'transcript_chunk', id: 'chunk_002', label: 'call_002#1' }],
                }
              },
            },
          },
        },
      ),
    )

    expect(events.length).toBeGreaterThan(0)
    expect(events[0]?.type).toBe('trace')
    expect(events.some((event) => event.type === 'token')).toBe(true)
    expect(events.some((event) => event.type === 'tool_call')).toBe(true)
    expect(events.some((event) => event.type === 'tool_result')).toBe(true)
    expect(events.some((event) => event.type === 'done')).toBe(true)

    for (const [index, event] of events.entries()) {
      expect(event.contract_version).toBe('2026-04-oz-chat-v1')
      expect(event.sequence).toBe(index)
      expect(event.timestamp).toBe('2026-04-30T00:00:00.000Z')
      expect(event.trace_id).toBe('trace-123')
      expect(event.conversation_id).toBe('conv-456')
    }

    const toolCallIds = new Set(events.filter((event) => event.type === 'tool_call').map((event) => event.tool_call_id))
    const toolResultIds = events.filter((event) => event.type === 'tool_result').map((event) => event.tool_call_id)
    expect(toolResultIds.every((toolCallId) => toolCallIds.has(toolCallId))).toBe(true)
  })

  it('emits transcript tool call/result events and done citations', async () => {
    const events = await collectEvents(
      runOzChatLoop(
        {
          message: 'what did this customer ask about lead times?',
          ragScope: 'Jacob',
        },
        {
          transcripts: {
            registry: {
              async search_transcripts() {
                return {
                  query: 'lead times',
                  scope: 'Jacob',
                  hits: [
                    {
                      call_id: 'call_001',
                      chunk_id: 'chunk_001',
                      chunk_index: 2,
                      owner_user_id: 'Jacob',
                      content: 'Customer asked for 2x6 lead time and delivery window.',
                    },
                  ],
                  provenance: {
                    source: 'postgres_call_rag_chunks',
                    retrieval: 'semantic_vector',
                    top_k: 8,
                  },
                  citations: [{ kind: 'transcript_chunk', id: 'chunk_001', label: 'call_001#2' }],
                }
              },
              async read_transcript() {
                return {
                  call_id: 'call_001',
                  scope: 'Jacob',
                  chunks: [
                    {
                      chunk_id: 'chunk_001',
                      chunk_index: 2,
                      owner_user_id: 'Jacob',
                      content: 'Customer asked for 2x6 lead time and delivery window.',
                    },
                  ],
                  provenance: { source: 'postgres_call_rag_chunks', retrieval: 'call_lookup' },
                  citations: [{ kind: 'transcript_chunk', id: 'chunk_001', label: 'call_001#2' }],
                }
              },
            },
          },
        },
      ),
    )

    expect(events.some((event) => event.type === 'tool_call' && event.name === 'search_transcripts')).toBe(true)
    expect(events.some((event) => event.type === 'tool_result' && event.name === 'search_transcripts')).toBe(true)
    expect(events.some((event) => event.type === 'tool_call' && event.name === 'read_transcript')).toBe(true)
    const done = events.find((event) => event.type === 'done')
    expect(done).toBeTruthy()
    expect(done && 'citations' in done ? done.citations?.[0]?.id : undefined).toBe('chunk_001')
  })

  it('returns no-hit reply when transcript search has no matches', async () => {
    const events = await collectEvents(
      runOzChatLoop(
        { message: 'unmatched query' },
        {
          transcripts: {
            registry: {
              async search_transcripts() {
                return {
                  query: 'unmatched query',
                  scope: 'admin',
                  hits: [],
                  provenance: { source: 'stub', retrieval: 'none', top_k: 8 },
                  citations: [],
                }
              },
              async read_transcript() {
                return {
                  call_id: 'n/a',
                  scope: 'admin',
                  chunks: [],
                  provenance: { source: 'stub', retrieval: 'call_lookup' },
                  citations: [],
                }
              },
            },
          },
        },
      ),
    )

    const done = events.find((event) => event.type === 'done')
    expect(done).toBeTruthy()
    expect(done && 'message' in done ? done.message : '').toContain('no hits')
    expect(events.some((event) => event.type === 'tool_call' && event.name === 'read_transcript')).toBe(false)
  })
})
