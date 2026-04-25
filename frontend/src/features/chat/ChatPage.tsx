import { useMemo } from 'react'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { ConversationSidebar } from './ConversationSidebar'
import { useChat } from './useChat'

export function ChatPage() {
  const {
    messages,
    sessionId,
    isSending,
    error,
    send,
    loadSession,
    newChat,
    refreshToken,
  } = useChat()

  // Prior user turns feed the composer's ↑/↓ history cycling.
  const userHistory = useMemo(
    () => messages.filter((m) => m.role === 'user').map((m) => m.content),
    [messages],
  )

  return (
    <div className="flex min-h-0 flex-1">
      <ConversationSidebar
        activeSessionId={sessionId}
        onSelect={loadSession}
        onNewChat={newChat}
        refreshToken={refreshToken}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header — tight single line so the message list owns the
            vertical real estate.  Session id on the right, no more
            placeholder chips. */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-3">
          <h1 className="text-base font-semibold text-zinc-900">
            Chat with your ECL
          </h1>
          {sessionId ? (
            <span
              className="font-mono text-[11px] text-zinc-400"
              title="Conversation id"
            >
              {sessionId}
            </span>
          ) : null}
        </div>

        {/* Messages */}
        <MessageList messages={messages} />

        {/* Error banner */}
        {error && (
          <div className="flex-shrink-0 border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Composer — flush to bottom */}
        <Composer onSend={send} disabled={isSending} history={userHistory} />
      </div>
    </div>
  )
}
