import type { OzChatTurnContext } from '../../shared/ui'

const OZ_CHAT_PATH = '/api/oz/chat'

export type OzChatClientRequest = {
  text: string
  context: OzChatTurnContext
  ragScope?: string
}

export type OzChatClientResponse = {
  reply: string
}

function extractReplyFromJson(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (typeof record.reply === 'string' && record.reply.trim()) return record.reply.trim()
  if (typeof record.message === 'string' && record.message.trim()) return record.message.trim()
  if (typeof record.output_text === 'string' && record.output_text.trim()) return record.output_text.trim()
  return null
}

function parseSseDataLine(dataLine: string): { token?: string; doneReply?: string } {
  const trimmed = dataLine.trim()
  if (!trimmed) return {}
  if (trimmed === '[DONE]') return {}
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const type = typeof parsed.type === 'string' ? parsed.type : ''
    if (type === 'token') {
      const token =
        typeof parsed.token === 'string'
          ? parsed.token
          : typeof parsed.text === 'string'
            ? parsed.text
            : typeof parsed.delta === 'string'
              ? parsed.delta
              : ''
      return token ? { token } : {}
    }
    if (type === 'done') {
      const doneReply =
        typeof parsed.reply === 'string'
          ? parsed.reply
          : typeof parsed.text === 'string'
            ? parsed.text
            : undefined
      return doneReply && doneReply.trim() ? { doneReply: doneReply.trim() } : {}
    }
    if (typeof parsed.token === 'string' && parsed.token) return { token: parsed.token }
    return {}
  } catch {
    return { token: trimmed }
  }
}

async function readSseReply(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let tokenText = ''
  let doneReply: string | null = null

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
      }
    }
  }

  const finalReply = (doneReply ?? tokenText).trim()
  if (!finalReply) throw new Error('Unified chat stream ended without reply text')
  return finalReply
}

export async function postOzChat(request: OzChatClientRequest): Promise<OzChatClientResponse> {
  const response = await fetch(OZ_CHAT_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: request.text,
      context: request.context,
      ragScope: request.ragScope,
      stream: true,
      contractVersion: '2026-04-oz-chat-v1',
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Unified chat failed (${response.status}): ${body.slice(0, 200)}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/event-stream')) {
    if (!response.body) throw new Error('Unified chat stream missing response body')
    const reply = await readSseReply(response.body)
    return { reply }
  }

  const payload = (await response.json()) as unknown
  const reply = extractReplyFromJson(payload)
  if (!reply) throw new Error('Unified chat returned unexpected JSON shape')
  return { reply }
}
