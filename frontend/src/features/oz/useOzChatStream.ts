import { useCallback, useRef } from 'react'
import type { OzChatTurnContext } from '../../shared/ui'
import { postOzChat } from './ozChatClient'

type FallbackReply = { reply: string; delayMs?: number }

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
          const result = await postOzChat({
            text: args.text,
            context: args.context,
            ragScope: args.ragScope,
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
