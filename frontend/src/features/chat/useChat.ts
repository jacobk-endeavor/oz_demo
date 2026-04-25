import { useState, useCallback } from 'react'
import { api } from '../../shared/api/client'
import type { Message, ChatResponse } from './types'

interface PersistedTurn {
  turn_id: string
  timestamp: string
  role: string
  content: string
  citations?: Message['citations']
}

interface PersistedSession {
  session_id: string
  title: string
  turns: PersistedTurn[]
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumped after each successful send so the sidebar refetches.
  const [refreshToken, setRefreshToken] = useState(0)

  const send = useCallback(
    async (text: string) => {
      const userMessage: Message = { role: 'user', content: text }
      setMessages((prev) => [...prev, userMessage])
      setIsSending(true)
      setError(null)

      try {
        const res = await api.post<ChatResponse>('/api/chat', {
          message: text,
          session_id: sessionId,
        })

        const assistantMessage: Message = {
          role: 'assistant',
          content: res.reply,
          citations: res.citations,
        }

        setMessages((prev) => [...prev, assistantMessage])
        setSessionId(res.session_id)
        setRefreshToken((t) => t + 1)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to send message'
        setError(msg)
      } finally {
        setIsSending(false)
      }
    },
    [sessionId],
  )

  /** Switch the in-memory messages to a persisted session by id. */
  const loadSession = useCallback(async (id: string) => {
    setError(null)
    setIsSending(true)
    try {
      const payload = await api.get<PersistedSession>(
        `/api/chat/sessions/${encodeURIComponent(id)}`,
      )
      const hydrated: Message[] = payload.turns.map((t) => ({
        role: t.role === 'assistant' ? 'assistant' : 'user',
        content: t.content,
        citations: t.citations,
      }))
      setMessages(hydrated)
      setSessionId(payload.session_id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load session'
      setError(msg)
    } finally {
      setIsSending(false)
    }
  }, [])

  /** Start a fresh conversation. */
  const newChat = useCallback(() => {
    setMessages([])
    setSessionId(null)
    setError(null)
  }, [])

  return {
    messages,
    sessionId,
    isSending,
    error,
    send,
    loadSession,
    newChat,
    refreshToken,
  }
}
