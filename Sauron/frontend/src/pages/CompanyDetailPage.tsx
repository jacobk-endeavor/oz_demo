import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ChatBubbleLeftRightIcon, CalendarIcon, EnvelopeIcon, SparklesIcon } from '@heroicons/react/24/outline';
import api from '../api';
import { weeksSince, formatEngagementWeeks } from '../dateUtils';
import { getStageBadgeColor } from '../dealStageUtils';
import DetailFields from '../components/DetailFields';
import DataTable from '../components/DataTable';
import MarkdownContent from '../components/MarkdownContent';
import ChatPanel from '../components/ChatPanel';
import { useChat, type ChatMessage } from '../hooks/useChat';
import { useSSEEnrich, type EnrichStep } from '../hooks/useSSEEnrich';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompanyRef {
  id: number;
  name: string;
  domains: string[];
}

interface IndustryGroupRef {
  id: number;
  name: string;
  domains: string[];
  vertical: string | null;
}

interface PositionNested {
  id: number;
  title: string;
  role: string | null;
  person_id: number;
  person_first_name: string;
  person_last_name: string;
  meeting_count: number;
}

interface MeetingSalesRepNested {
  id: number;
  display_name: string;
}

interface MeetingNested {
  id: number;
  title: string;
  start_at: string | null;
  duration_minutes: number | null;
  sales_reps: MeetingSalesRepNested[];
}

interface CompanyKeyFacts {
  products_of_interest: string[];
  other_products_detail: string;
  order_entry_volume: number | null;
  accounts_payable_volume: number | null;
  accounts_receivable_volume: number | null;
  annual_revenue: number | null;
  key_contact_name: string;
  key_contact_description: string;
  main_concerns: string[];
  main_selling_points: string[];
  erp_system: string;
  actively_migrating_erp: boolean;
  next_step: string;
  deal_stage: string;
}

interface CompanyDetail {
  id: number;
  name: string;
  domains: string[];
  summary: string | null;
  key_facts: CompanyKeyFacts | null;
  vertical: string | null;
  revenue: string | null;
  annual_revenue: number | null;
  employee_count: number | null;
  location_count: number | null;
  linkedin: string | null;
  erp: string | null;
  competitor: string | null;
  is_named_account: boolean;
  parent_company_id: number | null;
  parent_company: CompanyRef | null;
  subsidiaries: CompanyRef[];
  industry_groups: IndustryGroupRef[];
  positions: PositionNested[];
  meetings: MeetingNested[];
}

interface CompanyCorrespondenceUser {
  id: number;
  email: string;
  display_name: string;
}

interface CompanyCorrespondenceOwner {
  hubspot_owner_id: string | null;
  sales_rep_id: number | null;
  user_id: number | null;
  display_name: string | null;
  email: string | null;
}

interface CompanyCorrespondenceItem {
  id: number;
  hubspot_email_id: string;
  direction: 'sent' | 'received';
  hubspot_direction: string | null;
  hubspot_status: string | null;
  subject: string;
  body_preview: string | null;
  from_email: string | null;
  to_emails: string[];
  cc_emails: string[];
  bcc_emails: string[];
  participant_emails: string[];
  occurred_at: string;
  hubspot_url: string | null;
  owner: CompanyCorrespondenceOwner | null;
  users: CompanyCorrespondenceUser[];
}

interface CompanyCorrespondenceResponse {
  items: CompanyCorrespondenceItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) +
    ' at ' +
    d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  );
}

function formatCurrency(value: number | null): string | null {
  if (value == null) return null;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function formatVolume(value: number | null): string | null {
  if (value == null) return null;
  return value.toLocaleString('en-US') + '/yr';
}

function formatCompanyRevenue(annualRevenue: number | null, legacyRevenue: string | null): string | null {
  return formatCurrency(annualRevenue) ?? legacyRevenue;
}

function joinEmails(emails: string[]): string {
  return emails.length > 0 ? emails.join(', ') : '—';
}

function directionBadgeClass(direction: 'sent' | 'received'): string {
  return direction === 'sent'
    ? 'bg-indigo-50 text-indigo-700 ring-indigo-600/20'
    : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function EnrichProgress({ steps }: { steps: EnrichStep[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
  }, [steps.length]);

  return (
    <div ref={containerRef} className="max-h-48 overflow-hidden px-1">
      <ul className="space-y-1.5">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2 text-xs">
            {step.status === 'active' ? (
              <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
            )}
            <span className={step.status === 'active' ? 'text-zinc-500' : 'text-zinc-400'}>
              {step.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function useAutoHide(active: boolean, delay = 3000) {
  const [visible, setVisible] = useState(false);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      setVisible(true);
    } else if (wasActiveRef.current) {
      wasActiveRef.current = false;
      const timer = setTimeout(() => setVisible(false), delay);
      return () => clearTimeout(timer);
    }
  }, [active, delay]);

  return visible;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CompanyDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<CompanyDetail | null>(null);
  const [mainTab, setMainTab] = useState<'summary' | 'chat' | 'correspondence'>('summary');
  const [correspondence, setCorrespondence] = useState<CompanyCorrespondenceResponse | null>(null);
  const [correspondenceLoading, setCorrespondenceLoading] = useState(false);
  const [correspondencePage, setCorrespondencePage] = useState(1);

  const buildChatBody = useCallback(
    ({ messages }: { messages: ChatMessage[] }) => ({ messages }),
    [],
  );
  const chat = useChat({ endpoint: `/api/companies/${id}/chat`, buildBody: buildChatBody });

  const navState = location.state as { backTo?: string; backLabel?: string } | null;
  const backTo = navState?.backTo;
  const backLabel = navState?.backLabel;

  const fetchCompany = useCallback(() => {
    api.get(`/api/companies/${id}`).then((res) => setData(res.data));
  }, [id]);

  const fetchCorrespondence = useCallback(() => {
    if (!id) return;
    setCorrespondenceLoading(true);
    api
      .get<CompanyCorrespondenceResponse>(`/api/companies/${id}/correspondence`, {
        params: { page: correspondencePage, page_size: 25 },
      })
      .then((res) => setCorrespondence(res.data))
      .catch(() => setCorrespondence(null))
      .finally(() => setCorrespondenceLoading(false));
  }, [correspondencePage, id]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  useEffect(() => {
    setCorrespondencePage(1);
    setCorrespondence(null);
  }, [id]);

  useEffect(() => {
    if (mainTab !== 'correspondence') return;
    fetchCorrespondence();
  }, [fetchCorrespondence, mainTab]);

  const profileEnrich = useSSEEnrich({
    endpoint: `/api/companies/${id}/enrich-profile`,
    formatDone: useCallback(
      (event: Record<string, unknown>) => {
        if (event.mode === 'meeting_classification') {
          const summaryUpdated = Boolean(event.summary_updated);
          const keyFactsUpdated = Boolean(event.key_facts_updated);
          if (summaryUpdated && keyFactsUpdated) return 'Updated summary and key facts from meetings';
          if (keyFactsUpdated) return 'Updated key facts from meetings';
          if (summaryUpdated) return 'Updated summary from meetings';
          return 'Summary and key facts were already up to date';
        }
        return `Updated ${event.fields_updated ?? 0} field(s)`;
      },
      [],
    ),
    onFinally: fetchCompany,
  });

  const engagementLabel = useMemo(() => {
    const dates = data?.meetings.map((m) => m.start_at).filter((d): d is string => d != null);
    if (!dates || dates.length === 0) return null;
    const earliest = dates.reduce((a, b) => (a < b ? a : b));
    return formatEngagementWeeks(weeksSince(earliest));
  }, [data?.meetings]);
  const progressVisible = useAutoHide(profileEnrich.running);
  const showEnrichProgress = progressVisible && profileEnrich.steps.length > 0;

  if (!data) return <p className="text-sm text-zinc-500">Loading...</p>;

  const hasMeetings = data.meetings.length > 0;

  return (
    <div className="flex gap-6">
      {/* ------------------------------------------------------------------ */}
      {/* Main content                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => backTo ? navigate(backTo) : navigate('/companies')}
          className="mb-4 text-sm font-medium text-zinc-500 transition hover:text-zinc-700"
        >
          &larr; Back to {backLabel || 'Companies'}
        </button>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <h1 className="text-3xl font-semibold text-zinc-900">{data.name}</h1>
            </div>
            <div className="mt-1 flex items-center gap-x-2 text-sm text-zinc-500">
              {data.vertical && <span>{data.vertical}</span>}
              {data.domains.length > 0 && (
                <>
                  {data.vertical && <span className="text-zinc-300">&middot;</span>}
                  <a
                    href={`https://${data.domains[0]}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-zinc-400 hover:text-zinc-600"
                  >
                    {data.domains[0]}
                  </a>
                </>
              )}
              {data.linkedin && (
                <>
                  <span className="text-zinc-300">&middot;</span>
                  <a
                    href={data.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-zinc-400 hover:text-zinc-600"
                  >
                    LinkedIn
                  </a>
                </>
              )}
              {engagementLabel && (
                <>
                  <span className="text-zinc-300">&middot;</span>
                  <span>{engagementLabel}</span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={profileEnrich.start}
            disabled={profileEnrich.running}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {profileEnrich.running ? (
              <SpinnerIcon className="h-4 w-4 animate-spin" />
            ) : (
              <SparklesIcon className="h-4 w-4" />
            )}
            {profileEnrich.running ? 'Enriching...' : 'Enrich'}
          </button>
        </div>

        <div
          className={`overflow-hidden transition-all duration-500 ease-in-out ${showEnrichProgress ? 'mb-6 max-h-72 opacity-100' : 'max-h-0 opacity-0'
            }`}
        >
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
            <EnrichProgress steps={profileEnrich.steps} />
            {profileEnrich.result && (
              <p className="mt-2 border-t border-zinc-200 pt-2 text-xs font-medium text-zinc-600">
                {profileEnrich.result}
              </p>
            )}
          </div>
        </div>

        {/* Key facts */}
        {data.key_facts ? (() => {
          const kf = data.key_facts;
          return (
            <div className="mb-6 space-y-4">
              {/* Row 1: Stage + Products */}
              <div className="rounded-lg border border-zinc-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
                  {kf.deal_stage && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Deal Stage</div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${getStageBadgeColor(kf.deal_stage)}`}>
                        {kf.deal_stage}
                      </span>
                    </div>
                  )}
                  {kf.products_of_interest.length > 0 && (
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Products of Interest</div>
                      <div className="flex flex-wrap gap-1.5">
                        {kf.products_of_interest.map((p) => (
                          <span key={p} className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                            {p}
                          </span>
                        ))}
                      </div>
                      {kf.other_products_detail && (
                        <p className="text-xs text-zinc-500 mt-1">{kf.other_products_detail}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Row 2: Stats + ERP */}
                <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-zinc-100 pt-4">
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Revenue</div>
                    <div className="text-lg font-semibold text-zinc-900">{kf.annual_revenue ? formatCurrency(kf.annual_revenue) : '—'}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Order Entry</div>
                    <div className="text-lg font-semibold text-zinc-900">{kf.order_entry_volume ? formatVolume(kf.order_entry_volume) : '—'}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">AP Volume</div>
                    <div className="text-lg font-semibold text-zinc-900">{kf.accounts_payable_volume ? formatVolume(kf.accounts_payable_volume) : '—'}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">AR Volume</div>
                    <div className="text-lg font-semibold text-zinc-900">{kf.accounts_receivable_volume ? formatVolume(kf.accounts_receivable_volume) : '—'}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">ERP System</div>
                    <div className="text-lg font-semibold text-zinc-900">{kf.erp_system || '—'}</div>
                    {kf.actively_migrating_erp && (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                        Migrating
                      </span>
                    )}
                  </div>
                </div>

                {/* Row 3: Key contact + Next step */}
                <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-zinc-100 pt-4">
                  {kf.key_contact_name && (
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Key Contact</div>
                      <div className="text-sm text-zinc-900 font-medium">{kf.key_contact_name}</div>
                      {kf.key_contact_description && (
                        <div className="text-xs text-zinc-500">{kf.key_contact_description}</div>
                      )}
                    </div>
                  )}
                  {kf.next_step && (
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Next Step</div>
                      <div className="text-sm text-zinc-700">{kf.next_step}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Concerns & selling points */}
              {(kf.main_concerns.length > 0 || kf.main_selling_points.length > 0) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {kf.main_concerns.length > 0 && (
                    <div className="rounded-lg border border-zinc-200 bg-white p-5">
                      <div className="mb-4 text-xs font-medium uppercase tracking-wide text-zinc-400">Main Concerns</div>
                      <ul className="space-y-3">
                        {kf.main_concerns.map((c, i) => (
                          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-zinc-700">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {kf.main_selling_points.length > 0 && (
                    <div className="rounded-lg border border-zinc-200 bg-white p-5">
                      <div className="mb-4 text-xs font-medium uppercase tracking-wide text-zinc-400">Main Selling Points</div>
                      <ul className="space-y-3">
                        {kf.main_selling_points.map((p, i) => (
                          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-zinc-700">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })() : (
          <DetailFields
            fields={[
              { label: 'Revenue', value: formatCompanyRevenue(data.annual_revenue, data.revenue) },
              { label: 'Employees', value: data.employee_count },
              { label: 'Locations', value: data.location_count },
              { label: 'ERP', value: data.erp },
              { label: 'Competitor', value: data.competitor },
              { label: 'Named Account', value: data.is_named_account ? 'Yes' : 'No' },
              { label: 'Parent Company', value: data.parent_company?.name ?? null },
            ]}
          />
        )}

        {/* Summary / Chat tabs */}
        <section className="mb-6 rounded-lg border border-zinc-200 bg-white overflow-hidden">
          <div className="flex border-b border-zinc-100">
            <button
              type="button"
              onClick={() => setMainTab('summary')}
              className={`flex items-center gap-1.5 px-5 py-3 text-xs font-semibold uppercase tracking-wide transition ${mainTab === 'summary'
                ? 'border-b-2 border-indigo-500 text-indigo-600'
                : 'text-zinc-400 hover:text-zinc-600'
                }`}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setMainTab('chat')}
              className={`flex items-center gap-1.5 px-5 py-3 text-xs font-semibold uppercase tracking-wide transition ${mainTab === 'chat'
                ? 'border-b-2 border-indigo-500 text-indigo-600'
                : 'text-zinc-400 hover:text-zinc-600'
                }`}
            >
              <ChatBubbleLeftRightIcon className="h-4 w-4" />
              Chat
            </button>
            <button
              type="button"
              onClick={() => setMainTab('correspondence')}
              className={`flex items-center gap-1.5 px-5 py-3 text-xs font-semibold uppercase tracking-wide transition ${mainTab === 'correspondence'
                ? 'border-b-2 border-indigo-500 text-indigo-600'
                : 'text-zinc-400 hover:text-zinc-600'
                }`}
            >
              <EnvelopeIcon className="h-4 w-4" />
              Emails
            </button>
            {mainTab === 'chat' && chat.messages.length > 0 && !chat.streaming && (
              <button
                type="button"
                onClick={chat.clear}
                className="ml-auto mr-3 text-xs text-zinc-400 transition hover:text-zinc-600"
              >
                Clear chat
              </button>
            )}
          </div>

          {mainTab === 'summary' && (
            <div className="p-5">
              {data.summary ? (
                <MarkdownContent content={data.summary} className="text-[0.8125rem] leading-[1.75] text-zinc-700 [&_h3]:mt-8 [&_h3]:mb-4 [&_h3]:first:mt-0 [&_h4]:mt-8 [&_h4]:mb-4 [&_h4]:first:mt-0 [&_h5]:mt-6 [&_h5]:mb-3 [&_h5]:first:mt-0 [&_p]:mb-5 [&_p:last-child]:mb-0 [&_ul]:mb-5 [&_ul]:space-y-2.5 [&_ol]:mb-5 [&_ol]:space-y-2.5 [&_li]:pl-1 [&_blockquote]:my-5" />
              ) : (
                <p className="text-sm text-zinc-400">No summary available yet.</p>
              )}
            </div>
          )}

          {mainTab === 'chat' && (
            <ChatPanel
              chat={chat}
              placeholder="Ask about meetings with this company..."
              emptyTitle={`Ask anything about meetings with ${data.name}`}
              emptyHint='e.g. "What are the key themes across all meetings?"'
            />
          )}

          {mainTab === 'correspondence' && (
            <div className="p-5">
              {correspondenceLoading ? (
                <p className="text-sm text-zinc-500">Loading correspondence...</p>
              ) : !correspondence || correspondence.items.length === 0 ? (
                <p className="text-sm text-zinc-400">No correspondence available yet.</p>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between text-xs text-zinc-400">
                    <span>
                      {correspondence.total} email{correspondence.total === 1 ? '' : 's'}
                    </span>
                    <span>
                      Page {correspondence.page} of {Math.max(correspondence.total_pages, 1)}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {correspondence.items.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ring-1 ring-inset ${directionBadgeClass(item.direction)}`}>
                                {item.direction}
                              </span>
                              <h3 className="text-sm font-semibold text-zinc-900">
                                {item.subject || '(No subject)'}
                              </h3>
                              {item.hubspot_status && (
                                <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-500 ring-1 ring-inset ring-zinc-200">
                                  {item.hubspot_status}
                                </span>
                              )}
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-zinc-500">
                              <div>
                                <span className="font-medium text-zinc-600">From:</span>{' '}
                                {item.from_email || '—'}
                              </div>
                              <div>
                                <span className="font-medium text-zinc-600">To:</span>{' '}
                                {joinEmails(item.to_emails)}
                              </div>
                              {item.cc_emails.length > 0 && (
                                <div>
                                  <span className="font-medium text-zinc-600">CC:</span>{' '}
                                  {joinEmails(item.cc_emails)}
                                </div>
                              )}
                              {item.users.length > 0 && (
                                <div>
                                  <span className="font-medium text-zinc-600">Internal users:</span>{' '}
                                  {item.users.map((user) => user.display_name).join(', ')}
                                </div>
                              )}
                              {item.owner && (
                                <div>
                                  <span className="font-medium text-zinc-600">Owner:</span>{' '}
                                  {item.owner.display_name || item.owner.email || item.owner.hubspot_owner_id || 'Unknown'}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="text-xs text-zinc-400">{formatDateTime(item.occurred_at)}</p>
                            {item.hubspot_url && (
                              <a
                                href={item.hubspot_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-block text-xs font-medium text-indigo-600 transition hover:text-indigo-700"
                              >
                                Open in HubSpot
                              </a>
                            )}
                          </div>
                        </div>

                        {item.body_preview && (
                          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
                            {item.body_preview}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>

                  {correspondence.total_pages > 1 && (
                    <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4">
                      <button
                        type="button"
                        onClick={() => setCorrespondencePage((page) => Math.max(page - 1, 1))}
                        disabled={correspondence.page <= 1}
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => setCorrespondencePage((page) => page + 1)}
                        disabled={correspondence.page >= correspondence.total_pages}
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        {/* Subsidiaries */}
        {data.subsidiaries.length > 0 && (
          <>
            <h2 className="mb-3 mt-2 text-base font-semibold text-zinc-900">Subsidiaries</h2>
            <DataTable
              columns={[
                { key: 'name' as const, label: 'Name' },
                { key: 'domains_display' as const, label: 'Domains' },
              ]}
              data={data.subsidiaries.map((s) => ({ ...s, domains_display: s.domains.join(', ') || null }))}
              linkPrefix="/companies"
            />
          </>
        )}

        {/* Industry Groups */}
        {data.industry_groups.length > 0 && (
          <>
            <h2 className="mb-3 mt-6 text-base font-semibold text-zinc-900">Industry Groups</h2>
            <DataTable
              columns={[
                { key: 'name' as const, label: 'Name' },
                { key: 'domains_display' as const, label: 'Domains' },
                { key: 'vertical' as const, label: 'Vertical' },
              ]}
              data={data.industry_groups.map((ig) => ({ ...ig, domains_display: ig.domains.join(', ') || null }))}
            />
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right sidebar — Meetings                                           */}
      {/* ------------------------------------------------------------------ */}
      <aside className="sticky top-6 flex max-h-[calc(100vh-3rem)] w-[340px] shrink-0 self-stretch flex-col gap-4 overflow-hidden">
        <div className="shrink-0 rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <CalendarIcon className="h-4 w-4" />
              Meetings
              {hasMeetings && (
                <span className="ml-auto text-[11px] font-normal text-zinc-400">
                  {data.meetings.length}
                </span>
              )}
            </h2>
          </div>

          <div className="overflow-y-auto">
            {!hasMeetings ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-zinc-400">No meetings recorded</p>
              </div>
            ) : (
              data.meetings.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => navigate(`/meetings/${m.id}`, { state: { backTo: `/companies/${id}`, backLabel: data.name } })}
                  className="group w-full border-b border-zinc-50 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
                >
                  <p className="text-sm font-medium text-zinc-800 group-hover:text-indigo-700 truncate">
                    {m.title || 'Untitled meeting'}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                    <span>{formatDate(m.start_at)}</span>
                    {formatTime(m.start_at) && (
                      <>
                        <span className="text-zinc-200">&middot;</span>
                        <span>{formatTime(m.start_at)}</span>
                      </>
                    )}
                    {m.duration_minutes && (
                      <>
                        <span className="text-zinc-200">&middot;</span>
                        <span>{m.duration_minutes} min</span>
                      </>
                    )}
                  </div>
                  {m.sales_reps.length > 0 && (
                    <p className="mt-1 text-xs text-zinc-400 truncate">
                      {m.sales_reps.map((sr) => sr.display_name).join(', ')}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* People */}
        {data.positions.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                People
                <span className="ml-auto text-[11px] font-normal text-zinc-400">
                  {data.positions.length}
                </span>
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-zinc-50">
              {data.positions.map((p) => (
                <button
                  key={p.person_id}
                  type="button"
                  onClick={() => navigate(`/people/${p.person_id}`, { state: { backTo: `/companies/${id}`, backLabel: data.name } })}
                  className="group w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50"
                >
                  <p className="text-sm font-medium text-zinc-800 group-hover:text-indigo-700 truncate">
                    {p.person_first_name} {p.person_last_name}
                  </p>
                  {p.title && (
                    <p className="mt-0.5 text-xs text-zinc-400 truncate">{p.title}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
