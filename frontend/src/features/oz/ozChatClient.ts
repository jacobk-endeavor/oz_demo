import type { OzChatTurnContext } from '../../shared/ui'

// Single canonical transport path for non-hardcoded Oz chat turns.
const OZ_CHAT_PATH = '/api/oz/chat'
const OZ_CHAT_CONFIG_PATH = '/api/oz/chat/config'

export type OzChatRuntimeKind = 'scaffold' | 'agentic'
export type OzChatAgenticProvider = 'openai' | 'anthropic' | null

export type OzChatRuntimeConfig = {
  chat: {
    runtime: OzChatRuntimeKind
    agentic: { provider?: 'auto' | 'openai' | 'anthropic'; model?: string } | null
  }
  agentic_available: boolean
  agentic_provider: OzChatAgenticProvider
  providers_available: { openai: boolean; anthropic: boolean }
}

export async function fetchOzChatConfig(): Promise<OzChatRuntimeConfig | null> {
  try {
    const response = await fetch(OZ_CHAT_CONFIG_PATH, { headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    return (await response.json()) as OzChatRuntimeConfig
  } catch {
    return null
  }
}

export type OzChatClientRequest = {
  text: string
  context: OzChatTurnContext
  ragScope?: string
  traceId?: string
  /** Per-turn override of server-side YAML default. */
  mode?: OzChatRuntimeKind
  /**
   * When unified chat streams `tool_result` events, invoked for each frame after telemetry accounting.
   * Used to stash `display_table` / `display_panel` payloads (see useOzChatStream).
   */
  onPanelToolResult?: (event: Record<string, unknown>) => void
}

export type OzSandboxUnavailableReason = 'runner_unreachable' | 'feature_disabled'

export type OzChatClientResponse = {
  reply: string
  // Correlates frontend and backend logs/telemetry for a single turn.
  traceId: string
  telemetry: {
    policyPath?: string
    runtimeLatencyMs?: number
    toolCalls: number
    toolFailures: number
    toolLatencies: Array<{ tool: string; latencyMs: number }>
    /** First `runtime_summary` / availability trace with `details.tools_unavailable` (unified chat). */
    toolsUnavailable?: string[]
    sandboxUnavailableReason?: OzSandboxUnavailableReason
  }
}

function extractReplyFromJson(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (typeof record.reply === 'string' && record.reply.trim()) return record.reply.trim()
  if (typeof record.message === 'string' && record.message.trim()) return record.message.trim()
  if (typeof record.output_text === 'string' && record.output_text.trim()) return record.output_text.trim()
  return null
}

function createTraceId(): string {
  // Browser UUID when available, deterministic fallback otherwise.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `oz-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

type ParsedSseLine = { token?: string; doneReply?: string; event?: Record<string, unknown> }

function parseSseDataLine(dataLine: string): ParsedSseLine {
  const trimmed = dataLine.trim()
  if (!trimmed) return {}
  if (trimmed === '[DONE]') return {}
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const type = typeof parsed.type === 'string' ? parsed.type : ''
    // Runtime emits explicit token events for stream assembly.
    if (type === 'token') {
      const token =
        typeof parsed.token === 'string'
          ? parsed.token
          : typeof parsed.text === 'string'
            ? parsed.text
            : typeof parsed.delta === 'string'
              ? parsed.delta
              : ''
      return token ? { token, event: parsed } : { event: parsed }
    }
    if (type === 'done') {
      // `done` carries authoritative final message when provided.
      const doneReply =
        typeof parsed.reply === 'string'
          ? parsed.reply
          : typeof parsed.text === 'string'
            ? parsed.text
            : typeof parsed.message === 'string'
              ? parsed.message
            : undefined
      return doneReply && doneReply.trim() ? { doneReply: doneReply.trim(), event: parsed } : { event: parsed }
    }
    if (typeof parsed.token === 'string' && parsed.token) return { token: parsed.token, event: parsed }
    return { event: parsed }
  } catch {
    // If the frame is plain text, treat as token text for resilience.
    return { token: trimmed }
  }
}

async function readSseReply(
  stream: ReadableStream<Uint8Array>,
  options?: { onPanelToolResult?: (event: Record<string, unknown>) => void },
): Promise<{ reply: string; traceId?: string; telemetry: OzChatClientResponse['telemetry'] }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let tokenText = ''
  let doneReply: string | null = null
  let traceId: string | undefined
  const pendingToolCalls = new Map<string, { name: string; startedAt: number }>()
  const telemetry: OzChatClientResponse['telemetry'] = {
    toolCalls: 0,
    toolFailures: 0,
    toolLatencies: [],
  }
  let capturedSandboxTrace = false

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const dataLines = frame
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5))

      for (const dataLine of dataLines) {
        const parsed = parseSseDataLine(dataLine)
        if (parsed.token) tokenText += parsed.token
        if (parsed.doneReply) doneReply = parsed.doneReply
        const event = parsed.event
        if (!event) continue
        // Preserve server trace id if emitted mid-stream.
        if (typeof event.trace_id === 'string' && event.trace_id.trim()) traceId = event.trace_id.trim()
        if (event.type === 'tool_call' && typeof event.tool_call_id === 'string' && typeof event.name === 'string') {
          telemetry.toolCalls += 1
          pendingToolCalls.set(event.tool_call_id, { name: event.name, startedAt: performance.now() })
          continue
        }
        if (event.type === 'tool_result') {
          const ok = event.ok !== false
          if (!ok) telemetry.toolFailures += 1
          if (typeof event.tool_call_id === 'string') {
            const started = pendingToolCalls.get(event.tool_call_id)
            if (started) {
              telemetry.toolLatencies.push({
                tool: started.name,
                latencyMs: Math.max(0, performance.now() - started.startedAt),
              })
              pendingToolCalls.delete(event.tool_call_id)
            }
          }
          options?.onPanelToolResult?.(event as Record<string, unknown>)
          continue
        }
        // Policy gate trace gives quick insight into hardcoded vs agent routing.
        if (event.type === 'trace' && event.stage === 'policy_gate' && typeof event.decision === 'string') {
          telemetry.policyPath = event.decision
          continue
        }
        // First availability trace (sandbox / tools_unavailable).
        if (
          !capturedSandboxTrace &&
          event.type === 'trace' &&
          event.details &&
          typeof event.details === 'object'
        ) {
          const det = event.details as Record<string, unknown>
          const tu = det.tools_unavailable
          if (Array.isArray(tu) && tu.length > 0 && tu.every((x) => typeof x === 'string')) {
            capturedSandboxTrace = true
            telemetry.toolsUnavailable = tu as string[]
            const r = det.reason
            if (r === 'runner_unreachable' || r === 'feature_disabled') {
              telemetry.sandboxUnavailableReason = r
            }
          }
        }
        // Runtime summary currently reports end-to-end latency.
        if (
          event.type === 'trace' &&
          event.stage === 'runtime_summary' &&
          event.details &&
          typeof event.details === 'object' &&
          typeof (event.details as Record<string, unknown>).latency_ms === 'number'
        ) {
          telemetry.runtimeLatencyMs = (event.details as Record<string, number>).latency_ms
        }
      }
    }
  }

  const reply = (doneReply ?? tokenText).trim()
  if (!reply) throw new Error('Unified chat stream ended without reply text')
  return { reply, traceId, telemetry }
}

export async function postOzChat(request: OzChatClientRequest): Promise<OzChatClientResponse> {
  // Always attach a trace id so FE/BE logs can be correlated.
  const traceId = request.traceId?.trim() || createTraceId()
  const response = await fetch(OZ_CHAT_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-oz-trace-id': traceId,
    },
    body: JSON.stringify({
      message: request.text,
      context: request.context,
      ragScope: request.ragScope,
      trace_id: traceId,
      stream: true,
      contract_version: '2026-04-oz-chat-v1',
      ...(request.mode === 'scaffold' || request.mode === 'agentic' ? { mode: request.mode } : {}),
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Unified chat failed (${response.status}): ${body.slice(0, 200)}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/event-stream')) {
    if (!response.body) throw new Error('Unified chat stream missing response body')
    const parsed = await readSseReply(response.body, {
      onPanelToolResult: request.onPanelToolResult,
    })
    return {
      reply: parsed.reply,
      // Prefer server trace id if present, then header, then generated client id.
      traceId: parsed.traceId ?? response.headers.get('x-oz-trace-id') ?? traceId,
      telemetry: parsed.telemetry,
    }
  }

  // Non-stream JSON fallback for compatibility with alternate runtimes.
  const payload = (await response.json()) as unknown
  const reply = extractReplyFromJson(payload)
  if (!reply) throw new Error('Unified chat returned unexpected JSON shape')
  return {
    reply,
    traceId,
    telemetry: { toolCalls: 0, toolFailures: 0, toolLatencies: [] },
  }
}
