import { useState, useRef, useCallback, useEffect } from 'react';
import type { ToolCallInfo } from '../components/ToolCallIndicator';

export type MessageSegment =
  | { type: 'text'; content: string }
  | { type: 'tool_calls'; toolCalls: ToolCallInfo[] };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallInfo[];
  segments?: MessageSegment[];
}

export interface UseChatOptions {
  endpoint: string;
  buildBody: (args: {
    messages: ChatMessage[];
    newMessage: ChatMessage;
  }) => Record<string, unknown>;
  onConversationId?: (conversationId: number) => void;
  onResponseComplete?: () => void;
}

interface SseState {
  accumulated: string;
  toolCalls: ToolCallInfo[];
  segments: MessageSegment[];
}

function stringifyUnknownError(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatResponseError(status: number, statusText: string, rawBody: string): string {
  const trimmedBody = rawBody.trim();
  let rawError = trimmedBody;

  if (trimmedBody) {
    try {
      const parsed = JSON.parse(trimmedBody);
      rawError = JSON.stringify(parsed, null, 2);
    } catch {
      rawError = trimmedBody;
    }
  }

  const statusLabel = [status, statusText].filter(Boolean).join(' ');
  const lines = [`Chat request failed${statusLabel ? ` (${statusLabel})` : '.'}`];

  if (trimmedBody) {
    lines.push('', 'Raw error:', '```', rawError, '```');
  } else {
    lines.push('', 'No error body was returned by the server.');
  }

  return lines.join('\n');
}

function isStructuredEvent(v: unknown): v is { type: string; [k: string]: unknown } {
  return typeof v === 'object' && v !== null && 'type' in v;
}

function applySseEvent(state: SseState, parsed: unknown): SseState {
  if (isStructuredEvent(parsed)) {
    if (parsed.type === 'tool_call') {
      const newTc: ToolCallInfo = {
        name: parsed.name as string,
        arguments: parsed.arguments as Record<string, unknown>,
        status: 'calling',
      };
      const segments = [...state.segments];
      const last = segments[segments.length - 1];
      if (last && last.type === 'tool_calls') {
        segments[segments.length - 1] = { ...last, toolCalls: [...last.toolCalls, newTc] };
      } else {
        segments.push({ type: 'tool_calls', toolCalls: [newTc] });
      }
      return { ...state, toolCalls: [...state.toolCalls, newTc], segments };
    }
    if (parsed.type === 'tool_result') {
      const update = (tc: ToolCallInfo) =>
        tc.name === parsed.name && tc.status === 'calling'
          ? { ...tc, status: 'done' as const, metadata: parsed.metadata, result: parsed.content as string | undefined }
          : tc;
      return {
        ...state,
        toolCalls: state.toolCalls.map(update),
        segments: state.segments.map((seg) =>
          seg.type === 'tool_calls' ? { ...seg, toolCalls: seg.toolCalls.map(update) } : seg,
        ),
      };
    }
  }
  const text = typeof parsed === 'string' ? parsed : String(parsed);
  const segments = [...state.segments];
  const last = segments[segments.length - 1];
  if (last && last.type === 'text') {
    segments[segments.length - 1] = { ...last, content: last.content + text };
  } else {
    segments.push({ type: 'text', content: text });
  }
  return { ...state, accumulated: state.accumulated + text, segments };
}

export function useChat({
  endpoint,
  buildBody,
  onConversationId,
  onResponseComplete,
}: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const userScrolledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolledRef.current = !nearBottom;
  }, []);

  useEffect(() => {
    if (scrollRef.current && !userScrolledRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    userScrolledRef.current = false;
    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setStreaming(true);

    setMessages([...updatedMessages, { role: 'assistant', content: '' }]);

    let state: SseState = { accumulated: '', toolCalls: [], segments: [] };

    const flush = () => {
      const { accumulated, toolCalls, segments } = state;
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: 'assistant',
          content: accumulated,
          toolCalls: toolCalls.length ? toolCalls : undefined,
          segments: segments.length ? segments : undefined,
        };
        return copy;
      });
    };

    try {
      abortRef.current = new AbortController();
      const token = localStorage.getItem('token');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(buildBody({ messages: updatedMessages, newMessage: userMsg })),
        signal: abortRef.current.signal,
      });

      const responseConversationId = response.headers.get('x-conversation-id');
      if (responseConversationId) {
        const parsedConversationId = Number(responseConversationId);
        if (Number.isFinite(parsedConversationId)) {
          onConversationId?.(parsedConversationId);
        }
      }

      if (!response.ok || !response.body) {
        const rawBody = !response.ok ? await response.text() : '';
        const errorMsg = !response.ok
          ? formatResponseError(response.status, response.statusText, rawBody)
          : 'Chat request failed because the server returned no response body.';
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: errorMsg };
          return copy;
        });
        setStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') {
            streamDone = true;
            break;
          }
          try {
            state = applySseEvent(state, JSON.parse(raw));
          } catch {
            state = applySseEvent(state, raw);
          }
          flush();
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        flush();
        return;
      }
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: 'assistant',
          content: [
            'Chat request crashed before a response was completed.',
            '',
            'Raw error:',
            '```',
            stringifyUnknownError(err),
            '```',
          ].join('\n'),
        };
        return copy;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
      onResponseComplete?.();
    }
  }, [
    input,
    streaming,
    messages,
    endpoint,
    buildBody,
    onConversationId,
    onResponseComplete,
  ]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const edit = useCallback((idx: number) => {
    if (streaming) return;
    const msg = messages[idx];
    if (msg.role !== 'user') return;
    setInput(msg.content);
    setMessages(messages.slice(0, idx));
  }, [streaming, messages]);

  const clear = useCallback(() => {
    if (streaming) return;
    setMessages([]);
  }, [streaming]);

  const replaceMessages = useCallback((nextMessages: ChatMessage[]) => {
    setMessages(nextMessages);
  }, []);

  return {
    messages,
    input,
    streaming,
    setInput,
    send,
    stop,
    edit,
    clear,
    replaceMessages,
    scrollRef,
    onScroll,
  };
}
