import { describe, expect, it } from 'vitest'
import { runOzChatLoopAgenticOpenAi } from '../../../../backend/oz/chatRuntimeAgenticOpenAi'
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
  return `data: ${JSON.stringify(payload)}\n\n`
}

async function collect(iter: AsyncIterable<OzChatStreamEvent>): Promise<OzChatStreamEvent[]> {
  const out: OzChatStreamEvent[] = []
  for await (const ev of iter) out.push(ev)
  return out
}

describe('runOzChatLoopAgenticOpenAi', () => {
  it('emits a done with error when API key is missing', async () => {
    const events = await collect(
      runOzChatLoopAgenticOpenAi(
        { message: 'hi', contract_version: 'test' },
        { openai: { apiKey: '' } },
      ),
    )
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.finish_reason).toBe('error')
      expect(done.message.toLowerCase()).toContain('openai_api_key')
    }
  })

  it('streams content deltas as token events and ends with done on stop', async () => {
    const stream = buildSseStream([
      frame({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello ' } }] }),
      frame({ choices: [{ index: 0, delta: { content: 'world' } }] }),
      frame({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ])
    const fakeFetch = (async () =>
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })) as unknown as typeof fetch

    const events = await collect(
      runOzChatLoopAgenticOpenAi(
        { message: 'hi', contract_version: 'test' },
        { openai: { apiKey: 'sk-test', fetchImpl: fakeFetch } },
      ),
    )
    const tokens = events
      .filter((e) => e.type === 'token')
      .map((e) => (e.type === 'token' ? e.delta : ''))
      .join('')
    expect(tokens).toBe('Hello world')
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.finish_reason).toBe('stop')
      expect(done.message).toBe('Hello world')
    }
  })

  it('runs a tool_calls round-trip and continues until stop', async () => {
    const firstResponse = buildSseStream([
      frame({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                { index: 0, id: 'call_1', type: 'function', function: { name: 'wiki_grep', arguments: '' } },
              ],
            },
          },
        ],
      }),
      frame({
        choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"query":' } }] } }],
      }),
      frame({
        choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"voyage"}' } }] } }],
      }),
      frame({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
      'data: [DONE]\n\n',
    ])
    const secondResponse = buildSseStream([
      frame({ choices: [{ index: 0, delta: { content: 'Found it.' } }] }),
      frame({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ])

    let callIdx = 0
    const fakeFetch = (async () => {
      const body = callIdx === 0 ? firstResponse : secondResponse
      callIdx += 1
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as unknown as typeof fetch

    let calledWith: unknown = null
    const events = await collect(
      runOzChatLoopAgenticOpenAi(
        { message: 'voyage', contract_version: 'test' },
        {
          openai: { apiKey: 'sk-test', fetchImpl: fakeFetch },
          wiki: {
            registry: {
              async wiki_read() {
                return { path: 'x', exists: false } as unknown as never
              },
              async wiki_grep(payload) {
                calledWith = payload
                return { query: payload.query, hits: [] } as unknown as never
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
    expect(calledWith).toEqual({ query: 'voyage' })
    const toolCall = events.find((e) => e.type === 'tool_call')
    expect(toolCall?.type).toBe('tool_call')
    if (toolCall?.type === 'tool_call') {
      expect(toolCall.name).toBe('wiki_grep')
      expect(toolCall.arguments).toEqual({ query: 'voyage' })
    }
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.finish_reason).toBe('stop')
      expect(done.message).toBe('Found it.')
    }
  })

  it('includes thread_direction_summary in the OpenAI system message when provided', async () => {
    const stream = buildSseStream([
      frame({ choices: [{ index: 0, delta: { content: 'Ok.' } }] }),
      frame({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ])
    const bodies: string[] = []
    const fakeFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body === 'string') bodies.push(init.body)
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as unknown as typeof fetch

    await collect(
      runOzChatLoopAgenticOpenAi(
        {
          message: 'hi',
          contract_version: 'test',
          thread_direction_summary: '## Thread direction (oz_thread_direction)\n\nStay focused on trim.',
        },
        { openai: { apiKey: 'sk-test', fetchImpl: fakeFetch } },
      ),
    )

    expect(bodies.length).toBeGreaterThan(0)
    const payload = JSON.parse(bodies[0] as string) as {
      messages?: Array<{ role?: string; content?: string }>
    }
    const system = payload.messages?.find((m) => m.role === 'system')?.content ?? ''
    expect(system).toContain('Stay focused on trim')
    expect(system).toContain('Thread direction')
  })
})
