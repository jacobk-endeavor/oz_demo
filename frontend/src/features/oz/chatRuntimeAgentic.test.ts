import { describe, expect, it } from 'vitest'
import { runOzChatLoopAgentic } from '../../../../backend/oz/chatRuntimeAgentic'
import type { OzChatStreamEvent } from '../../../../backend/oz/chatRuntime'

function buildSseStream(frames: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const frame of frames) controller.enqueue(encoder.encode(frame))
      controller.close()
    },
  })
}

function frame(payload: object): string {
  return `event: ${(payload as { type: string }).type}\ndata: ${JSON.stringify(payload)}\n\n`
}

async function collect(iter: AsyncIterable<OzChatStreamEvent>): Promise<OzChatStreamEvent[]> {
  const out: OzChatStreamEvent[] = []
  for await (const ev of iter) out.push(ev)
  return out
}

describe('runOzChatLoopAgentic', () => {
  it('emits a done with error when API key is missing', async () => {
    const events = await collect(
      runOzChatLoopAgentic(
        { message: 'hi', contract_version: 'test' },
        {
          anthropic: { apiKey: '' },
        },
      ),
    )
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.finish_reason).toBe('error')
      expect(done.message.toLowerCase()).toContain('anthropic_api_key')
    }
  })

  it('streams text deltas as token events and ends with done on end_turn', async () => {
    const stream = buildSseStream([
      frame({ type: 'message_start', message: { id: 'msg_1' } }),
      frame({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } }),
      frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'world' } }),
      frame({ type: 'content_block_stop', index: 0 }),
      frame({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
      frame({ type: 'message_stop' }),
    ])

    const fakeFetch = (async () =>
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })) as unknown as typeof fetch

    const events = await collect(
      runOzChatLoopAgentic(
        { message: 'hi', contract_version: 'test' },
        {
          anthropic: { apiKey: 'sk-test', fetchImpl: fakeFetch, model: 'claude-test' },
        },
      ),
    )

    const tokens = events.filter((e) => e.type === 'token').map((e) => (e.type === 'token' ? e.delta : ''))
    expect(tokens.join('')).toBe('Hello world')
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.finish_reason).toBe('end_turn')
      expect(done.message).toBe('Hello world')
    }
  })

  it('runs a tool_use round-trip and continues until end_turn', async () => {
    const firstResponse = buildSseStream([
      frame({ type: 'message_start', message: { id: 'msg_1' } }),
      frame({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'tu_1', name: 'wiki_grep', input: {} },
      }),
      frame({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"query":' },
      }),
      frame({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '"voyage"}' },
      }),
      frame({ type: 'content_block_stop', index: 0 }),
      frame({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }),
      frame({ type: 'message_stop' }),
    ])
    const secondResponse = buildSseStream([
      frame({ type: 'message_start', message: { id: 'msg_2' } }),
      frame({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Found it.' } }),
      frame({ type: 'content_block_stop', index: 0 }),
      frame({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
      frame({ type: 'message_stop' }),
    ])

    let callIdx = 0
    const fakeFetch = (async () => {
      const body = callIdx === 0 ? firstResponse : secondResponse
      callIdx += 1
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as unknown as typeof fetch

    let wikiGrepCalledWith: unknown = null
    const events = await collect(
      runOzChatLoopAgentic(
        { message: 'voyage', contract_version: 'test' },
        {
          anthropic: { apiKey: 'sk-test', fetchImpl: fakeFetch },
          wiki: {
            registry: {
              async wiki_read() {
                return { path: 'x', exists: false } as unknown as never
              },
              async wiki_grep(payload) {
                wikiGrepCalledWith = payload
                return { query: payload.query, hits: [{ path: 'wiki/sources/voyage.md', score: 1, preview: '…' }] } as unknown as never
              },
              async wiki_log() {
                return { entries: [] } as unknown as never
              },
            },
          },
        },
      ),
    )

    expect(callIdx).toBe(2)
    expect(wikiGrepCalledWith).toEqual({ query: 'voyage' })

    const toolCall = events.find((e) => e.type === 'tool_call')
    const toolResult = events.find((e) => e.type === 'tool_result')
    expect(toolCall?.type).toBe('tool_call')
    if (toolCall?.type === 'tool_call') {
      expect(toolCall.name).toBe('wiki_grep')
      expect(toolCall.arguments).toEqual({ query: 'voyage' })
    }
    expect(toolResult?.type).toBe('tool_result')
    if (toolResult?.type === 'tool_result') {
      expect(toolResult.ok).toBe(true)
      expect(toolResult.name).toBe('wiki_grep')
    }
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.finish_reason).toBe('end_turn')
      expect(done.message).toBe('Found it.')
    }
  })

  it('includes thread_direction_summary in the Anthropic system field when provided', async () => {
    const stream = buildSseStream([
      frame({ type: 'message_start', message: { id: 'msg_1' } }),
      frame({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Ok.' } }),
      frame({ type: 'content_block_stop', index: 0 }),
      frame({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
      frame({ type: 'message_stop' }),
    ])
    const bodies: string[] = []
    const fakeFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body === 'string') bodies.push(init.body)
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as unknown as typeof fetch

    await collect(
      runOzChatLoopAgentic(
        {
          message: 'hi',
          contract_version: 'test',
          thread_direction_summary: '## Thread direction (oz_thread_direction)\n\nPrefer cedar references.',
        },
        {
          anthropic: { apiKey: 'sk-test', fetchImpl: fakeFetch, model: 'claude-test' },
        },
      ),
    )

    expect(bodies.length).toBeGreaterThan(0)
    const payload = JSON.parse(bodies[0] as string) as { system?: string }
    expect(payload.system ?? '').toContain('Prefer cedar references')
    expect(payload.system ?? '').toContain('Thread direction')
  })
})
