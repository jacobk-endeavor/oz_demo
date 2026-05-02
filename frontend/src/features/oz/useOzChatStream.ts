import { useCallback, useRef } from 'react'
import { create } from 'zustand'
import type { OzChatTurnContext } from '../../shared/ui'
import { postOzChat } from './ozChatClient'
import { readOzChatRuntimeOverride } from './ozChatRuntimeToggle'

type FallbackReply = { reply: string; delayMs?: number }

/** Separator so thread id cannot collide with message id when joined. */
const PANEL_KEY_SEP = '\u001f'

/**
 * Stable store key for panel payloads (§12.2.5).
 * Use with {@link useOzPanelPayloadStore} / {@link getOzPanelPayload}.
 */
export function ozPanelPayloadKey(threadId: string, messageId: string): string {
  return `${threadId}${PANEL_KEY_SEP}${messageId}`
}

export type OzPanelToolPayloadRecord = {
  tool: 'display_table' | 'display_panel'
  ok: boolean
  summary?: string
  /** Full structured result when the SSE frame includes it (or legacy `result_meta`). */
  result?: unknown
  tool_call_id?: string
}

type OzPanelPayloadStoreState = {
  entries: Record<string, OzPanelToolPayloadRecord>
  recordPanelToolResult: (threadId: string, messageId: string, event: Record<string, unknown>) => void
  getPanelPayload: (threadId: string, messageId: string) => OzPanelToolPayloadRecord | undefined
  clearThread: (threadId: string) => void
}

/**
 * Panel payloads from `display_table` / `display_panel` tool_result frames, keyed by
 * `(thread_id, message_id)` so rapid transcript-scope switches cannot collide (§12.3).
 */
export const useOzPanelPayloadStore = create<OzPanelPayloadStoreState>((set, get) => ({
  entries: {},
  recordPanelToolResult: (threadId, messageId, event) => {
    const name = event.name
    if (name !== 'display_table' && name !== 'display_panel') return
    if (!threadId.trim() || !messageId.trim()) return

    const ok = event.ok !== false
    const summary = typeof event.summary === 'string' ? event.summary : undefined
    const tool_call_id = typeof event.tool_call_id === 'string' ? event.tool_call_id : undefined
    const result =
      event.result !== undefined
        ? event.result
        : event.result_meta !== undefined
          ? event.result_meta
          : undefined

    const payload: OzPanelToolPayloadRecord = {
      tool: name,
      ok,
      ...(summary !== undefined ? { summary } : {}),
      ...(result !== undefined ? { result } : {}),
      ...(tool_call_id ? { tool_call_id } : {}),
    }

    const key = ozPanelPayloadKey(threadId, messageId)
    set((s) => ({
      entries: { ...s.entries, [key]: payload },
    }))
  },
  getPanelPayload: (threadId, messageId) => get().entries[ozPanelPayloadKey(threadId, messageId)],
  clearThread: (threadId) =>
    set((s) => {
      const prefix = `${threadId}${PANEL_KEY_SEP}`
      const next = { ...s.entries }
      for (const k of Object.keys(next)) {
        if (k.startsWith(prefix)) delete next[k]
      }
      return { entries: next }
    }),
}))

export function getOzPanelPayload(threadId: string, messageId: string): OzPanelToolPayloadRecord | undefined {
  return useOzPanelPayloadStore.getState().getPanelPayload(threadId, messageId)
}

/** Clears panel payloads for a transcript thread (e.g. after RAG scope change). */
export function clearOzPanelPayloadsForThread(threadId: string): void {
  useOzPanelPayloadStore.getState().clearThread(threadId)
}

export function useOzChatStream({
  fallbackReply,
}: {
  fallbackReply: (args: { text: string; context: OzChatTurnContext; ragScope: string }) => Promise<FallbackReply>
}) {
  // Feature flag to allow emergency rollback to legacy path without code changes.
  const shouldTryUnified = import.meta.env.VITE_OZ_CHAT_UNIFIED !== '0'
  // Once we detect "route missing", stop retrying unified path every turn.
  const skipUnifiedRef = useRef(false)

  const sendNonHardcodedTurn = useCallback(
    async (args: { text: string; context: OzChatTurnContext; ragScope: string }): Promise<FallbackReply> => {
      if (shouldTryUnified && !skipUnifiedRef.current) {
        try {
          // Preferred path: unified backend runtime (`/api/oz/chat`).
          // Pull per-turn runtime override from localStorage (set by the UI toggle).
          const mode = readOzChatRuntimeOverride()
          const threadId = args.context.threadId?.trim()
          const messageId = args.context.assistantMessageId?.trim()
          const onPanelToolResult =
            threadId && messageId
              ? (event: Record<string, unknown>) => {
                  useOzPanelPayloadStore.getState().recordPanelToolResult(threadId, messageId, event)
                }
              : undefined

          const result = await postOzChat({
            text: args.text,
            context: args.context,
            ragScope: args.ragScope,
            ...(mode ? { mode } : {}),
            ...(onPanelToolResult ? { onPanelToolResult } : {}),
          })
          return { reply: result.reply, delayMs: 0 }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (
            message.includes('Unified chat failed (404') ||
            message.includes('Unified chat failed (405') ||
            message.includes('Unified chat failed (501')
          ) {
            // Missing route is expected during migration; avoid paying this retry every turn.
            skipUnifiedRef.current = true
          }
        }
      }
      // Legacy fallback keeps UX stable while runtime migration is in progress.
      return fallbackReply(args)
    },
    [fallbackReply, shouldTryUnified],
  )

  return { sendNonHardcodedTurn }
}
