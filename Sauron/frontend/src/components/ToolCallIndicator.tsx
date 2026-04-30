import { useState, useRef, useCallback } from 'react';
import { MagnifyingGlassIcon, ChevronRightIcon, DocumentTextIcon, BuildingOfficeIcon, GlobeAltIcon, UserIcon, EnvelopeIcon } from '@heroicons/react/20/solid';

export interface TranscriptChunk {
  title: string;
  start_ts: string;
  end_ts: string;
  speakers: string[];
  text: string;
}

export interface ToolCallInfo {
  name: string;
  arguments: Record<string, unknown>;
  metadata?: unknown;
  result?: string;
  status: 'calling' | 'done';
}

function friendlyLabel(tc: ToolCallInfo): string {
  if (tc.name === 'search_transcripts') {
    const q = (tc.arguments as { query?: string }).query;
    if (tc.status === 'calling') return 'Searching transcripts…';
    const chunks = tc.metadata as TranscriptChunk[] | undefined;
    const count = chunks?.length ?? 0;
    const suffix = count > 0 ? ` · ${count} result${count !== 1 ? 's' : ''}` : '';
    return q ? `Searched for "${q}"${suffix}` : `Searched transcripts${suffix}`;
  }
  if (tc.name === 'read_transcript') {
    if (tc.status === 'calling') return 'Reading transcript…';
    const meta = tc.metadata as { title?: string } | undefined;
    return meta?.title ? `Read transcript: ${meta.title}` : 'Read transcript';
  }
  if (tc.name === 'get_company_info') {
    const name = (tc.arguments as { company_name?: string }).company_name;
    if (tc.status === 'calling') return `Looking up ${name ?? 'company'}…`;
    return `Looked up ${name ?? 'company'}`;
  }
  if (tc.name === 'get_company_emails') {
    const args = tc.arguments as {
      company_name?: string;
      query?: string;
      retrieval_mode?: 'recent' | 'date_range' | 'all';
      limit?: number;
      start_date?: string;
      end_date?: string;
    };
    const meta = tc.metadata as {
      company_name?: string;
      query?: string;
      retrieval_mode?: 'recent' | 'date_range' | 'all';
      limit?: number | null;
      start_date?: string | null;
      end_date?: string | null;
      result_count?: number;
    } | undefined;
    const company = meta?.company_name ?? args.company_name ?? 'company';
    const query = meta?.query ?? args.query;
    const mode = meta?.retrieval_mode ?? args.retrieval_mode ?? 'recent';
    const criteria = describeCompanyEmailCriteria({
      retrieval_mode: mode,
      limit: meta?.limit ?? args.limit,
      start_date: meta?.start_date ?? args.start_date,
      end_date: meta?.end_date ?? args.end_date,
      fallbackCount: meta?.result_count,
    });
    if (tc.status === 'calling') return `Looking up ${criteria} for ${company}…`;
    const count = meta?.result_count ?? 0;
    const suffix = count > 0 ? ` · ${count} email${count !== 1 ? 's' : ''}` : ' · 0 emails';
    return query
      ? `Found ${criteria} for ${company} matching "${query}"${suffix}`
      : `Found ${criteria} for ${company}${suffix}`;
  }
  if (tc.name === 'web_search') {
    const obj = (tc.arguments as { objective?: string }).objective;
    if (tc.status === 'calling') return 'Searching the web…';
    const meta = tc.metadata as { result_count?: number } | undefined;
    const count = meta?.result_count ?? 0;
    const suffix = count > 0 ? ` · ${count} result${count !== 1 ? 's' : ''}` : '';
    return obj ? `Searched "${obj}"${suffix}` : `Searched the web${suffix}`;
  }
  if (tc.name === 'enrich_person') {
    const args = tc.arguments as { name?: string; first_name?: string; last_name?: string };
    const label = args.name || [args.first_name, args.last_name].filter(Boolean).join(' ') || 'person';
    if (tc.status === 'calling') return `Looking up ${label}…`;
    return `Enriched ${label}`;
  }
  if (tc.name === 'enrich_organization') {
    const domain = (tc.arguments as { domain?: string }).domain;
    if (tc.status === 'calling') return `Looking up ${domain ?? 'organization'}…`;
    const meta = tc.metadata as { name?: string } | undefined;
    return `Enriched ${meta?.name ?? domain ?? 'organization'}`;
  }
  if (tc.status === 'calling') return `Calling ${tc.name}…`;
  return `Called ${tc.name}`;
}

function toolIcon(name: string) {
  switch (name) {
    case 'read_transcript': return DocumentTextIcon;
    case 'get_company_info': return BuildingOfficeIcon;
    case 'get_company_emails': return EnvelopeIcon;
    case 'enrich_organization': return BuildingOfficeIcon;
    case 'web_search': return GlobeAltIcon;
    case 'enrich_person': return UserIcon;
    default: return MagnifyingGlassIcon;
  }
}

const infoKeyLabels: Record<string, string> = {
  name: 'Name',
  summary: 'Summary',
  vertical: 'Vertical',
  revenue: 'Revenue',
  employee_count: 'Employees',
  location_count: 'Locations',
  linkedin: 'LinkedIn',
  erp: 'ERP',
  competitor: 'Competitor',
  is_named_account: 'Named account',
  industry_groups: 'Industries',
  key_facts: 'Key facts',
};

function ChunkCard({ chunk }: { chunk: TranscriptChunk }) {
  const [open, setOpen] = useState(false);
  const preview = chunk.text.length > 180 ? chunk.text.slice(0, 180) + '…' : chunk.text;

  return (
    <div className="rounded-md border border-zinc-200 bg-white text-xs">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-start gap-2 p-2 text-left"
      >
        <ChevronRightIcon
          className={`mt-0.5 h-3 w-3 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-zinc-700 truncate">{chunk.title}</span>
            <span className="shrink-0 text-[10px] text-zinc-400">
              {chunk.start_ts} – {chunk.end_ts}
            </span>
          </div>
          {chunk.speakers.length > 0 && (
            <div className="mt-0.5 text-[10px] text-zinc-400">
              {chunk.speakers.join(', ')}
            </div>
          )}
          {!open && (
            <p className="mt-1 text-zinc-500 leading-relaxed line-clamp-2">{preview}</p>
          )}
        </div>
      </button>
      {open && (
        <div className="border-t border-zinc-100 px-2 pb-2 pt-1.5">
          <p className="whitespace-pre-wrap text-zinc-600 leading-relaxed">{chunk.text}</p>
        </div>
      )}
    </div>
  );
}

function CompanyInfoPanel({ info }: { info: Record<string, unknown> }) {
  const entries = Object.entries(info).filter(([, v]) => v != null);
  if (entries.length === 0) return null;

  return (
    <div className="mt-1.5 rounded-md border border-zinc-200 bg-white text-xs">
      <dl className="divide-y divide-zinc-100">
        {entries.map(([key, value]) => (
          <div key={key} className="flex gap-3 px-2.5 py-1.5">
            <dt className="shrink-0 w-24 font-medium text-zinc-500">
              {infoKeyLabels[key] ?? key}
            </dt>
            <dd className="min-w-0 text-zinc-700 break-words">
              {Array.isArray(value)
                ? value.map((v, i) => (
                    typeof v === 'object'
                      ? <div key={i} className="mb-0.5">{JSON.stringify(v)}</div>
                      : <span key={i}>{i > 0 ? ', ' : ''}{String(v)}</span>
                  ))
                : typeof value === 'boolean'
                  ? (value ? 'Yes' : 'No')
                  : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TranscriptInfoPanel({ info }: { info: Record<string, unknown> }) {
  return (
    <div className="mt-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs text-zinc-600">
      <span className="font-medium text-zinc-700">{String(info.title ?? 'Transcript')}</span>
      {info.char_count != null && (
        <span className="ml-2 text-zinc-400">
          {Number(info.char_count).toLocaleString()} characters
        </span>
      )}
    </div>
  );
}

interface WebSearchResult {
  title: string;
  url: string;
  publish_date?: string | null;
}

function WebSearchPanel({ results }: { results: WebSearchResult[] }) {
  if (results.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 max-h-64 overflow-y-auto">
      {results.map((r, i) => (
        <a
          key={i}
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
        >
          <GlobeAltIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-zinc-700 truncate">{r.title}</div>
            <div className="mt-0.5 text-[10px] text-zinc-400 truncate">{r.url}</div>
            {r.publish_date && (
              <div className="mt-0.5 text-[10px] text-zinc-400">{r.publish_date}</div>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}

interface CompanyEmailResult {
  occurred_at?: string | null;
  direction?: string | null;
  subject?: string | null;
  from_email?: string | null;
  participant_emails?: string[];
  thread_summary?: string | null;
  preview?: string | null;
}

interface CompanyEmailsMetadata {
  company_name?: string;
  query?: string | null;
  retrieval_mode?: 'recent' | 'date_range' | 'all';
  limit?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  result_count?: number;
  truncated?: boolean;
  emails?: CompanyEmailResult[];
}

const DEFAULT_COMPANY_EMAIL_LIMIT = 20;

function formatOccurredAt(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDateRangeBound(value?: string | null): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function describeCompanyEmailCriteria(input: {
  retrieval_mode?: 'recent' | 'date_range' | 'all';
  limit?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  fallbackCount?: number;
}): string {
  if (input.retrieval_mode === 'all') return 'all emails';
  if (input.retrieval_mode === 'date_range') {
    return `emails from ${formatDateRangeBound(input.start_date)} to ${formatDateRangeBound(input.end_date)}`;
  }
  return `${input.limit ?? input.fallbackCount ?? DEFAULT_COMPANY_EMAIL_LIMIT} emails`;
}

function CompanyEmailsPanel({ meta }: { meta: CompanyEmailsMetadata }) {
  const emails = meta.emails ?? [];
  const header = meta.company_name ?? 'Company';
  const criteria = meta.retrieval_mode === 'all'
    ? 'All matching emails'
    : meta.retrieval_mode === 'date_range'
      ? `Range: ${formatDateRangeBound(meta.start_date)} to ${formatDateRangeBound(meta.end_date)}`
      : `Most recent ${meta.limit ?? (emails.length || DEFAULT_COMPANY_EMAIL_LIMIT)}`;

  return (
    <div className="mt-1.5 rounded-md border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-2.5 py-2 text-xs text-zinc-600">
        <span className="font-medium text-zinc-700">{header}</span>
        <span className="ml-2 text-zinc-500">{criteria}</span>
        {meta.query && <span className="ml-2 text-zinc-500">Filter: {meta.query}</span>}
        {meta.result_count != null && (
          <span className="ml-2 text-zinc-400">
            {meta.result_count} email{meta.result_count !== 1 ? 's' : ''}
          </span>
        )}
        {meta.truncated && <span className="ml-2 text-amber-600">truncated</span>}
      </div>
      {emails.length > 0 ? (
        <div className="max-h-72 overflow-y-auto">
          {emails.map((email, i) => (
            <div key={i} className="border-t border-zinc-100 px-2.5 py-2 first:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-zinc-700">
                    {email.subject || '(no subject)'}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                    {email.direction || 'email'}
                  </div>
                </div>
                {formatOccurredAt(email.occurred_at) && (
                  <div className="shrink-0 text-[10px] text-zinc-400">
                    {formatOccurredAt(email.occurred_at)}
                  </div>
                )}
              </div>
              {email.from_email && (
                <div className="mt-1 text-[11px] text-zinc-500">
                  From: {email.from_email}
                </div>
              )}
              {email.participant_emails && email.participant_emails.length > 0 && (
                <div className="mt-0.5 text-[11px] text-zinc-500 break-words">
                  Participants: {email.participant_emails.join(', ')}
                </div>
              )}
              {email.thread_summary && (
                <div className="mt-1 text-[11px] text-zinc-600">
                  Summary: {email.thread_summary}
                </div>
              )}
              {email.preview && (
                <div className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                  {email.preview}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="px-2.5 py-2 text-xs text-zinc-500">No emails found.</div>
      )}
    </div>
  );
}

const enrichPersonLabels: Record<string, string> = {
  name: 'Name',
  title: 'Title',
  email: 'Email',
  linkedin_url: 'LinkedIn',
  organization: 'Organization',
};

const enrichOrgLabels: Record<string, string> = {
  name: 'Name',
  domain: 'Domain',
  industry: 'Industry',
  employees: 'Employees',
  annual_revenue: 'Annual Revenue',
  total_funding: 'Total Funding',
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function formatEnrichValue(key: string, value: unknown): React.ReactNode {
  if ((key === 'annual_revenue' || key === 'total_funding') && typeof value === 'number')
    return formatCurrency(value);
  if (key === 'employees' && typeof value === 'number')
    return value.toLocaleString();
  if (key === 'linkedin_url' && typeof value === 'string')
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
        {value}
      </a>
    );
  return String(value);
}

function EnrichPanel({ info, labels }: { info: Record<string, unknown>; labels: Record<string, string> }) {
  const entries = Object.entries(info).filter(([, v]) => v != null);
  if (entries.length === 0) return null;

  return (
    <div className="mt-1.5 rounded-md border border-zinc-200 bg-white text-xs">
      <dl className="divide-y divide-zinc-100">
        {entries.map(([key, value]) => (
          <div key={key} className="flex gap-3 px-2.5 py-1.5">
            <dt className="shrink-0 w-28 font-medium text-zinc-500">
              {labels[key] ?? key}
            </dt>
            <dd className="min-w-0 text-zinc-700 break-words">
              {formatEnrichValue(key, value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ExpandedContent({ toolCall }: { toolCall: ToolCallInfo }) {
  if (toolCall.name === 'search_transcripts' && Array.isArray(toolCall.metadata) && toolCall.metadata.length > 0) {
    return (
      <div className="mt-1.5 flex flex-col gap-1.5 max-h-64 overflow-y-auto">
        {(toolCall.metadata as TranscriptChunk[]).map((chunk, i) => (
          <ChunkCard key={i} chunk={chunk} />
        ))}
      </div>
    );
  }
  if (toolCall.name === 'get_company_info' && toolCall.metadata) {
    return <CompanyInfoPanel info={toolCall.metadata as Record<string, unknown>} />;
  }
  if (toolCall.name === 'get_company_emails' && toolCall.metadata) {
    return <CompanyEmailsPanel meta={toolCall.metadata as CompanyEmailsMetadata} />;
  }
  if (toolCall.name === 'read_transcript' && toolCall.metadata) {
    return <TranscriptInfoPanel info={toolCall.metadata as Record<string, unknown>} />;
  }
  if (toolCall.name === 'web_search' && toolCall.metadata) {
    const meta = toolCall.metadata as { results?: WebSearchResult[] };
    if (meta.results && meta.results.length > 0) {
      return <WebSearchPanel results={meta.results} />;
    }
  }
  if (toolCall.name === 'enrich_person' && toolCall.metadata) {
    return <EnrichPanel info={toolCall.metadata as Record<string, unknown>} labels={enrichPersonLabels} />;
  }
  if (toolCall.name === 'enrich_organization' && toolCall.metadata) {
    return <EnrichPanel info={toolCall.metadata as Record<string, unknown>} labels={enrichOrgLabels} />;
  }
  if (toolCall.result) {
    return (
      <pre className="mt-1.5 max-h-48 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2.5 text-[11px] leading-relaxed text-zinc-600 whitespace-pre-wrap">
        {toolCall.result}
      </pre>
    );
  }
  return null;
}

export default function ToolCallIndicator({ toolCall }: { toolCall: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState<number | 'auto'>(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const calling = toolCall.status === 'calling';
  const hasContent = toolCall.metadata != null || toolCall.result != null;
  const Icon = toolIcon(toolCall.name);

  const toggle = useCallback(() => {
    if (calling || !hasContent) return;
    const el = contentRef.current;
    if (!el) {
      setExpanded((p) => !p);
      return;
    }

    if (expanded) {
      setHeight(el.scrollHeight);
      requestAnimationFrame(() => {
        setHeight(0);
        const onEnd = () => {
          setExpanded(false);
          setHeight(0);
          el.removeEventListener('transitionend', onEnd);
        };
        el.addEventListener('transitionend', onEnd, { once: true });
      });
    } else {
      setExpanded(true);
      requestAnimationFrame(() => {
        const fullH = el.scrollHeight;
        setHeight(0);
        requestAnimationFrame(() => {
          setHeight(fullH);
          const onEnd = () => {
            setHeight('auto');
            el.removeEventListener('transitionend', onEnd);
          };
          el.addEventListener('transitionend', onEnd, { once: true });
        });
      });
    }
  }, [calling, hasContent, expanded]);

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={toggle}
        disabled={calling || !hasContent}
        className="flex items-center gap-1.5 text-xs text-left text-zinc-500 hover:text-zinc-700 transition-colors disabled:hover:text-zinc-500"
      >
        <span key={toolCall.status} className="inline-flex items-center gap-1.5 tool-fade-in">
          {calling ? (
            <svg className="h-3.5 w-3.5 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
            </svg>
          ) : (
            <Icon className="h-3.5 w-3.5 text-zinc-400" />
          )}
          <span>{friendlyLabel(toolCall)}</span>
        </span>
        {!calling && hasContent && (
          <ChevronRightIcon
            className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          />
        )}
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-[height] duration-300 ease-in-out"
        style={{ height: expanded ? height : 0 }}
      >
        {expanded && <ExpandedContent toolCall={toolCall} />}
      </div>
    </div>
  );
}