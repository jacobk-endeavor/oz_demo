import { afterEach, describe, expect, it, vi } from 'vitest'
import { postOzChat } from './ozChatClient'

function createSseBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame))
      controller.close()
    },
  })
}

describe('postOzChat SSE stream parsing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('supports contract event types and returns done reply text', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        createSseBody([
          'data: {"type":"trace","stage":"policy_gate","decision":"agent"}\n\n',
          'data: {"type":"tool_call","name":"search_transcripts","tool_call_id":"tool-1","arguments":{"query":"lead time"}}\n\n',
          'data: {"type":"tool_result","name":"search_transcripts","tool_call_id":"tool-1","ok":true}\n\n',
          'data: {"type":"token","delta":"partial token"}\n\n',
          'data: {"type":"done","reply":"final contract reply"}\n\n',
        ]),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await postOzChat({
      text: 'what did the customer ask',
      context: { priorUserMessages: [], priorExchanges: [] },
      ragScope: 'Jacob',
    })

    expect(result.reply).toBe('final contract reply')
  })

  it('falls back to token aggregation when done has no message', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        createSseBody([
          'data: {"type":"token","delta":"Oz runtime "}\n\n',
          'data: {"type":"token","delta":"token stream"}\n\n',
          'data: {"type":"done","finish_reason":"stop"}\n\n',
        ]),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await postOzChat({
      text: 'ping',
      context: { priorUserMessages: [], priorExchanges: [] },
      ragScope: 'Jacob',
    })

    expect(result.reply).toBe('Oz runtime token stream')
  })
})
