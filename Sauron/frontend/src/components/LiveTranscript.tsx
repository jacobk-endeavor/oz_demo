import { useEffect, useRef } from 'react';
import type { TranscriptUtterance } from '../hooks/useTranscriptStream';

const TRACK_LABEL: Record<string, string> = {
  inbound_track: 'You',
  outbound_track: 'Customer',
};

const TRACK_STYLE: Record<string, string> = {
  inbound_track: 'text-emerald-700 bg-emerald-50',
  outbound_track: 'text-blue-700 bg-blue-50',
};

export default function LiveTranscript({
  utterances,
  streaming,
}: {
  utterances: TranscriptUtterance[];
  streaming: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [utterances]);

  const finalUtterances = utterances.filter((u) => u.is_final);

  if (finalUtterances.length === 0 && !streaming) return null;

  return (
    <div className="rounded-md border border-zinc-200 bg-white">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
        <div className="flex items-center gap-1.5">
          {streaming && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          <span className="text-xs font-semibold text-zinc-700">
            Live Transcript
          </span>
        </div>
      </div>

      <div className="max-h-52 overflow-y-auto px-3 py-2 space-y-1.5">
        {finalUtterances.map((u, i) => (
          <div key={`${u.sequence_id}-${i}`} className="flex gap-2 text-xs leading-relaxed">
            <span
              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                TRACK_STYLE[u.track] ?? 'text-zinc-500 bg-zinc-100'
              }`}
            >
              {TRACK_LABEL[u.track] ?? u.track}
            </span>
            <span className={`text-zinc-800 ${!u.is_final ? 'italic text-zinc-400' : ''}`}>
              {u.text}
            </span>
          </div>
        ))}

        {streaming && finalUtterances.length === 0 && (
          <p className="text-xs text-zinc-400 italic">Waiting for speech...</p>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
