import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PlayCircleIcon, DocumentTextIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import api from '../api';
import MarkdownContent from '../components/MarkdownContent';
import ChatPanel from '../components/ChatPanel';
import { useChat, type ChatMessage } from '../hooks/useChat';
import { useAuth } from '../AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MeetingSalesRep {
  id: number;
  email: string | null;
  display_name: string;
}

interface MeetingCompany {
  id: number;
  name: string;
  domains: string[];
}

interface MeetingPerson {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

interface MeetingRecording {
  id: number;
  engagement_id: string;
  title: string;
  summary: string | null;
  start_at: string | null;
}

interface MeetingDetail {
  id: number;
  external_uid: string;
  title: string;
  start_at: string | null;
  duration_minutes: number | null;
  summary: string | null;
  description: string | null;
  meeting_url: string | null;
  location: string | null;
  sales_reps: MeetingSalesRep[];
  meeting_recording_ids: number[];
  company_names: string[];
  person_names: string[];
  company_count: number;
  person_count: number;
  companies: MeetingCompany[];
  people: MeetingPerson[];
  meeting_recordings: MeetingRecording[];
}

interface RecordingDetail {
  id: number;
  transcript: string;
  summary: string | null;
  title: string;
}

interface LinkedCompanyBadge {
  id: number | null;
  name: string;
  domains: string[];
}

interface TranscriptSegment {
  timeSeconds: number;
  timeLabel: string;
  speaker: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRANSCRIPT_LINE_RE = /^\[(\d+):(\d{2}):(\d{2})\]\s+(.+?):\s*(.*)/;

function parseTranscript(raw: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let current: TranscriptSegment | null = null;

  for (const line of raw.split('\n')) {
    const match = line.match(TRANSCRIPT_LINE_RE);
    if (match) {
      if (current) segments.push(current);
      const [, h, m, s, speaker, text] = match;
      current = {
        timeSeconds: Number(h) * 3600 + Number(m) * 60 + Number(s),
        timeLabel: `${h}:${m}:${s}`,
        speaker,
        text,
      };
    } else if (current && line.trim()) {
      current.text += '\n' + line;
    }
  }
  if (current) segments.push(current);
  return segments;
}

function findActiveSegmentIndex(segments: TranscriptSegment[], time: number): number {
  let active = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].timeSeconds <= time) active = i;
    else break;
  }
  return active;
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildLinkedCompanies(
  companies: MeetingCompany[],
  companyNames: string[],
): LinkedCompanyBadge[] {
  const result: LinkedCompanyBadge[] = [];
  const seenIds = new Set<number>();
  const seenNames = new Set<string>();

  for (const c of companies) {
    const norm = c.name.trim().toLowerCase();
    if (!norm || seenIds.has(c.id)) continue;
    seenIds.add(c.id);
    seenNames.add(norm);
    result.push({ id: c.id, name: c.name, domains: c.domains });
  }

  for (const name of companyNames) {
    const norm = name.trim().toLowerCase();
    if (!norm || seenNames.has(norm)) continue;
    seenNames.add(norm);
    result.push({ id: null, name, domains: [] });
  }

  result.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return result;
}

// ---------------------------------------------------------------------------
// RecordingPlayer
// ---------------------------------------------------------------------------

function RecordingPlayer({
  mediaUrl,
  loading,
  mediaRef,
  onTimeUpdate,
}: {
  mediaUrl: string | null;
  loading: boolean;
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  onTimeUpdate: (time: number) => void;
}) {
  const [isAudioOnly, setIsAudioOnly] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-6">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
        <span className="text-sm text-zinc-400">Loading recording...</span>
      </div>
    );
  }

  if (!mediaUrl) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-zinc-400">No recording media available</p>
      </div>
    );
  }

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
    onTimeUpdate(e.currentTarget.currentTime);
  };

  if (isAudioOnly) {
    return (
      <div className="px-4 py-4">
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          controls
          preload="metadata"
          className="w-full"
          src={mediaUrl}
          onTimeUpdate={handleTimeUpdate}
        >
          Your browser does not support the audio element.
        </audio>
      </div>
    );
  }

  return (
    <div className="bg-zinc-950">
      <video
        ref={mediaRef as React.RefObject<HTMLVideoElement>}
        controls
        preload="metadata"
        className="mx-auto w-full"
        src={mediaUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth === 0 && v.videoHeight === 0) setIsAudioOnly(true);
        }}
        onError={() => setIsAudioOnly(true)}
      >
        Your browser does not support the video element.
      </video>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MeetingPage
// ---------------------------------------------------------------------------

export default function MeetingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [data, setData] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState(false);
  const [selectedRecordingIdx, setSelectedRecordingIdx] = useState(0);
  const [recordingDetail, setRecordingDetail] = useState<RecordingDetail | null>(null);
  const [recordingDetailLoading, setRecordingDetailLoading] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<'summary' | 'chat'>('summary');

  const buildChatBody = useCallback(
    ({ messages }: { messages: ChatMessage[] }) => {
      const selectedRec = data?.meeting_recordings[selectedRecordingIdx];
      return { messages, recording_id: selectedRec?.id ?? null };
    },
    [data, selectedRecordingIdx],
  );
  const chat = useChat({ endpoint: `/api/meetings/${id}/chat`, buildBody: buildChatBody });

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const activeSegmentRef = useRef<HTMLDivElement | null>(null);
  const userScrolledRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Fetch meeting data
  useEffect(() => {
    if (!id) return;
    setError(false);
    api
      .get<MeetingDetail>(`/api/meetings/${id}`)
      .then((res) => setData(res.data))
      .catch(() => setError(true));
  }, [id]);

  // Fetch recording detail + media URL for the selected recording
  const fetchRecordingData = useCallback((recordingId: number) => {
    setRecordingDetailLoading(true);
    setMediaLoading(true);
    setCurrentTime(0);

    api
      .get<RecordingDetail>(`/api/meeting-recordings/${recordingId}`)
      .then((res) => setRecordingDetail(res.data))
      .catch(() => setRecordingDetail(null))
      .finally(() => setRecordingDetailLoading(false));

    api
      .get<{ media_url: string | null }>(`/api/meeting-recordings/${recordingId}/media-url`)
      .then((res) => setMediaUrl(res.data.media_url))
      .catch(() => setMediaUrl(null))
      .finally(() => setMediaLoading(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setRecordingDetail(null);
      setMediaUrl(null);
      return;
    }
    if (!data || data.meeting_recordings.length === 0) return;
    const recording = data.meeting_recordings[selectedRecordingIdx];
    if (recording) fetchRecordingData(recording.id);
  }, [data, selectedRecordingIdx, fetchRecordingData, isAdmin]);

  // Parsed transcript segments & active-index tracking
  const segments = useMemo(
    () => (recordingDetail?.transcript ? parseTranscript(recordingDetail.transcript) : []),
    [recordingDetail?.transcript],
  );

  const activeIdx = useMemo(
    () => findActiveSegmentIndex(segments, currentTime),
    [segments, currentTime],
  );

  // Pin active segment to top of scroll container during playback
  useEffect(() => {
    if (userScrolledRef.current) return;
    const container = transcriptScrollRef.current;
    const segment = activeSegmentRef.current;
    if (activeIdx < 0 || !segment || !container) return;
    container.scrollTo({ top: segment.offsetTop - container.offsetTop, behavior: 'smooth' });
  }, [activeIdx]);

  // Pause auto-scroll while user is manually scrolling
  const handleTranscriptScroll = useCallback(() => {
    userScrolledRef.current = true;
    clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userScrolledRef.current = false;
    }, 4000);
  }, []);

  useEffect(() => () => clearTimeout(scrollTimeoutRef.current), []);

  // Seek media to a given timestamp (resilient to unloaded metadata)
  const seekTo = useCallback((seconds: number) => {
    const el = mediaRef.current;
    if (!el) return;

    const apply = () => {
      el.currentTime = seconds;
      setCurrentTime(seconds);
      userScrolledRef.current = false;
      if (el.paused) void el.play().catch(() => { });
    };

    if (el.readyState >= 1) {
      apply();
    } else {
      el.addEventListener('loadedmetadata', apply, { once: true });
    }
  }, []);

  // ---- Early returns -------------------------------------------------------

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-zinc-500">Meeting not found or failed to load.</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!data) return <p className="text-sm text-zinc-500">Loading meeting...</p>;

  // ---- Derived data --------------------------------------------------------

  const peopleRows = data.people.map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`.trim() || p.email,
    email: p.email,
  }));

  const linkedCompanies = buildLinkedCompanies(data.companies, data.company_names);
  const hasRecordings = isAdmin && data.meeting_recordings.length > 0;
  const selectedRecording = hasRecordings ? data.meeting_recordings[selectedRecordingIdx] : null;
  const hasTranscript = segments.length > 0;

  // ---- Render --------------------------------------------------------------

  return (
    <div className={hasRecordings ? 'flex gap-6' : ''}>
      {/* Main content */}
      <div className={hasRecordings ? 'min-w-0 flex-1' : ''}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 text-sm font-medium text-zinc-500 transition hover:text-zinc-700"
        >
          &larr; Back
        </button>

        <h1 className="mb-1.5 text-2xl font-semibold text-zinc-900">
          {data.title || 'Untitled meeting'}
        </h1>

        <div className="mb-6 flex flex-wrap items-center gap-x-2 text-sm text-zinc-500">
          {formatDateTime(data.start_at) && <span>{formatDateTime(data.start_at)}</span>}
          {data.duration_minutes && (
            <>
              <span className="text-zinc-300">&middot;</span>
              <span>{data.duration_minutes} min</span>
            </>
          )}
          {data.location && (
            <>
              <span className="text-zinc-300">&middot;</span>
              <span>{data.location}</span>
            </>
          )}
          {data.meeting_url && (
            <>
              <span className="text-zinc-300">&middot;</span>
              <a
                href={data.meeting_url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-indigo-600 hover:text-indigo-700"
              >
                Join link
              </a>
            </>
          )}
        </div>

        {(linkedCompanies.length > 0 || peopleRows.length > 0 || data.sales_reps.length > 0) && (
          <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Attendees
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {linkedCompanies.map((company) =>
                company.id ? (
                  <button
                    key={`c-${company.id}`}
                    type="button"
                    onClick={() => navigate(`/companies/${company.id}`, { state: { backTo: `/meetings/${id}`, backLabel: data.title || 'meeting' } })}
                    className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
                  >
                    {company.name}
                    {company.domains.length > 0 && (
                      <span className="text-indigo-400">({company.domains.join(', ')})</span>
                    )}
                  </button>
                ) : (
                  <span
                    key={`cn-${company.name}`}
                    className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600"
                  >
                    {company.name}
                  </span>
                ),
              )}
              {peopleRows.map((p) => (
                <button
                  key={`p-${p.id}`}
                  type="button"
                  onClick={() => navigate(`/people/${p.id}`, { state: { backTo: `/meetings/${id}`, backLabel: data.title || 'meeting' } })}
                  className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
                >
                  {p.name}
                </button>
              ))}
              {data.sales_reps.map((sr) => (
                <span
                  key={`sr-${sr.id}`}
                  className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                >
                  {sr.display_name}
                </span>
              ))}
            </div>
          </section>
        )}

        {(data.summary || hasRecordings) && (
          <section className="mb-6 rounded-lg border border-zinc-200 bg-white overflow-hidden">
            <div className="flex border-b border-zinc-100">
              <button
                type="button"
                onClick={() => setSidebarTab('summary')}
                className={`flex items-center gap-1.5 px-5 py-3 text-xs font-semibold uppercase tracking-wide transition ${sidebarTab === 'summary'
                    ? 'border-b-2 border-indigo-500 text-indigo-600'
                    : 'text-zinc-400 hover:text-zinc-600'
                  }`}
              >
                Summary
              </button>
              {hasRecordings && (
                <button
                  type="button"
                  onClick={() => setSidebarTab('chat')}
                  className={`flex items-center gap-1.5 px-5 py-3 text-xs font-semibold uppercase tracking-wide transition ${sidebarTab === 'chat'
                      ? 'border-b-2 border-indigo-500 text-indigo-600'
                      : 'text-zinc-400 hover:text-zinc-600'
                    }`}
                >
                  <ChatBubbleLeftRightIcon className="h-4 w-4" />
                  Chat
                </button>
              )}
            </div>

            {sidebarTab === 'summary' && (
              <div className="p-5">
                {data.summary ? (
                  <MarkdownContent content={data.summary} className="text-sm leading-relaxed text-zinc-700" />
                ) : (
                  <p className="text-sm text-zinc-400">No summary available yet.</p>
                )}
              </div>
            )}

            {sidebarTab === 'chat' && (
              <ChatPanel
                chat={chat}
                placeholder="Ask about this meeting..."
                emptyTitle="Ask anything about this meeting"
                emptyHint='e.g. "What were the key takeaways?"'
              />
            )}
          </section>
        )}

        {data.description && (
          <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 overflow-hidden">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Calendar Description
            </h2>
            <div
              className="text-sm text-zinc-600 whitespace-pre-line break-words [&_a]:text-indigo-600 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-indigo-700"
              dangerouslySetInnerHTML={{ __html: data.description }}
            />
          </section>
        )}
      </div>

      {/* Right sidebar — recording player & linked transcript */}
      {hasRecordings && (
        <aside className="w-[420px] shrink-0 sticky top-6 self-start">
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            {data.meeting_recordings.length > 1 && (
              <div className="border-b border-zinc-100 px-3 py-2 flex gap-1 overflow-x-auto">
                {data.meeting_recordings.map((rec, idx) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => setSelectedRecordingIdx(idx)}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition ${idx === selectedRecordingIdx
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 border border-transparent'
                      }`}
                  >
                    Recording {idx + 1}
                  </button>
                ))}
              </div>
            )}

            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <PlayCircleIcon className="h-4 w-4" />
                Recording
              </h2>
              {selectedRecording && (
                <p className="mt-1 truncate text-sm font-medium text-zinc-700" title={selectedRecording.title}>
                  {selectedRecording.title}
                </p>
              )}
            </div>

            <RecordingPlayer
              mediaUrl={mediaUrl}
              loading={mediaLoading}
              mediaRef={mediaRef}
              onTimeUpdate={setCurrentTime}
            />

            {/* Transcript */}
            <div className="border-t border-zinc-100">
              <div className="px-4 py-3">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <DocumentTextIcon className="h-4 w-4" />
                  Transcript
                  {hasTranscript && (
                    <span className="ml-auto text-[11px] font-normal text-zinc-400">
                      {segments.length} segments
                    </span>
                  )}
                </h2>
              </div>

              {recordingDetailLoading ? (
                <div className="flex items-center gap-2 px-4 py-6">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
                  <span className="text-sm text-zinc-400">Loading transcript...</span>
                </div>
              ) : hasTranscript ? (
                <div
                  ref={transcriptScrollRef}
                  onScroll={handleTranscriptScroll}
                  className="border-t border-zinc-100 max-h-[55vh] overflow-y-auto"
                >
                  {segments.map((seg, idx) => {
                    const isActive = idx === activeIdx;
                    return (
                      <div
                        key={idx}
                        ref={isActive ? activeSegmentRef : undefined}
                        role="button"
                        tabIndex={0}
                        onClick={() => seekTo(seg.timeSeconds)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            seekTo(seg.timeSeconds);
                          }
                        }}
                        className={`group cursor-pointer border-b border-zinc-50 px-4 py-2.5 transition-colors ${isActive
                            ? 'bg-indigo-50/70 border-l-2 border-l-indigo-400'
                            : 'hover:bg-zinc-50 border-l-2 border-l-transparent'
                          }`}
                      >
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span
                            className={`shrink-0 font-mono text-[11px] font-medium tabular-nums transition ${isActive
                                ? 'text-indigo-600'
                                : 'text-zinc-400 group-hover:text-indigo-500'
                              }`}
                          >
                            {seg.timeLabel}
                          </span>
                          <span
                            className={`text-xs font-semibold truncate ${isActive ? 'text-indigo-700' : 'text-zinc-600'
                              }`}
                          >
                            {seg.speaker}
                          </span>
                        </div>
                        <p
                          className={`text-sm leading-relaxed whitespace-pre-wrap ${isActive ? 'text-zinc-800' : 'text-zinc-600'
                            }`}
                        >
                          {seg.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="border-t border-zinc-100 px-4 py-6 text-center">
                  <p className="text-sm text-zinc-400">No transcript available</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
