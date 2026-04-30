import { useCallback, useRef } from 'react'
import type { OzChatTurnContext } from '../../shared/ui'
import { postOzChat } from './ozChatClient'

type FallbackReply = { reply: string; delayMs?: number }

export function useOzChatStream({
  fallbackReply,
}: {
  fallbackReply: (args: { text: string; context: OzChatTurnContext; ragScope: string }) => Promise<FallbackReply>
}) {
  const shouldTryUnified = import.meta.env.VITE_OZ_CHAT_UNIFIED !== '0'
  const skipUnifiedRef = useRef(false)

  const sendNonHardcodedTurn = useCallback(
    async (args: { text: string; context: OzChatTurnContext; ragScope: string }): Promise<FallbackReply> => {
      if (shouldTryUnified && !skipUnifiedRef.current) {
        try {
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
      return fallbackReply(args)
    },
    [fallbackReply, shouldTryUnified],
  )

  return { sendNonHardcodedTurn }
}
