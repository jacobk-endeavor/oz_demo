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

  it('propagates trace id and parses runtime telemetry from SSE events', async () => {
    const traceId = 'trace-client-test-01'
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('x-oz-trace-id')).toBe(traceId)
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body.trace_id).toBe(traceId)
      expect(body.contract_version).toBe('2026-04-oz-chat-v1')

      return new Response(
        createSseBody([
          `data: ${JSON.stringify({ type: 'trace', stage: 'policy_gate', decision: 'agent', trace_id: traceId })}\n\n`,
          `data: ${JSON.stringify({
            type: 'tool_call',
            tool_call_id: 'tool-1',
            name: 'search_transcripts',
            trace_id: traceId,
          })}\n\n`,
          `data: ${JSON.stringify({
            type: 'tool_result',
            tool_call_id: 'tool-1',
            name: 'search_transcripts',
            ok: false,
            trace_id: traceId,
          })}\n\n`,
          `data: ${JSON.stringify({
            type: 'trace',
            stage: 'runtime_summary',
            decision: 'complete',
            details: { latency_ms: 87 },
            trace_id: traceId,
          })}\n\n`,
          `data: ${JSON.stringify({ type: 'done', message: 'ok', trace_id: traceId })}\n\n`,
        ]),
        {
          status: 200,
          headers: {
            'content-type': 'text/event-stream',
            'x-oz-trace-id': traceId,
          },
        },
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await postOzChat({
      text: 'hello',
      context: { priorUserMessages: [], priorExchanges: [] },
      ragScope: 'Jacob',
      traceId,
    })

    expect(result.reply).toBe('ok')
    expect(result.traceId).toBe(traceId)
    expect(result.telemetry.policyPath).toBe('agent')
    expect(result.telemetry.runtimeLatencyMs).toBe(87)
    expect(result.telemetry.toolCalls).toBe(1)
    expect(result.telemetry.toolFailures).toBe(1)
    expect(result.telemetry.toolLatencies.length).toBe(1)
  })

  it('invokes onPanelToolResult for each tool_result SSE frame', async () => {
    const seen: Record<string, unknown>[] = []
    const fetchMock = vi.fn(async () => {
      return new Response(
        createSseBody([
          'data: {"type":"tool_call","name":"display_table","tool_call_id":"t-panel"}\n\n',
          'data: {"type":"tool_result","name":"display_table","tool_call_id":"t-panel","ok":true,"summary":"x"}\n\n',
          'data: {"type":"done","reply":"done"}\n\n',
        ]),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await postOzChat({
      text: 'show table',
      context: { priorUserMessages: [], priorExchanges: [] },
      ragScope: 'Jacob',
      onPanelToolResult: (ev) => {
        seen.push(ev)
      },
    })

    expect(seen.length).toBe(1)
    expect(seen[0]?.name).toBe('display_table')
  })

  it('captures first availability trace tools_unavailable and reason', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        createSseBody([
          `data: ${JSON.stringify({
            type: 'trace',
            stage: 'runtime_summary',
            decision: 'availability',
            details: { tools_unavailable: ['run_python'], reason: 'runner_unreachable' },
          })}\n\n`,
          `data: ${JSON.stringify({
            type: 'trace',
            stage: 'runtime_summary',
            decision: 'availability',
            details: { tools_unavailable: ['run_python'], reason: 'feature_disabled' },
          })}\n\n`,
          'data: {"type":"done","reply":"ok"}\n\n',
        ]),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await postOzChat({
      text: 'hello',
      context: { priorUserMessages: [], priorExchanges: [] },
      ragScope: 'Jacob',
    })

    expect(result.reply).toBe('ok')
    expect(result.telemetry.toolsUnavailable).toEqual(['run_python'])
    expect(result.telemetry.sandboxUnavailableReason).toBe('runner_unreachable')
  })
})
