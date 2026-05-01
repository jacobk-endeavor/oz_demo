/**
 * Claude-driven chat runtime. Replacement for the hardcoded scaffold sequence
 * in chatRuntime.ts when `mode: 'agentic'` is requested. Reuses the existing
 * tool surface and tool definitions; the model decides which tools to call.
 *
 * Streaming protocol: yields the same `OzChatStreamEvent` types as the scaffold
 * so the UI client doesn't need to know which path produced the events.
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

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_AGENT_ITERATIONS = 12
const MAX_TOKENS_PER_RESPONSE = 4096
const TOOL_RESULT_CONTENT_CAP = 80_000

export type AgenticDependencies = RuntimeDependencies & {
  anthropic: {
    apiKey: string
    model?: string
    fetchImpl?: typeof fetch
  }
}

type AnthropicTool = {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

type AssistantContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

type ToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

type AnthropicMessage =
  | { role: 'user'; content: string | ToolResultBlock[] }
  | { role: 'assistant'; content: AssistantContentBlock[] }

function convertOpenAiToolsToAnthropic(): AnthropicTool[] {
  return ozChatOpenAiToolDefinitions().map((entry) => ({
    name: entry.function.name,
    description: entry.function.description,
    input_schema: entry.function.parameters as Record<string, unknown>,
  }))
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

function truncateForToolResult(value: unknown): string {
  try {
    const text = JSON.stringify(value)
    return text.length > TOOL_RESULT_CONTENT_CAP ? `${text.slice(0, TOOL_RESULT_CONTENT_CAP)}…[truncated]` : text
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return `__serialization_error: ${msg}`
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

type AnthropicStreamEvent =
  | { type: 'message_start'; message?: { id?: string; usage?: Record<string, unknown> } }
  | {
      type: 'content_block_start'
      index: number
      content_block:
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    }
  | {
      type: 'content_block_delta'
      index: number
      delta:
        | { type: 'text_delta'; text: string }
        | { type: 'input_json_delta'; partial_json: string }
    }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason?: string; stop_sequence?: string }; usage?: Record<string, unknown> }
  | { type: 'message_stop' }
  | { type: 'ping' }
  | { type: 'error'; error: { type: string; message: string } }

async function* parseAnthropicSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<AnthropicStreamEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const lines = frame.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const dataPayload = trimmed.slice(5).trim()
        if (!dataPayload || dataPayload === '[DONE]') continue
        try {
          yield JSON.parse(dataPayload) as AnthropicStreamEvent
        } catch {
          // Ignore malformed frames; Anthropic sometimes sends keep-alive pings as
          // bare comments. We've already filtered those above.
        }
      }
    }
  }
}

async function callAnthropicMessagesStream(
  fetchImpl: typeof fetch,
  apiKey: string,
  model: string,
  systemPrompt: string,
  tools: AnthropicTool[],
  messages: AnthropicMessage[],
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS_PER_RESPONSE,
      system: systemPrompt,
      tools,
      messages,
      stream: true,
    }),
  })
  if (!response.ok || !response.body) {
    const detail = await response.text()
    throw new Error(`Anthropic Messages API error (${response.status}): ${detail.slice(0, 400)}`)
  }
  return response.body
}

export async function* runOzChatLoopAgentic(
  request: OzChatRequest,
  deps: AgenticDependencies,
): AsyncGenerator<OzChatStreamEvent> {
  const now = deps.now ?? (() => new Date())
  const fetchImpl = deps.anthropic.fetchImpl ?? fetch
  const apiKey = deps.anthropic.apiKey
  const model = deps.anthropic.model ?? DEFAULT_MODEL
  let sequence = 0
  const ev = (): ReturnType<typeof makeBaseEvent> => makeBaseEvent(request, sequence++, now)

  if (!apiKey || !apiKey.trim()) {
    yield {
      ...ev(),
      type: 'done',
      message: 'Agentic mode is unavailable: ANTHROPIC_API_KEY is not set on the server.',
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
  const tools = convertOpenAiToolsToAnthropic()

  yield {
    ...ev(),
    type: 'trace',
    stage: 'policy_gate',
    decision: 'agent',
    details: { mode: 'agentic', model },
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

  const conversation: AnthropicMessage[] = [{ role: 'user', content: userText }]
  let finalText = ''
  let stopReason: string = 'end_turn'
  const startedAt = Date.now()

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    let stream: ReadableStream<Uint8Array>
    try {
      stream = await callAnthropicMessagesStream(fetchImpl, apiKey, model, systemPrompt, tools, conversation)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      yield { ...ev(), type: 'done', message: `Agent error: ${message}`, finish_reason: 'error' }
      return
    }

    const assistantBlocks: AssistantContentBlock[] = []
    const pendingToolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []
    let currentBlock:
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; rawInput: string }
      | null = null
    let iterationStop: string | null = null

    try {
      for await (const evt of parseAnthropicSseStream(stream)) {
        if (evt.type === 'content_block_start') {
          if (evt.content_block.type === 'text') {
            currentBlock = { type: 'text', text: evt.content_block.text ?? '' }
          } else if (evt.content_block.type === 'tool_use') {
            currentBlock = {
              type: 'tool_use',
              id: evt.content_block.id,
              name: evt.content_block.name,
              rawInput: '',
            }
          }
          continue
        }
        if (evt.type === 'content_block_delta') {
          if (evt.delta.type === 'text_delta' && currentBlock?.type === 'text') {
            currentBlock.text += evt.delta.text
            yield { ...ev(), type: 'token', delta: evt.delta.text }
          } else if (evt.delta.type === 'input_json_delta' && currentBlock?.type === 'tool_use') {
            currentBlock.rawInput += evt.delta.partial_json
          }
          continue
        }
        if (evt.type === 'content_block_stop') {
          if (currentBlock?.type === 'text') {
            assistantBlocks.push({ type: 'text', text: currentBlock.text })
            finalText += currentBlock.text
          } else if (currentBlock?.type === 'tool_use') {
            let parsedInput: Record<string, unknown> = {}
            if (currentBlock.rawInput.trim().length > 0) {
              try {
                parsedInput = JSON.parse(currentBlock.rawInput) as Record<string, unknown>
              } catch {
                parsedInput = { __raw: currentBlock.rawInput }
              }
            }
            assistantBlocks.push({
              type: 'tool_use',
              id: currentBlock.id,
              name: currentBlock.name,
              input: parsedInput,
            })
            pendingToolUses.push({ id: currentBlock.id, name: currentBlock.name, input: parsedInput })
          }
          currentBlock = null
          continue
        }
        if (evt.type === 'message_delta') {
          if (typeof evt.delta?.stop_reason === 'string') iterationStop = evt.delta.stop_reason
          continue
        }
        if (evt.type === 'error') {
          throw new Error(`${evt.error.type}: ${evt.error.message}`)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      yield { ...ev(), type: 'done', message: `Agent stream error: ${message}`, finish_reason: 'error' }
      return
    }

    conversation.push({ role: 'assistant', content: assistantBlocks })
    stopReason = iterationStop ?? 'end_turn'

    if (stopReason !== 'tool_use' || pendingToolUses.length === 0) {
      break
    }

    const toolResults: ToolResultBlock[] = []
    for (const toolUse of pendingToolUses) {
      const callId = toolUse.id || `tool-${randomUUID()}`
      yield {
        ...ev(),
        type: 'tool_call',
        tool_call_id: callId,
        name: toolUse.name,
        arguments: toolUse.input,
      }
      try {
        const result = await executeToolOnSurface(surface, toolUse.name, toolUse.input)
        yield {
          ...ev(),
          type: 'tool_result',
          tool_call_id: callId,
          name: toolUse.name,
          ok: true,
          summary: summarizeForTelemetry(result),
        }
        toolResults.push({ type: 'tool_result', tool_use_id: callId, content: truncateForToolResult(result) })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        yield {
          ...ev(),
          type: 'tool_result',
          tool_call_id: callId,
          name: toolUse.name,
          ok: false,
          summary: message,
        }
        toolResults.push({ type: 'tool_result', tool_use_id: callId, content: message, is_error: true })
      }
    }
    conversation.push({ role: 'user', content: toolResults })
  }

  yield {
    ...ev(),
    type: 'trace',
    stage: 'runtime_summary',
    decision: 'completed',
    details: { latency_ms: Math.max(0, Date.now() - startedAt), mode: 'agentic', model },
  }
  yield {
    ...ev(),
    type: 'done',
    message: finalText.trim() || '[Agent returned no text content.]',
    finish_reason: stopReason,
  }
}
