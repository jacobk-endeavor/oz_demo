import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  ClockIcon,
  UserIcon,
  DocumentTextIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  HashtagIcon,
  PlayCircleIcon,
} from '@heroicons/react/24/outline';
import api from '../api';
import MarkdownContent from '../components/MarkdownContent';

interface CompanyRef {
  id: number;
  name: string;
  domains: string[];
}

interface PersonRef {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

interface SalesRepRef {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface MeetingRecordingDetail {
  id: number;
  engagement_id: string;
  title: string;
  summary: string | null;
  transcript: string;
  start_at: string | null;
  meeting_id: number | null;
  is_linked_to_meeting: boolean;
  linked_meeting_title: string | null;
  linked_meeting_company_names: string[];
  linked_meeting_person_names: string[];
  linked_meeting_sales_rep_names: string[];
  companies: CompanyRef[];
  people: PersonRef[];
  sales_reps: SalesRepRef[];
}

function formatDateTime(startAt: string | null): { date: string; time: string; relative: string } | null {
  if (!startAt) return null;
  const parsed = new Date(startAt);
  if (Number.isNaN(parsed.getTime())) return null;

  const date = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);

  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);

  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  const diffDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
  let relative: string;
  if (diffMs < 0) {
    relative = diffDays === 0 ? 'Later today' : diffDays === 1 ? 'Tomorrow' : `In ${diffDays} days`;
  } else {
    relative = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
  }

  return { date, time, relative };
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

const INITIALS_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
];

function colorForIndex(index: number): string {
  return INITIALS_COLORS[index % INITIALS_COLORS.length];
}

function MeetingPlayer({ mediaUrl, loading }: { mediaUrl: string | null; loading: boolean }) {
  const [isAudioOnly, setIsAudioOnly] = useState(false);

  if (loading) {
    return (
      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
          <span className="text-sm text-zinc-400">Loading recording...</span>
        </div>
      </section>
    );
  }

  if (!mediaUrl) return null;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-5 py-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <PlayCircleIcon className="h-4 w-4" />
          Recording
        </h2>
      </div>
      {isAudioOnly ? (
        <div className="px-5 py-4">
          <audio controls preload="metadata" className="w-full" src={mediaUrl}>
            Your browser does not support the audio element.
          </audio>
        </div>
      ) : (
        <div className="bg-zinc-950">
          <video
            controls
            preload="metadata"
            className="mx-auto max-h-[480px] w-full"
            src={mediaUrl}
            onLoadedMetadata={(e) => {
              const video = e.currentTarget;
              if (video.videoWidth === 0 && video.videoHeight === 0) {
                setIsAudioOnly(true);
              }
            }}
            onError={() => setIsAudioOnly(true)}
          >
            Your browser does not support the video element.
          </video>
        </div>
      )}
    </section>
  );
}

export default function MeetingRecordingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<MeetingRecordingDetail | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [error, setError] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/api/meeting-recordings/${id}`)
      .then((res) => setData(res.data))
      .catch(() => setError(true));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setMediaLoading(true);
    api
      .get<{ media_url: string | null }>(`/api/meeting-recordings/${id}/media-url`)
      .then((res) => setMediaUrl(res.data.media_url))
      .catch(() => setMediaUrl(null))
      .finally(() => setMediaLoading(false));
  }, [id]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-zinc-500">Meeting recording not found or failed to load.</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Back
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 py-20 justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
        <p className="text-sm text-zinc-500">Loading meeting recording...</p>
      </div>
    );
  }

  const dt = formatDateTime(data.start_at);
  const hasTranscript = Boolean(data.transcript?.trim());
  const transcriptPreviewLines = 12;
  const transcriptLines = data.transcript?.split('\n') ?? [];
  const transcriptIsLong = transcriptLines.length > transcriptPreviewLines;
  const displayedTranscript = transcriptExpanded
    ? data.transcript
    : transcriptLines.slice(0, transcriptPreviewLines).join('\n');
  const linkedMeetingCompanyNames = data.linked_meeting_company_names.filter(Boolean);
  const linkedMeetingPersonNames = data.linked_meeting_person_names.filter(Boolean);
  const linkedMeetingSalesRepNames = data.linked_meeting_sales_rep_names.filter(Boolean);

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-700"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Back
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 leading-tight">
          {data.title || 'Untitled Meeting Recording'}
        </h1>
        {dt && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDaysIcon className="h-4 w-4 text-zinc-400" />
              {dt.date}
            </span>
            <span className="text-zinc-300">|</span>
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="h-4 w-4 text-zinc-400" />
              {dt.time}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
              {dt.relative}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                data.is_linked_to_meeting
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-zinc-100 text-zinc-600'
              }`}
            >
              {data.is_linked_to_meeting ? 'Linked to meeting' : 'Not linked to meeting'}
            </span>
          </div>
        )}
        {!dt && (
          <p className="mt-2 text-sm text-zinc-400">No scheduled time</p>
        )}
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400">
            <HashtagIcon className="h-4 w-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Engagement</span>
          </div>
          <p className="mt-1.5 truncate text-sm font-semibold text-zinc-800" title={data.engagement_id}>
            {data.engagement_id}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400">
            <UserIcon className="h-4 w-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Team</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-zinc-800">{data.sales_reps.length}</p>
        </div>
      </div>

      {/* Meeting Recording Player */}
      <MeetingPlayer mediaUrl={mediaUrl} loading={mediaLoading} />

      {data.is_linked_to_meeting && (
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Linked Meeting Context
          </h2>
          {data.linked_meeting_title ? (
            <p className="mb-3 text-sm font-semibold text-zinc-800">{data.linked_meeting_title}</p>
          ) : null}
          {linkedMeetingSalesRepNames.length > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Sales Reps:</span>
              {linkedMeetingSalesRepNames.map((name) => (
                <span
                  key={`linked-sr-${name}`}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : null}
          {linkedMeetingPersonNames.length > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">People:</span>
              {linkedMeetingPersonNames.map((personName) => (
                <span
                  key={`linked-person-${personName}`}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700"
                >
                  {personName}
                </span>
              ))}
            </div>
          ) : null}
          {linkedMeetingCompanyNames.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Companies:</span>
              {linkedMeetingCompanyNames.map((companyName) => (
                <span
                  key={`linked-company-${companyName}`}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700"
                >
                  {companyName}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      )}

      {/* Summary */}
      {data.summary && (
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <DocumentTextIcon className="h-4 w-4" />
            Summary
          </h2>
          <MarkdownContent content={data.summary} className="text-sm leading-relaxed text-zinc-700" />
        </section>
      )}

      {/* Sales Reps */}
      {data.sales_reps.length > 0 && (
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-3">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <UserIcon className="h-4 w-4" />
              Sales Reps
              <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
                {data.sales_reps.length}
              </span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-3 px-5 py-4">
            {data.sales_reps.map((sr, idx) => {
              const displayName =
                [sr.first_name, sr.last_name].filter(Boolean).join(' ') ||
                sr.email ||
                'Unknown';
              return (
                <div
                  key={sr.id}
                  className="flex items-center gap-2.5 rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${colorForIndex(idx + 1)}`}
                  >
                    {getInitials(displayName)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-700">{displayName}</p>
                    {sr.email && displayName !== sr.email && (
                      <p className="truncate text-[11px] text-zinc-400">{sr.email}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Transcript */}
      <section className="mb-2 rounded-xl border border-zinc-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setTranscriptExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-zinc-50"
        >
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <DocumentTextIcon className="h-4 w-4" />
            Transcript
          </h2>
          {hasTranscript && (
            transcriptExpanded ? (
              <ChevronUpIcon className="h-4 w-4 text-zinc-400" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 text-zinc-400" />
            )
          )}
        </button>
        {hasTranscript ? (
          <div className="border-t border-zinc-100 px-5 py-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-600">
              {displayedTranscript}
            </pre>
            {transcriptIsLong && !transcriptExpanded && (
              <button
                type="button"
                onClick={() => setTranscriptExpanded(true)}
                className="mt-3 text-xs font-medium text-indigo-600 transition hover:text-indigo-700"
              >
                Show full transcript ({transcriptLines.length} lines)
              </button>
            )}
          </div>
        ) : (
          <div className="border-t border-zinc-100 px-5 py-6 text-center">
            <p className="text-sm text-zinc-400">No transcript available</p>
          </div>
        )}
      </section>
    </div>
  );
}
