import { describe, expect, it } from 'vitest'
import { runOzChatLoop, type OzChatStreamEvent } from '../../../../backend/oz/chatRuntime'

async function collectEvents(stream: AsyncGenerator<OzChatStreamEvent>): Promise<OzChatStreamEvent[]> {
  const events: OzChatStreamEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

describe('oz chat transcript tools runtime', () => {
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
