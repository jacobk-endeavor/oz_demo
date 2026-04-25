import { useEffect, useRef } from 'react'
import type { Message as MessageType } from './types'
import { Message } from './Message'

interface MessageListProps {
  messages: MessageType[]
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
          Start a conversation with your ECL
        </div>
      )}
      {messages.map((msg, i) => (
        <Message key={i} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
