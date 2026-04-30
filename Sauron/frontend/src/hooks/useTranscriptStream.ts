import { useCallback, useEffect, useRef, useState } from 'react';

export interface TranscriptUtterance {
  track: 'inbound_track' | 'outbound_track';
  text: string;
  is_final: boolean;
  sequence_id: number;
  timestamp: string;
}

type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'stopped' | 'error';

export function useTranscriptStream(sessionId: string | null) {
  const [utterances, setUtterances] = useState<TranscriptUtterance[]>([]);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(async (sid: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('connecting');
    setUtterances([]);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/dialer/transcript-stream/${sid}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setStatus('error');
        return;
      }

      setStatus('streaming');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();

          try {
            const event = JSON.parse(payload) as Record<string, unknown>;

            if (event.type === 'utterance') {
              const u: TranscriptUtterance = {
                track: event.track as TranscriptUtterance['track'],
                text: event.text as string,
                is_final: event.is_final as boolean,
                sequence_id: event.sequence_id as number,
                timestamp: event.timestamp as string,
              };
              setUtterances((prev) => {
                if (!u.is_final) {
                  const idx = prev.findIndex(
                    (p) => !p.is_final && p.track === u.track,
                  );
                  if (idx >= 0) {
                    const updated = [...prev];
                    updated[idx] = u;
                    return updated;
                  }
                }
                return [...prev, u];
              });
            } else if (event.type === 'stopped' || event.type === 'timeout') {
              setStatus('stopped');
            } else if (event.type === 'error') {
              setStatus('error');
            }
          } catch {
            // skip malformed
          }
        }
      }

      setStatus((s) => (s === 'streaming' ? 'stopped' : s));
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      connect(sessionId);
    } else {
      setUtterances([]);
      setStatus('idle');
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [sessionId, connect]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setUtterances([]);
    setStatus('idle');
  }, []);

  return { utterances, status, reset };
}
