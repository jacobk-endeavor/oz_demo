export const OZ_CHAT_CONTRACT_VERSION = '2026-04-oz-chat-v1' as const

export type OzPolicyPath = 'hardcoded' | 'agent'

export type OzChatRequest = {
  contract_version?: string
  message?: string
  trace_id?: string
  conversation_id?: string
  stream?: boolean
  context?: unknown
  ragScope?: string
}

type OzChatBaseEvent = {
  contract_version: string
  sequence: number
  timestamp: string
  trace_id?: string
  conversation_id?: string
}

export type OzChatStreamEvent =
  | (OzChatBaseEvent & { type: 'trace'; stage: string; decision: string; details?: Record<string, unknown> })
  | (OzChatBaseEvent & { type: 'token'; delta: string })
  | (OzChatBaseEvent & { type: 'done'; message: string; finish_reason: string })

export type RuntimeDependencies = {
  now?: () => Date
}

export function choosePolicyPath(request: OzChatRequest): OzPolicyPath {
  const text = String(request.message ?? '').trim().toLowerCase()
  if (!text) return 'hardcoded'
  if (text === 'ping' || text.startsWith('/help')) return 'hardcoded'
  return 'agent'
}

function hardcodedReplyFor(message: string): string {
  const text = message.trim().toLowerCase()
  if (!text) return 'Please enter a message so Oz can respond.'
  if (text === 'ping') return 'pong'
  if (text.startsWith('/help')) return 'Oz runtime scaffold is online. Use normal chat text for the agent path.'
  return 'Hardcoded policy path selected.'
}

export async function* runOzChatLoop(
  request: OzChatRequest,
  deps: RuntimeDependencies = {},
): AsyncGenerator<OzChatStreamEvent> {
  const now = deps.now ?? (() => new Date())
  const contractVersion = request.contract_version || OZ_CHAT_CONTRACT_VERSION
  const message = String(request.message ?? '').trim()
  const policyPath = choosePolicyPath(request)
  let sequence = 0

  const base = () => ({
    contract_version: contractVersion,
    sequence: sequence++,
    timestamp: now().toISOString(),
    trace_id: request.trace_id,
    conversation_id: request.conversation_id,
  })

  yield {
    ...base(),
    type: 'trace',
    stage: 'policy_gate',
    decision: policyPath,
    details: {
      reason: policyPath === 'hardcoded' ? 'deterministic text match' : 'fallback to runtime loop',
    },
  }

  if (policyPath === 'hardcoded') {
    const reply = hardcodedReplyFor(message)
    yield { ...base(), type: 'token', delta: reply }
    yield { ...base(), type: 'done', message: reply, finish_reason: 'stop' }
    return
  }

  // Runtime loop scaffold: keep shape stable for tool orchestration work in follow-up issues.
  yield {
    ...base(),
    type: 'trace',
    stage: 'runtime_loop',
    decision: 'agent_stub',
    details: { step: 'plan', tools_enabled: false },
  }

  const agentReply =
    'Agent runtime path is scaffolded. Tool execution and model orchestration are not enabled yet.'
  yield { ...base(), type: 'token', delta: agentReply }
  yield { ...base(), type: 'done', message: agentReply, finish_reason: 'stop' }
}
