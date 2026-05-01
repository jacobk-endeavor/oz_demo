import { describe, expect, it } from 'vitest'
import { createOzToolSurface, runOzChatLoop, type OzChatStreamEvent } from '../../../../backend/oz/chatRuntime'

async function collectEvents(stream: AsyncGenerator<OzChatStreamEvent>): Promise<OzChatStreamEvent[]> {
  const events: OzChatStreamEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

describe('oz chat transcript tools runtime', () => {
  it('emits transcript tool call/result events and done citations', async () => {
    const traceId = 'trace-telemetry-001'
    const events = await collectEvents(
      runOzChatLoop(
        {
          message: 'what did this customer ask about lead times?',
          ragScope: 'Jacob',
          trace_id: traceId,
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
    expect(events.every((event) => event.trace_id === traceId)).toBe(true)
    expect(
      events.some((event) => event.type === 'trace' && event.stage === 'tool_latency' && event.decision === 'ok'),
    ).toBe(true)
    const runtimeSummary = events.find(
      (event) => event.type === 'trace' && event.stage === 'runtime_summary' && event.decision === 'complete',
    )
    expect(runtimeSummary).toBeTruthy()
    expect(runtimeSummary && 'details' in runtimeSummary ? runtimeSummary.details?.tools_ok : undefined).toBe(2)
    expect(runtimeSummary && 'details' in runtimeSummary ? runtimeSummary.details?.tools_failed : undefined).toBe(0)
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

  it('emits failure telemetry when transcript tool fails', async () => {
    const events = await collectEvents(
      runOzChatLoop(
        { message: 'force tool failure', trace_id: 'trace-failure-01' },
        {
          transcripts: {
            registry: {
              async search_transcripts() {
                throw new Error('search failed')
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

    expect(events.some((event) => event.type === 'tool_result' && event.name === 'search_transcripts' && !event.ok)).toBe(
      true,
    )
    const failureLatency = events.find(
      (event) =>
        event.type === 'trace' &&
        event.stage === 'tool_latency' &&
        event.decision === 'error' &&
        event.details?.tool_name === 'search_transcripts',
    )
    expect(failureLatency).toBeTruthy()
    const summary = events.find(
      (event) => event.type === 'trace' && event.stage === 'runtime_summary' && event.decision === 'complete',
    )
    expect(summary && 'details' in summary ? summary.details?.tools_failed : undefined).toBe(1)
  })

  it('exposes catalog_get and catalog_list in tool surface', async () => {
    const tools = createOzToolSurface(
      { message: 'catalog please' },
      {
        catalog: {
          registry: {
            async catalog_get(args) {
              return { sku: args.sku, found: true, record: { sku: args.sku }, citation: `[catalog:sku=${args.sku}]` }
            },
            async catalog_list() {
              return {
                filters: { top_n: 25 },
                total: 1,
                rows: [{ record: { sku: 'SKU-001' }, citation: '[catalog:sku=SKU-001]' }],
              }
            },
          },
        },
      },
    )

    const one = await tools.catalog_get({ sku: 'SKU-001' })
    const many = await tools.catalog_list({ top_n: 1 })
    expect(one.found).toBe(true)
    expect(many.total).toBe(1)
  })
})
