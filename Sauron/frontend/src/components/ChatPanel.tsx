import type { ReactNode } from 'react';
import { ChatBubbleLeftRightIcon, StopIcon, PencilIcon } from '@heroicons/react/24/outline';
import MarkdownContent from './MarkdownContent';
import ToolCallGroup from './ToolCallGroup';
import type { useChat } from '../hooks/useChat';

interface ChatPanelProps {
  chat: ReturnType<typeof useChat>;
  placeholder: string;
  emptyTitle: string;
  emptyHint: string;
  /** Extra content rendered below the empty-state hint (e.g. suggestion chips). */
  emptyExtra?: ReactNode;
  /** CSS class for the message list wrapper (applied alongside the messages). */
  messageClassName?: string;
  /** When true the panel fills its parent instead of using fixed min/max height. */
  fullPage?: boolean;
}

const mdClasses =
  'text-sm leading-relaxed text-zinc-700 [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h4]:mt-3 [&_h4]:mb-1.5 [&_h5]:mt-3 [&_h5]:mb-1.5 [&_p]:mb-2.5 [&_ul]:mb-2.5 [&_ol]:mb-2.5 [&_li]:mb-1';

export default function ChatPanel({
  chat,
  placeholder,
  emptyTitle,
  emptyHint,
  emptyExtra,
  messageClassName,
  fullPage,
}: ChatPanelProps) {
  const { messages, input, streaming, setInput, send, stop, edit, scrollRef, onScroll } = chat;

  return (
    <div
      className={fullPage ? 'flex h-full flex-col' : 'flex flex-col'}
      style={fullPage ? undefined : { minHeight: '400px', maxHeight: '60vh' }}
    >
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
            <ChatBubbleLeftRightIcon className={fullPage ? 'h-12 w-12 text-zinc-200 mb-4' : 'h-8 w-8 text-zinc-300 mb-3'} />
            <p className={fullPage ? 'text-base font-medium text-zinc-400' : 'text-sm text-zinc-500'}>{emptyTitle}</p>
            <p className={fullPage ? 'text-sm text-zinc-400 mt-2 max-w-md' : 'text-xs text-zinc-400 mt-1.5'}>{emptyHint}</p>
            {emptyExtra}
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={messageClassName}>
            {msg.role === 'user' ? (
              <div className="group flex items-start gap-2">
                <span className="shrink-0 mt-0.5 text-xs font-medium uppercase tracking-wide text-zinc-400">You</span>
                <p className="flex-1 text-sm text-zinc-900">{msg.content}</p>
                {!streaming && (
                  <button
                    type="button"
                    onClick={() => edit(idx)}
                    className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-zinc-600"
                    title="Edit message"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 px-4 py-3.5">
                {msg.segments && msg.segments.length > 0 ? (
                  msg.segments.map((seg, sIdx) => {
                    if (seg.type === 'text') {
                      return seg.content ? (
                        <MarkdownContent key={sIdx} content={seg.content} className={mdClasses} isStreaming={streaming && idx === messages.length - 1} />
                      ) : null;
                    }
                    const hasTextAfter = msg.segments!
                      .slice(sIdx + 1)
                      .some((s) => s.type === 'text' && s.content.length > 0);
                    return (
                      <ToolCallGroup
                        key={sIdx}
                        toolCalls={seg.toolCalls}
                        hasTextAfter={hasTextAfter}
                      />
                    );
                  })
                ) : (
                  <MarkdownContent
                    content={msg.content || '...'}
                    className={mdClasses}
                    isStreaming={streaming && idx === messages.length - 1}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-200 px-5 py-3">
        <div className={fullPage ? 'max-w-3xl mx-auto flex items-center gap-3' : 'flex items-center gap-3'}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={placeholder}
            disabled={streaming}
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 disabled:opacity-50"
          />
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              <StopIcon className="h-4 w-4" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!input.trim()}
              className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
