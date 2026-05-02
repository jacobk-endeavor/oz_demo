/**
 * OpenAI Chat Completions tool-use loop. Mirror of chatRuntimeAgentic.ts but
 * targeting `https://api.openai.com/v1/chat/completions`. The chat tool
 * definitions in ozChatToolRegistry.ts are already OpenAI-shaped so no
 * schema adapter is needed here.
 *
 * Streaming protocol: yields the same `OzChatStreamEvent` types as the
 * scaffold + Anthropic paths, so the UI client doesn't care which provider
 * served the turn.
 */
import { randomUUID } from 'node:crypto'
import {
  OZ_CHAT_CONTRACT_VERSION,
  createOzToolSurface,
  type OzChatRequest,
  type OzChatStreamEvent,
  type OzToolSurface,
  type RuntimeDependencies,
} from './chatRuntime'
import { OZ_CHAT_SYSTEM_PROMPT, ozChatOpenAiToolDefinitions } from './ozChatToolRegistry'
import { parseOzChatRoutePrefix } from './ozChatRoutePrefixes'
import { truncateForToolResult } from './toolResultTruncate'

const DEFAULT_MODEL = 'gpt-4o-mini'
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_AGENT_ITERATIONS = 12

export type OpenAiAgenticDependencies = RuntimeDependencies & {
  openai: {
    apiKey: string
    model?: string
    fetchImpl?: typeof fetch
  }
}

type OpenAiToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type OpenAiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

type OpenAiStreamChunk = {
  id?: string
  choices?: Array<{
    index?: number
    delta?: {
      role?: string
      content?: string
      tool_calls?: Array<{
        index: number
        id?: string
        type?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string
  }>
}

function nowIso(now: () => Date): string {
  return now().toISOString()
}

function makeBaseEvent(request: OzChatRequest, sequence: number, now: () => Date) {
  return {
    contract_version: request.contract_version || OZ_CHAT_CONTRACT_VERSION,
    sequence,
    timestamp: nowIso(now),
    ...(request.trace_id ? { trace_id: request.trace_id } : {}),
    ...(request.conversation_id ? { conversation_id: request.conversation_id } : {}),
  }
}

function summarizeForTelemetry(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 500)
  } catch {
    return String(value).slice(0, 500)
  }
}

async function executeToolOnSurface(
  surface: OzToolSurface,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const fn = (surface as unknown as Record<string, (arg: unknown) => Promise<unknown>>)[name]
  if (typeof fn !== 'function') {
    throw new Error(`Unknown tool: ${name}`)
  }
  return fn.call(surface, input)
}

async function* parseOpenAiSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<OpenAiStreamChunk> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        yield JSON.parse(payload) as OpenAiStreamChunk
      } catch {
        // ignore malformed frames
      }
    }
  }
}

async function callOpenAiChatStream(
  fetchImpl: typeof fetch,
  apiKey: string,
  model: string,
  tools: ReturnType<typeof ozChatOpenAiToolDefinitions>,
  messages: OpenAiMessage[],
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetchImpl(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      stream: true,
    }),
  })
  if (!response.ok || !response.body) {
    const detail = await response.text()
    throw new Error(`OpenAI Chat API error (${response.status}): ${detail.slice(0, 400)}`)
  }
  return response.body
}

export async function* runOzChatLoopAgenticOpenAi(
  request: OzChatRequest,
  deps: OpenAiAgenticDependencies,
): AsyncGenerator<OzChatStreamEvent> {
  const now = deps.now ?? (() => new Date())
  const fetchImpl = deps.openai.fetchImpl ?? fetch
  const apiKey = deps.openai.apiKey
  const model = deps.openai.model ?? DEFAULT_MODEL
  let sequence = 0
  const ev = (): ReturnType<typeof makeBaseEvent> => makeBaseEvent(request, sequence++, now)

  if (!apiKey || !apiKey.trim()) {
    yield {
      ...ev(),
      type: 'done',
      message: 'Agentic mode is unavailable: OPENAI_API_KEY is not set on the server.',
      finish_reason: 'error',
    }
    return
  }

  const surface = createOzToolSurface(request, deps)
  const parsedRoute = parseOzChatRoutePrefix(String(request.message ?? ''))
  const systemPrompt =
    parsedRoute.systemNote != null
      ? `${OZ_CHAT_SYSTEM_PROMPT}\n\n${parsedRoute.systemNote}`
      : OZ_CHAT_SYSTEM_PROMPT
  const userText = parsedRoute.bareMessage || String(request.message ?? '')
  const tools = ozChatOpenAiToolDefinitions()

  yield {
    ...ev(),
    type: 'trace',
    stage: 'policy_gate',
    decision: 'agent',
    details: { mode: 'agentic', provider: 'openai', model },
  }
  if (parsedRoute.kind !== 'none') {
    yield {
      ...ev(),
      type: 'trace',
      stage: 'route_prefix',
      decision: parsedRoute.kind,
      details: { systemNote: parsedRoute.systemNote },
    }
  }

  const messages: OpenAiMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ]
  let finalText = ''
  let stopReason = 'stop'
  const startedAt = Date.now()

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    let stream: ReadableStream<Uint8Array>
    try {
      stream = await callOpenAiChatStream(fetchImpl, apiKey, model, tools, messages)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      yield { ...ev(), type: 'done', message: `Agent error: ${message}`, finish_reason: 'error' }
      return
    }

    let assistantText = ''
    // Tool calls arrive as streamed deltas; key by `index` to assemble across chunks.
    const pendingToolCalls = new Map<number, { id: string; name: string; arguments: string }>()
    let iterationStop: string | null = null

    try {
      for await (const chunk of parseOpenAiSseStream(stream)) {
        const choice = chunk.choices?.[0]
        if (!choice) continue
        const delta = choice.delta ?? {}
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          assistantText += delta.content
          yield { ...ev(), type: 'token', delta: delta.content }
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index
            const existing = pendingToolCalls.get(idx) ?? { id: '', name: '', arguments: '' }
            if (tc.id) existing.id = tc.id
            if (tc.function?.name) existing.name = tc.function.name
            if (tc.function?.arguments) existing.arguments += tc.function.arguments
            pendingToolCalls.set(idx, existing)
          }
        }
        if (typeof choice.finish_reason === 'string') iterationStop = choice.finish_reason
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      yield { ...ev(), type: 'done', message: `Agent stream error: ${message}`, finish_reason: 'error' }
      return
    }

    if (assistantText) finalText += assistantText

    const toolCallList = [...pendingToolCalls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, v]) => v)
      .filter((v) => v.id && v.name)

    const assistantMessage: OpenAiMessage = {
      role: 'assistant',
      content: assistantText ? assistantText : null,
      ...(toolCallList.length > 0
        ? {
            tool_calls: toolCallList.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments || '{}' },
            })),
          }
        : {}),
    }
    messages.push(assistantMessage)
    stopReason = iterationStop ?? 'stop'

    if (stopReason !== 'tool_calls' || toolCallList.length === 0) break

    for (const tc of toolCallList) {
      const callId = tc.id || `tool-${randomUUID()}`
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = tc.arguments ? (JSON.parse(tc.arguments) as Record<string, unknown>) : {}
      } catch {
        parsedArgs = { __raw: tc.arguments }
      }
      yield {
        ...ev(),
        type: 'tool_call',
        tool_call_id: callId,
        name: tc.name,
        arguments: parsedArgs,
      }
      try {
        const result = await executeToolOnSurface(surface, tc.name, parsedArgs)
        yield {
          ...ev(),
          type: 'tool_result',
          tool_call_id: callId,
          name: tc.name,
          ok: true,
          summary: summarizeForTelemetry(result),
        }
        messages.push({
          role: 'tool',
          tool_call_id: callId,
          content: truncateForToolResult(result, tc.name),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        yield {
          ...ev(),
          type: 'tool_result',
          tool_call_id: callId,
          name: tc.name,
          ok: false,
          summary: message,
        }
        messages.push({ role: 'tool', tool_call_id: callId, content: `[error] ${message}` })
      }
    }
  }

  yield {
    ...ev(),
    type: 'trace',
    stage: 'runtime_summary',
    decision: 'completed',
    details: { latency_ms: Math.max(0, Date.now() - startedAt), mode: 'agentic', provider: 'openai', model },
  }
  yield {
    ...ev(),
    type: 'done',
    message: finalText.trim() || '[Agent returned no text content.]',
    finish_reason: stopReason,
  }
}
