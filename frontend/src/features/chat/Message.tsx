import type { Message as MessageType } from './types'
import { CitationPill } from './CitationPill'

interface MessageProps {
  message: MessageType
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[80%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-blue-50 border border-blue-100 text-zinc-900'
            : 'bg-white border border-zinc-200 text-zinc-900 px-5 py-4',
        ].join(' ')}
      >
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {message.citations.map((citation) => (
              <CitationPill key={citation.id} citation={citation} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
