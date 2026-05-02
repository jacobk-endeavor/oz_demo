import { decode, encode } from 'gpt-tokenizer'

import type { OzChatRequest } from './chatRuntime'
import type { OzThreadDirectionRow } from './threadDirectionNormalize'

/** Max tokens for the injected thread-direction block (header + body), server-enforced. */
export const OZ_THREAD_DIRECTION_SUMMARY_MAX_TOKENS = 800

const DIRECTION_HEADER = '## Thread direction (oz_thread_direction)\n\n'

export type TruncateDirectionSummaryResult = {
  text: string
  tokens: number
  truncated: boolean
}

export function truncateToOzDirectionSummaryTokens(
  text: string,
  maxTokens = OZ_THREAD_DIRECTION_SUMMARY_MAX_TOKENS,
): TruncateDirectionSummaryResult {
  const ids = encode(text)
  if (ids.length <= maxTokens) {
    return { text, tokens: ids.length, truncated: false }
  }
  const clipped = ids.slice(0, maxTokens)
  return {
    text: decode(clipped),
    tokens: clipped.length,
    truncated: true,
  }
}

/** Prefer explicit conversation id; else UI thread id from JSON context. */
export function resolveOzChatThreadId(request: OzChatRequest): string | undefined {
  const conv = request.conversation_id?.trim()
  if (conv) return conv
  const ctx = request.context
  if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
    const tid = (ctx as Record<string, unknown>).threadId
    if (typeof tid === 'string' && tid.trim()) return tid.trim()
  }
  return undefined
}

function structuredRefsLine(structured_refs: unknown): string | undefined {
  if (structured_refs === undefined || structured_refs === null) return undefined
  if (Array.isArray(structured_refs) && structured_refs.length === 0) return undefined
  if (typeof structured_refs === 'object' && !Array.isArray(structured_refs) && Object.keys(structured_refs).length === 0) {
    return undefined
  }
  try {
    return `Structured refs: ${JSON.stringify(structured_refs)}`
  } catch {
    return undefined
  }
}

/**
 * Builds the system-prompt appendix from a thread-direction row (same source as GET …/direction).
 * Applies {@link OZ_THREAD_DIRECTION_SUMMARY_MAX_TOKENS} to the full block including header.
 */
export function buildOzThreadDirectionSummaryBlock(row: OzThreadDirectionRow): {
  block: string
  tokens: number
  truncated: boolean
} | null {
  const pieces: string[] = []
  const dt = String(row.direction_text ?? '').trim()
  if (dt) pieces.push(dt)
  const refs = structuredRefsLine(row.structured_refs)
  if (refs) pieces.push(refs)
  if (!pieces.length) return null

  const body = pieces.join('\n\n')
  const combined = `${DIRECTION_HEADER}${body}`
  const first = truncateToOzDirectionSummaryTokens(combined)
  if (!first.truncated) {
    return { block: first.text, tokens: first.tokens, truncated: false }
  }
  const withNotice = `${first.text}\n\n[Thread direction truncated to token budget server-side.]`
  const second = truncateToOzDirectionSummaryTokens(withNotice)
  return { block: second.text, tokens: second.tokens, truncated: true }
}
