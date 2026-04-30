import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChatBubbleLeftRightIcon,
  ClockIcon,
  PlusIcon,
  StopIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import api from '../api';
import { useChat, type ChatMessage } from '../hooks/useChat';
import MarkdownContent from '../components/MarkdownContent';
import ToolCallGroup from '../components/ToolCallGroup';

const SUGGESTIONS = [
  'How does Endeavor compare to Canals?',
  'What is our largest deal?',
  'How quick do we integrate?',
  'Can we integrate with SAP?',
  'What are the products we sell?',
  'What is the ROI for order entry?',
];

const GREETINGS: Record<string, string[]> = {
  morning: [
    'Good morning', 'Top of the morning', 'Morning', 'Hey, good morning',
    'Rise and shine', 'Bright and early', 'Happy morning', 'Great morning',
    'Lovely morning', 'Hello, early bird',
  ],
  afternoon: [
    'Good afternoon', 'Afternoon', 'Hey, good afternoon', 'Happy afternoon',
    "Hope your day's going great", 'Nice afternoon', 'Hello there',
    'Welcome back', 'Good to see you', 'Great afternoon',
  ],
  evening: [
    'Good evening', 'Evening', 'Hey, good evening', 'Happy evening',
    'Hope you had a great day', 'Winding down', 'Nice evening',
    'Welcome back', 'Good to see you', 'Hello, night owl',
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getGreeting(): string {
  const h = new Date().getHours();
  const key = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return pickRandom(GREETINGS[key]);
}

function extractFirstName(email: string | null): string {
  if (!email) return '';
  const name = email.split('@')[0].split(/[._-]/)[0];
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

const MD_CLASSES =
  'text-sm leading-relaxed text-zinc-700 [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h4]:mt-3 [&_h4]:mb-1.5 [&_h5]:mt-3 [&_h5]:mb-1.5 [&_p]:mb-2.5 [&_ul]:mb-2.5 [&_ol]:mb-2.5 [&_li]:mb-1';
const CHAT_HISTORY_WIDTH_STORAGE_KEY = 'chatHistoryWidthPercent';
const DEFAULT_CHAT_HISTORY_WIDTH_PERCENT = 26;
const MIN_CHAT_HISTORY_WIDTH_PERCENT = 18;
const MAX_CHAT_HISTORY_WIDTH_PERCENT = 42;
const DEFAULT_CONVERSATION_TITLE = 'New message';
const SIDEBAR_INSERT_ANIMATION_MS = 400;
const TITLE_REFRESH_DELAYS_MS = [1200, 2600];

interface ConversationSummary {
  id: number;
  title: string | null;
  last_message_at: string;
}

interface StoredMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationDetail extends ConversationSummary {
  messages: StoredMessage[];
}

function parseConversationId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatConversationTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function mapStoredMessages(messages: StoredMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function hasDisplayableConversationTitle(conversation: ConversationSummary): boolean {
  const title = (conversation.title || '').trim();
  return title.length > 0 && title !== DEFAULT_CONVERSATION_TITLE;
}

function clampSidebarWidthPercent(value: number): number {
  return Math.min(MAX_CHAT_HISTORY_WIDTH_PERCENT, Math.max(MIN_CHAT_HISTORY_WIDTH_PERCENT, value));
}

function getInitialSidebarWidthPercent(): number {
  if (typeof window === 'undefined') return DEFAULT_CHAT_HISTORY_WIDTH_PERCENT;
  const raw = window.localStorage.getItem(CHAT_HISTORY_WIDTH_STORAGE_KEY);
  if (!raw) return DEFAULT_CHAT_HISTORY_WIDTH_PERCENT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_CHAT_HISTORY_WIDTH_PERCENT;
  return clampSidebarWidthPercent(parsed);
}

export default function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { conversationId: conversationIdParam } = useParams();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [deletingConversationId, setDeletingConversationId] = useState<number | null>(null);
  const [deletingMessageIndex, setDeletingMessageIndex] = useState<number | null>(null);
  const [animatedConversationIds, setAnimatedConversationIds] = useState<number[]>([]);
  const [sidebarWidthPercent, setSidebarWidthPercent] = useState(getInitialSidebarWidthPercent);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(
    () => parseConversationId(conversationIdParam) != null,
  );
  const buildBody = useCallback(
    ({ newMessage }: { messages: ChatMessage[]; newMessage: ChatMessage }) => ({
      message: newMessage.content,
      conversation_id: activeConversationIdRef.current,
    }),
    [],
  );
  const activeConversationIdRef = useRef<number | null>(parseConversationId(conversationIdParam));
  const hydratedConversationIdRef = useRef<number | null>(null);
  const pageLayoutRef = useRef<HTMLDivElement | null>(null);
  const didLoadConversationsRef = useRef(false);
  const visibleConversationIdsRef = useRef<number[]>([]);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadConversations = useCallback(async () => {
    setConversationsLoading(true);
    try {
      const response = await api.get<ConversationSummary[]>('/api/chat/conversations');
      const next = response.data;
      const nextVisibleIds = next
        .filter(hasDisplayableConversationTitle)
        .map((conversation) => conversation.id);

      if (didLoadConversationsRef.current) {
        const previousVisibleIds = new Set(visibleConversationIdsRef.current);
        const newlyVisibleIds = nextVisibleIds.filter((id) => !previousVisibleIds.has(id));
        if (newlyVisibleIds.length > 0) {
          setAnimatedConversationIds((current) => Array.from(new Set([...current, ...newlyVisibleIds])));
        }
      } else {
        didLoadConversationsRef.current = true;
      }

      visibleConversationIdsRef.current = nextVisibleIds;
      setConversations(next);
    } catch {
      setConversations([]);
    } finally {
      setConversationsLoading(false);
    }
  }, []);
  const handleConversationId = useCallback((nextConversationId: number) => {
    activeConversationIdRef.current = nextConversationId;
    hydratedConversationIdRef.current = nextConversationId;
    if (conversationIdParam !== String(nextConversationId)) {
      navigate(`/chat/${nextConversationId}`, { replace: true });
    }
  }, [conversationIdParam, navigate]);
  const [greeting] = useState(getGreeting);
  const firstName = extractFirstName(user);

  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRefreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTitleRefreshTimers = useCallback(() => {
    for (const timer of titleRefreshTimersRef.current) {
      clearTimeout(timer);
    }
    titleRefreshTimersRef.current = [];
  }, []);

  const chat = useChat({
    endpoint: '/api/chat',
    buildBody,
    onConversationId: handleConversationId,
    onResponseComplete: () => {
      void loadConversations();
      clearTitleRefreshTimers();
      titleRefreshTimersRef.current = TITLE_REFRESH_DELAYS_MS.map((delay) =>
        setTimeout(() => {
          void loadConversations();
        }, delay),
      );
    },
  });
  const {
    messages,
    input,
    streaming,
    setInput,
    send,
    stop,
    clear,
    replaceMessages,
    scrollRef,
    onScroll,
  } = chat;
  const landed = !conversationLoading && messages.length === 0;

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    window.localStorage.setItem(
      CHAT_HISTORY_WIDTH_STORAGE_KEY,
      String(sidebarWidthPercent),
    );
  }, [sidebarWidthPercent]);

  useEffect(() => {
    if (animatedConversationIds.length === 0) return;
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    animationTimerRef.current = setTimeout(() => {
      setAnimatedConversationIds([]);
      animationTimerRef.current = null;
    }, SIDEBAR_INSERT_ANIMATION_MS);

    return () => {
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    };
  }, [animatedConversationIds]);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (event: MouseEvent) => {
      const layout = pageLayoutRef.current;
      if (!layout) return;
      const bounds = layout.getBoundingClientRect();
      if (!bounds.width) return;
      const nextPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
      setSidebarWidthPercent(clampSidebarWidthPercent(nextPercent));
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    const nextConversationId = parseConversationId(conversationIdParam);
    if (conversationIdParam && nextConversationId == null) {
      navigate('/chat', { replace: true });
      return;
    }

    if (nextConversationId == null) {
      activeConversationIdRef.current = null;
      hydratedConversationIdRef.current = null;
      replaceMessages([]);
      setConversationLoading(false);
      return;
    }

    activeConversationIdRef.current = nextConversationId;
    if (hydratedConversationIdRef.current === nextConversationId) {
      return;
    }

    let cancelled = false;
    setConversationLoading(true);
    api
      .get<ConversationDetail>(`/api/chat/conversations/${nextConversationId}`)
      .then((response) => {
        if (cancelled) return;
        replaceMessages(mapStoredMessages(response.data.messages));
        hydratedConversationIdRef.current = nextConversationId;
      })
      .catch(() => {
        if (cancelled) return;
        activeConversationIdRef.current = null;
        hydratedConversationIdRef.current = null;
        replaceMessages([]);
        navigate('/chat', { replace: true });
      })
      .finally(() => {
        if (!cancelled) {
          setConversationLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationIdParam, navigate, replaceMessages]);

  useEffect(() => () => {
    if (typingRef.current) clearInterval(typingRef.current);
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    clearTitleRefreshTimers();
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
  }, [clearTitleRefreshTimers]);

  const handleScroll = useCallback(() => {
    onScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.classList.add('is-scrolling');
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      el.classList.remove('is-scrolling');
    }, 1000);
  }, [onScroll, scrollRef]);

  const typeOut = useCallback((text: string) => {
    if (typingRef.current) clearInterval(typingRef.current);
    setInput('');
    let i = 0;
    typingRef.current = setInterval(() => {
      i++;
      setInput(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(typingRef.current!);
        typingRef.current = null;
      }
    }, 18);
  }, [setInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const startNewChat = useCallback(() => {
    if (streaming) return;
    activeConversationIdRef.current = null;
    hydratedConversationIdRef.current = null;
    clear();
    navigate('/chat');
  }, [clear, navigate, streaming]);

  const deleteConversation = useCallback(async (conversationId: number) => {
    if (streaming || deletingConversationId != null) return;

    setDeletingConversationId(conversationId);
    try {
      await api.delete(`/api/chat/conversations/${conversationId}`);
      setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));

      if (activeConversationIdRef.current === conversationId) {
        activeConversationIdRef.current = null;
        hydratedConversationIdRef.current = null;
        clear();
        navigate('/chat', { replace: true });
      }
    } finally {
      setDeletingConversationId(null);
    }
  }, [clear, deletingConversationId, navigate, streaming]);

  const deleteMessage = useCallback(async (messageIndex: number) => {
    const conversationId = activeConversationIdRef.current;
    if (conversationId == null || streaming || deletingMessageIndex != null) return;

    setDeletingMessageIndex(messageIndex);
    const nextMessages = messages.filter((_, idx) => idx !== messageIndex);

    try {
      await api.delete(`/api/chat/conversations/${conversationId}/messages/${messageIndex}`);
      replaceMessages(nextMessages);

      if (nextMessages.length === 0) {
        activeConversationIdRef.current = null;
        hydratedConversationIdRef.current = null;
        navigate('/chat', { replace: true });
      }

      await loadConversations();
    } finally {
      setDeletingMessageIndex(null);
    }
  }, [deletingMessageIndex, loadConversations, messages, navigate, replaceMessages, streaming]);

  const visibleConversations = conversations.filter(hasDisplayableConversationTitle);

  return (
    <div ref={pageLayoutRef} className="flex h-full min-w-0">
      <aside
        className="flex shrink-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50/80"
        style={{ width: `${sidebarWidthPercent}%` }}
      >
        <div className="border-b border-zinc-200 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Chat History
              </p>
              <h2 className="mt-1 text-sm font-semibold text-zinc-900">Recent chats</h2>
            </div>
            <button
              type="button"
              onClick={startNewChat}
              disabled={streaming}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Start a new chat"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {conversationsLoading ? (
            <div className="flex h-full items-center justify-center px-4 text-sm text-zinc-500">
              Loading chats...
            </div>
          ) : visibleConversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center text-sm text-zinc-500">
              <ChatBubbleLeftRightIcon className="mb-3 h-8 w-8 text-zinc-300" />
              Your saved chats will appear here.
            </div>
          ) : (
            <div className="space-y-1">
              {visibleConversations.map((conversation) => {
                const isActive = activeConversationIdRef.current === conversation.id;
                const isDeleting = deletingConversationId === conversation.id;
                const isAnimatingIn = animatedConversationIds.includes(conversation.id);
                return (
                  <div
                    key={conversation.id}
                    className={[
                      'group relative',
                      isAnimatingIn ? 'animate-fade-in' : '',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/chat/${conversation.id}`)}
                      disabled={streaming || isDeleting}
                      className={[
                        'w-full rounded-lg border px-3 py-2.5 pr-11 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                        isActive
                          ? 'border-zinc-300 bg-white shadow-sm'
                          : 'border-transparent hover:border-zinc-200 hover:bg-white/80',
                      ].join(' ')}
                    >
                      <div className="truncate text-sm font-medium text-zinc-800">
                        {conversation.title || DEFAULT_CONVERSATION_TITLE}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                        <ClockIcon className="h-3.5 w-3.5" />
                        {formatConversationTimestamp(conversation.last_message_at)}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteConversation(conversation.id);
                      }}
                      disabled={streaming || isDeleting}
                      className={[
                        'absolute top-2.5 right-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-400 transition-all',
                        'invisible pointer-events-none opacity-0 group-hover:visible group-hover:pointer-events-auto group-hover:opacity-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40',
                      ].join(' ')}
                      title="Delete chat"
                      aria-label={`Delete ${conversation.title || DEFAULT_CONVERSATION_TITLE}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat history"
        onMouseDown={(event) => {
          event.preventDefault();
          setIsResizingSidebar(true);
        }}
        className={[
          'mx-1.5 w-3 shrink-0 cursor-col-resize rounded-full transition-colors',
          isResizingSidebar ? 'bg-zinc-100/80' : 'hover:bg-zinc-100/80',
        ].join(' ')}
      />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {conversationLoading ? (
          <div
            key={`loading-${conversationIdParam ?? 'new'}`}
            className="flex h-full animate-fade-in items-center justify-center px-6 text-sm text-zinc-500"
          >
            Loading conversation...
          </div>
        ) : (
          <div
            key={`conversation-${conversationIdParam ?? 'new'}`}
            className="relative h-full animate-fade-in"
          >
            <div
              className={[
                'absolute inset-0 flex flex-col items-center justify-center px-6 transition-all duration-500 ease-out',
                landed ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8 pointer-events-none',
              ].join(' ')}
            >
              <h1 className="mb-8 text-center text-4xl font-light tracking-tight text-zinc-800">
                {greeting}, {firstName}
              </h1>

              <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 px-5 py-4">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about companies, people, meetings..."
                    disabled={streaming}
                    className="flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={send}
                    disabled={!input.trim()}
                    className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                  >
                    Send
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-zinc-100 px-5 py-4">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => typeOut(s)}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div
              className={[
                'flex h-full flex-col transition-all duration-500 ease-out',
                landed ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0',
              ].join(' ')}
            >
              {messages.length > 0 && !streaming && (
                <div className="flex justify-end px-6 pt-3 pb-0">
                  <button
                    type="button"
                    onClick={startNewChat}
                    className="pr-2 text-sm text-zinc-400 transition-colors hover:text-zinc-600"
                  >
                    New chat
                  </button>
                </div>
              )}
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="scrollbar-autohide flex-1 space-y-5 overflow-y-auto px-6 py-6"
              >
                {messages.map((msg, idx) => {
                  const canDeleteMessage = activeConversationIdRef.current != null && !streaming;
                  return (
                    <div key={idx} className="group mx-auto w-full max-w-3xl">
                      {msg.role === 'user' ? (
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-400">
                            You
                          </span>
                          <p className="flex-1 text-sm text-zinc-900">{msg.content}</p>
                          {canDeleteMessage && (
                            <button
                              type="button"
                              onClick={() => {
                                void deleteMessage(idx);
                              }}
                              disabled={deletingMessageIndex != null}
                              className={[
                                'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-400 transition-all',
                                'invisible pointer-events-none opacity-0 group-hover:visible group-hover:pointer-events-auto group-hover:opacity-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40',
                              ].join(' ')}
                              title="Delete message"
                              aria-label="Delete message"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 px-4 py-3.5 pr-12">
                            {msg.segments && msg.segments.length > 0 ? (
                              msg.segments.map((seg, sIdx) => {
                                if (seg.type === 'text') {
                                  return seg.content ? (
                                    <MarkdownContent
                                      key={sIdx}
                                      content={seg.content}
                                      className={MD_CLASSES}
                                      isStreaming={streaming && idx === messages.length - 1}
                                    />
                                  ) : null;
                                }
                                const hasTextAfter = msg.segments!
                                  .slice(sIdx + 1)
                                  .some((segment) => segment.type === 'text' && segment.content.length > 0);
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
                                className={MD_CLASSES}
                                isStreaming={streaming && idx === messages.length - 1}
                              />
                            )}
                          </div>
                          {canDeleteMessage && (
                            <button
                              type="button"
                              onClick={() => {
                                void deleteMessage(idx);
                              }}
                              disabled={deletingMessageIndex != null}
                              className={[
                                'absolute top-2.5 right-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-400 transition-all',
                                'invisible pointer-events-none opacity-0 group-hover:visible group-hover:pointer-events-auto group-hover:opacity-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40',
                              ].join(' ')}
                              title="Delete message"
                              aria-label="Delete message"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-zinc-200 px-6 py-4">
                <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about companies, people, meetings..."
                    disabled={streaming}
                    className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 disabled:opacity-50"
                  />
                  {streaming ? (
                    <button
                      type="button"
                      onClick={stop}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                    >
                      <StopIcon className="h-4 w-4" />
                      Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={send}
                      disabled={!input.trim()}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      Send
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
