import { useEffect, useMemo, useState } from 'react';
import {
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid';
import api from '../api';
import MultiSelect, { type MultiSelectOption } from '../components/MultiSelect';
import { useDebouncedSearch } from '../hooks/useDebouncedSearch';

interface CompanyEmailCompany {
  id: number;
  name: string;
}

interface CompanyEmailUser {
  id: number;
  email: string;
  display_name: string;
}

interface CompanyEmailFilterUser {
  id: number;
  email: string;
  display_name: string;
  thread_count: number;
}

interface CompanyEmailFilterOptions {
  users: CompanyEmailFilterUser[];
  directions: string[];
}

interface CompanyEmailOwner {
  hubspot_owner_id: string | null;
  sales_rep_id: number | null;
  user_id: number | null;
  display_name: string | null;
  email: string | null;
}

interface CompanyEmailMessage {
  id: number;
  hubspot_email_id: string;
  hubspot_thread_id: string | null;
  hubspot_message_id: string | null;
  hubspot_thread_summary: string | null;
  hubspot_member_of_forwarded_subthread: boolean | null;
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
  companies: CompanyEmailCompany[];
  users: CompanyEmailUser[];
  owner: CompanyEmailOwner | null;
}

interface CompanyEmailThreadListItem {
  thread_key: string;
  hubspot_thread_id: string | null;
  hubspot_thread_summary: string | null;
  message_count: number;
  latest_message: CompanyEmailMessage;
  companies: CompanyEmailCompany[];
  users: CompanyEmailUser[];
}

interface CompanyEmailThread {
  thread_key: string;
  hubspot_thread_id: string | null;
  hubspot_thread_summary: string | null;
  message_count: number;
  latest_occurred_at: string;
  companies: CompanyEmailCompany[];
  users: CompanyEmailUser[];
  messages: CompanyEmailMessage[];
}

interface CompanyEmailResponse {
  items: CompanyEmailThreadListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

const PAGE_SIZE = 75;
const DEFAULT_DIRECTION_FILTERS = ['received', 'sent'];

function formatListDate(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '—';

  const now = new Date();
  const sameDay =
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate();
  if (sameDay) {
    return value.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDetailDate(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '—';
  return value.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function joinValues(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '—';
}

function formatEndeavorEmailLabel(user: CompanyEmailFilterUser): string {
  if (!user.display_name || user.display_name.toLowerCase() === user.email.toLowerCase()) {
    return `${user.email} (${user.thread_count})`;
  }
  return `${user.display_name} (${user.email}) (${user.thread_count})`;
}

function directionBadgeClass(direction: 'sent' | 'received'): string {
  return direction === 'sent'
    ? 'bg-indigo-50 text-indigo-700 ring-indigo-600/20'
    : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
}

export default function EmailsPage() {
  const [data, setData] = useState<CompanyEmailResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { search, setSearch, appliedSearch, page, setPage } = useDebouncedSearch();
  const [filterOptions, setFilterOptions] = useState<CompanyEmailFilterOptions | null>(null);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedDirections, setSelectedDirections] = useState<string[]>([]);
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<CompanyEmailThread | null>(null);

  useEffect(() => {
    setFilterOptionsLoading(true);
    api
      .get<CompanyEmailFilterOptions>('/api/company-emails/filter-options')
      .then((res) => setFilterOptions(res.data))
      .catch(() => {
        setFilterOptions({
          users: [],
          directions: DEFAULT_DIRECTION_FILTERS,
        });
      })
      .finally(() => setFilterOptionsLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setError(null);

    api
      .get<CompanyEmailResponse>('/api/company-emails', {
        params: {
          page,
          page_size: PAGE_SIZE,
          search: appliedSearch || undefined,
          directions: selectedDirections.length > 0 ? selectedDirections.join(',') : undefined,
          user_ids: selectedUserIds.length > 0 ? selectedUserIds.join(',') : undefined,
        },
      })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setSelectedThread(null);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setError('Failed to load organization emails.');
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appliedSearch, page, selectedDirections, selectedUserIds]);

  useEffect(() => {
    if (!data || data.items.length === 0) {
      setSelectedThreadKey(null);
      setSelectedThread(null);
      return;
    }
    const exists = data.items.some((item) => item.thread_key === selectedThreadKey);
    if (!exists) {
      setSelectedThreadKey(data.items[0].thread_key);
    }
  }, [data, selectedThreadKey]);

  useEffect(() => {
    if (!selectedThreadKey) {
      setSelectedThread(null);
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    api
      .get<CompanyEmailThread>('/api/company-emails/thread', {
        params: { thread_key: selectedThreadKey },
      })
      .then((res) => {
        if (cancelled) return;
        setSelectedThread(res.data);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedThread(null);
        setError('Failed to load the selected email thread.');
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedThreadKey]);

  const onClearSearch = () => {
    setSearch('');
  };

  const totalPages = data?.total_pages ?? 0;
  const hasEmails = (data?.items.length ?? 0) > 0;
  const endeavorEmailOptions = useMemo<MultiSelectOption[]>(
    () =>
      (filterOptions?.users ?? []).map((user) => ({
        value: String(user.id),
        label: formatEndeavorEmailLabel(user),
      })),
    [filterOptions],
  );
  const directionOptions = useMemo<MultiSelectOption[]>(
    () =>
      (filterOptions?.directions?.length ? filterOptions.directions : DEFAULT_DIRECTION_FILTERS).map((value) => ({
        value,
        label: value === 'received' ? 'Received' : 'Sent',
      })),
    [filterOptions],
  );
  const selectedThreadListItem = useMemo(
    () => data?.items.find((item) => item.thread_key === selectedThreadKey) ?? null,
    [data, selectedThreadKey],
  );
  const latestSelectedMessage = useMemo(
    () =>
      selectedThread && selectedThread.messages.length > 0
        ? selectedThread.messages[selectedThread.messages.length - 1]
        : null,
    [selectedThread],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-zinc-900">Emails</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Organization-wide HubSpot email activity across all internal users.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-2">
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <div className="relative min-w-0 md:min-w-[320px] md:flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Subject, company, participant, or preview…"
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-9 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
            {search && (
              <button
                type="button"
                onClick={onClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-600"
                aria-label="Clear search"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          <MultiSelect
            options={endeavorEmailOptions}
            selected={selectedUserIds}
            onChange={(ids) => {
              setSelectedUserIds(ids);
              setPage(1);
            }}
            placeholder="All Endeavor emails"
            selectedDisplay="labels"
            className="w-full md:w-auto md:max-w-[360px]"
            buttonClassName="w-full md:w-auto md:min-w-[16rem] md:max-w-[360px]"
            searchable
            loading={filterOptionsLoading}
            loadingText="Loading…"
            dropdownClassName="min-w-full w-96"
          />

          <MultiSelect
            options={directionOptions}
            selected={selectedDirections}
            onChange={(values) => {
              setSelectedDirections(values);
              setPage(1);
            }}
            placeholder="All directions"
            selectedDisplay="labels"
            className="w-full md:w-auto md:max-w-[220px]"
            buttonClassName="w-full md:w-auto md:min-w-[11rem] md:max-w-[220px]"
          />
        </div>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600">{error}</p>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex h-full min-h-0">
          <aside className="flex w-[420px] min-w-[360px] shrink-0 flex-col border-r border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 text-xs uppercase tracking-wide text-zinc-500">
              <span>
                {listLoading ? 'Loading…' : `${data?.total ?? 0} threads`}
              </span>
              <span>
                Page {data?.page ?? page}{totalPages ? ` of ${totalPages}` : ''}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {listLoading ? (
                <div className="px-4 py-8 text-sm text-zinc-500">Loading emails...</div>
              ) : !hasEmails ? (
                <div className="px-4 py-8 text-sm text-zinc-500">
                  No emails found for the current filters.
                </div>
              ) : (
                data!.items.map((item) => {
                  const isSelected = item.thread_key === selectedThreadKey;
                  return (
                    <button
                      key={item.thread_key}
                      type="button"
                      onClick={() => setSelectedThreadKey(item.thread_key)}
                      className={[
                        'w-full border-b border-zinc-100 px-4 py-3 text-left transition',
                        isSelected ? 'bg-zinc-100/80' : 'hover:bg-zinc-50',
                      ].join(' ')}
                    >
                      <div className="mb-1 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900">
                            {item.latest_message.from_email || item.latest_message.owner?.display_name || 'Unknown sender'}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            {item.companies.map((company) => company.name).join(', ') || 'No company'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="block text-xs text-zinc-400">
                            {formatListDate(item.latest_message.occurred_at)}
                          </span>
                          <span className="mt-1 inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                            {item.message_count}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset ${directionBadgeClass(item.latest_message.direction)}`}>
                          {item.latest_message.direction}
                        </span>
                        <p className="truncate text-sm font-medium text-zinc-700">
                          {item.latest_message.subject || '(No subject)'}
                        </p>
                      </div>

                      <p className="mt-1 truncate text-sm text-zinc-500">
                        {item.latest_message.body_preview || item.hubspot_thread_summary || 'No preview available.'}
                      </p>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
              <button
                type="button"
                disabled={listLoading || page <= 1}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                className="rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={listLoading || !data || page >= data.total_pages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </aside>

          <section className="min-h-0 flex-1 overflow-y-auto">
            {threadLoading ? (
              <div className="flex h-full items-center justify-center px-8 text-sm text-zinc-500">
                Loading thread...
              </div>
            ) : !selectedThread ? (
              <div className="flex h-full items-center justify-center px-8 text-sm text-zinc-500">
                Select a thread to view the conversation.
              </div>
            ) : (
              <div className="p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-semibold text-zinc-900">
                        {latestSelectedMessage?.subject || selectedThread.hubspot_thread_summary || '(No subject)'}
                      </h2>
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                        {selectedThread.message_count} message{selectedThread.message_count === 1 ? '' : 's'}
                      </span>
                      {selectedThreadListItem?.latest_message.hubspot_status && (
                        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                          {selectedThreadListItem.latest_message.hubspot_status}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">
                      Latest activity {formatDetailDate(selectedThread.latest_occurred_at)}
                    </p>
                    {selectedThread.hubspot_thread_summary && (
                      <p className="mt-2 max-w-3xl text-sm text-zinc-600">
                        {selectedThread.hubspot_thread_summary}
                      </p>
                    )}
                  </div>
                  {latestSelectedMessage?.hubspot_url && (
                    <a
                      href={latestSelectedMessage.hubspot_url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      Open in HubSpot
                    </a>
                  )}
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-4">
                    {selectedThread.messages.map((message) => (
                      <article key={message.id} className="rounded-xl border border-zinc-200 bg-white p-5">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset ${directionBadgeClass(message.direction)}`}>
                                {message.direction}
                              </span>
                              <h3 className="text-base font-semibold text-zinc-900">
                                {message.subject || '(No subject)'}
                              </h3>
                              {message.hubspot_member_of_forwarded_subthread && (
                                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                  Forwarded subthread
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-zinc-500">
                              {formatDetailDate(message.occurred_at)}
                            </p>
                          </div>
                          {message.hubspot_url && (
                            <a
                              href={message.hubspot_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                            >
                              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                              Open
                            </a>
                          )}
                        </div>

                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                          <div className="space-y-2 text-sm text-zinc-700">
                            <div>
                              <span className="font-medium text-zinc-900">From:</span>{' '}
                              {message.from_email || '—'}
                            </div>
                            <div>
                              <span className="font-medium text-zinc-900">To:</span>{' '}
                              {joinValues(message.to_emails)}
                            </div>
                            {message.cc_emails.length > 0 && (
                              <div>
                                <span className="font-medium text-zinc-900">CC:</span>{' '}
                                {joinValues(message.cc_emails)}
                              </div>
                            )}
                            {message.bcc_emails.length > 0 && (
                              <div>
                                <span className="font-medium text-zinc-900">BCC:</span>{' '}
                                {joinValues(message.bcc_emails)}
                              </div>
                            )}
                            {message.owner && (
                              <div>
                                <span className="font-medium text-zinc-900">Owner:</span>{' '}
                                {message.owner.display_name || message.owner.email || message.owner.hubspot_owner_id || 'Unknown owner'}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-4">
                          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                            Message preview
                          </h4>
                          <p className="whitespace-pre-wrap break-words text-sm leading-7 text-zinc-700">
                            {message.body_preview || 'No preview available.'}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>

                  <aside className="space-y-4">
                    <div className="rounded-xl border border-zinc-200 bg-white p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                        Companies
                      </h3>
                      {selectedThread.companies.length === 0 ? (
                        <p className="text-sm text-zinc-500">No companies linked.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {selectedThread.companies.map((company) => (
                            <span
                              key={company.id}
                              className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700"
                            >
                              {company.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                        Internal users
                      </h3>
                      {selectedThread.users.length === 0 ? (
                        <p className="text-sm text-zinc-500">No internal users matched.</p>
                      ) : (
                        <ul className="space-y-2">
                          {selectedThread.users.map((user) => (
                            <li key={user.id} className="text-sm text-zinc-700">
                              <div className="font-medium text-zinc-900">{user.display_name}</div>
                              <div className="text-zinc-500">{user.email}</div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white p-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                        Thread details
                      </h3>
                      <div className="space-y-2 text-sm text-zinc-700">
                        <div>
                          <span className="font-medium text-zinc-900">Thread key:</span>{' '}
                          {selectedThread.thread_key}
                        </div>
                        <div>
                          <span className="font-medium text-zinc-900">Thread ID:</span>{' '}
                          {selectedThread.hubspot_thread_id || 'Standalone message thread'}
                        </div>
                        <div>
                          <span className="font-medium text-zinc-900">Messages:</span>{' '}
                          {selectedThread.message_count}
                        </div>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
