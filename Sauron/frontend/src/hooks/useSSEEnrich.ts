import { useCallback, useRef, useState } from 'react';

interface EnrichStep {
  id: string;
  label: string;
  status: 'active' | 'done';
}

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Web search',
  enrich_person: 'Person lookup',
  enrich_organization: 'Company lookup',
};

function formatToolNames(tools: string[]): string {
  const counts: Record<string, number> = {};
  for (const t of tools) {
    const label = TOOL_LABELS[t] ?? t;
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([label, count]) => (count > 1 ? `${label} x${count}` : label))
    .join(', ');
}

interface UseSSEEnrichOptions {
  endpoint: string;
  formatDone: (event: Record<string, unknown>) => string;
  onFinally?: () => void;
}

export function useSSEEnrich({ endpoint, formatDone, onFinally }: UseSSEEnrichOptions) {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<EnrichStep[]>([]);
  const [result, setResult] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const addStep = useCallback((label: string) => {
    const stepId = `${Date.now()}-${Math.random()}`;
    setSteps((prev) => {
      const updated = prev.map((s) =>
        s.status === 'active' ? { ...s, status: 'done' as const } : s,
      );
      return [...updated, { id: stepId, label, status: 'active' as const }];
    });
  }, []);

  const markAllDone = useCallback(() => {
    setSteps((prev) => prev.map((s) => ({ ...s, status: 'done' as const })));
  }, []);

  const start = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setSteps([]);
    setResult('');
    addStep('Starting research...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error('Enrichment request failed');
      }

      const reader = response.body.getReader();
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
          if (payload === '[DONE]') continue;

          try {
            const event = JSON.parse(payload) as Record<string, unknown>;
            switch (event.event) {
              case 'started':
                addStep(`Researching ${event.company as string}...`);
                break;
              case 'progress':
                if (typeof event.message === 'string' && event.message.length > 0) {
                  addStep(event.message);
                } else if (event.status === 'thinking') {
                  addStep(`Round ${event.round}: Analyzing...`);
                } else if (event.status === 'calling_tools') {
                  addStep(`Round ${event.round}: ${formatToolNames((event.tools as string[]) ?? [])}`);
                } else if (event.status === 'extracting') {
                  addStep('Extracting results...');
                } else if (event.status === 'saving') {
                  addStep('Saving to database...');
                }
                break;
              case 'done':
                markAllDone();
                setResult(formatDone(event));
                break;
              case 'error':
                markAllDone();
                setResult((event.message as string) ?? 'Enrichment failed');
                break;
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      markAllDone();
      setResult('Enrichment failed');
    } finally {
      setRunning(false);
      abortRef.current = null;
      onFinally?.();
    }
  }, [endpoint, running, addStep, markAllDone, formatDone, onFinally]);

  return { running, steps, result, start };
}

export type { EnrichStep };
