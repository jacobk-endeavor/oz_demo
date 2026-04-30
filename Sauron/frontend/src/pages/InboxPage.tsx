import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/20/solid';
import api from '../api';

interface GmailStatusResponse {
  connected: boolean;
  account_email: string | null;
  requires_reauth: boolean;
}

interface GmailMessage {
  id: string;
  thread_id: string | null;
  snippet: string | null;
  subject: string | null;
  from_header: string | null;
  to_header: string | null;
  labels: string[];
  unread: boolean;
  has_attachments: boolean;
  received_at: string | null;
}

interface GmailMessageListResponse {
  items: GmailMessage[];
  page_size: number;
  next_page_token: string | null;
  result_size_estimate: number | null;
}

const PAGE_SIZE = 50;

function formatDate(value: string | null): string {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString();
}

function normalizeOauthError(error: string): string {
  return decodeURIComponent(error).replaceAll('_', ' ');
}

export default function InboxPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [statusLoading, setStatusLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [requiresReauth, setRequiresReauth] = useState(false);

  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [currentPageToken, setCurrentPageToken] = useState<string | null>(null);
  const [tokenHistory, setTokenHistory] = useState<Array<string | null>>([]);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  const hasMessages = messages.length > 0;
  const hasPreviousPage = tokenHistory.length > 0;
  const canNext = Boolean(nextPageToken);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const connectedParam = params.get('gmail');
    const errorParam = params.get('gmail_error');
    if (connectedParam === 'connected') {
      setError(null);
      setRequiresReauth(false);
    }
    if (errorParam) {
      setError(`Gmail connect failed: ${normalizeOauthError(errorParam)}`);
    }
    if (connectedParam || errorParam) {
      navigate('/inbox', { replace: true });
    }
  }, [location.search, navigate]);

  useEffect(() => {
    setStatusLoading(true);
    api
      .get<GmailStatusResponse>('/api/gmail/status')
      .then((res) => {
        setConnected(res.data.connected);
        setAccountEmail(res.data.account_email);
        setRequiresReauth(res.data.requires_reauth);
      })
      .catch(() => {
        setConnected(false);
        setAccountEmail(null);
        setError((prev) => prev ?? 'Failed to load Gmail connection status.');
      })
      .finally(() => setStatusLoading(false));
  }, [location.key]);

  useEffect(() => {
    if (!connected) {
      setMessages([]);
      setNextPageToken(null);
      setCurrentPageToken(null);
      setTokenHistory([]);
      setPage(1);
      return;
    }

    let cancelled = false;
    setMessagesLoading(true);
    setError(null);
    api
      .get<GmailMessageListResponse>('/api/gmail/messages', {
        params: {
          page_size: PAGE_SIZE,
          page_token: currentPageToken || undefined,
          q: appliedSearch || undefined,
        },
      })
      .then((res) => {
        if (cancelled) return;
        setMessages(res.data.items);
        setNextPageToken(res.data.next_page_token);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 409) {
          setConnected(false);
          setRequiresReauth(true);
          setMessages([]);
          setNextPageToken(null);
          return;
        }
        setError('Failed to load inbox emails.');
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connected, currentPageToken, appliedSearch]);

  const pageLabel = connected ? `Page ${page}` : '';

  const onApplySearch = (event: FormEvent) => {
    event.preventDefault();
    setAppliedSearch(search.trim());
    setCurrentPageToken(null);
    setTokenHistory([]);
    setPage(1);
  };

  const onClearSearch = () => {
    setSearch('');
    setAppliedSearch('');
    setCurrentPageToken(null);
    setTokenHistory([]);
    setPage(1);
  };

  const onSendEmail = async (event: FormEvent) => {
    event.preventDefault();
    setSendLoading(true);
    setError(null);
    setSendSuccess(null);
    try {
      await api.post('/api/gmail/send', {
        to: composeTo.trim(),
        subject: composeSubject,
        body: composeBody,
      });
      setSendSuccess(`Email sent to ${composeTo.trim()}`);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      setComposeOpen(false);
    } catch {
      setError('Failed to send email.');
    } finally {
      setSendLoading(false);
    }
  };

  const onNextPage = () => {
    if (!nextPageToken) return;
    setTokenHistory((prev) => [...prev, currentPageToken]);
    setCurrentPageToken(nextPageToken);
    setPage((prev) => prev + 1);
  };

  const onPreviousPage = () => {
    if (!tokenHistory.length) return;
    const previousToken = tokenHistory[tokenHistory.length - 1];
    setTokenHistory((prev) => prev.slice(0, -1));
    setCurrentPageToken(previousToken);
    setPage((prev) => Math.max(prev - 1, 1));
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900">Inbox</h1>
      <p className="mb-6 text-sm text-zinc-500">Browse Gmail inbox messages with stable pagination</p>

      {statusLoading ? (
        <p className="text-sm text-zinc-500">Checking Gmail connection...</p>
      ) : !connected ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          {requiresReauth ? (
            <>
              <p className="text-sm font-medium text-amber-700">
                Your Gmail session has expired or been revoked.
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Please reconnect your Gmail account to continue using email features.
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-700">
              Gmail is not connected to your account yet.
            </p>
          )}
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="mt-4 rounded-md border border-zinc-200 bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Open Settings
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3 text-sm text-zinc-600">
                <span>Connected as <span className="font-medium text-zinc-900">{accountEmail || 'Unknown account'}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setComposeOpen((v) => !v); setSendSuccess(null); }}
                  className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                  Compose
                </button>
              </div>
              <form onSubmit={onApplySearch} className="flex w-full max-w-lg items-center gap-2">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Gmail search, e.g. from:alice newer_than:7d"
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
                <button
                  type="submit"
                  className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Search
                </button>
              </form>
            </div>
          </div>

          {composeOpen && (
            <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <form onSubmit={onSendEmail} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="compose-to" className="text-xs font-medium text-zinc-500">To</label>
                  <input
                    id="compose-to"
                    type="email"
                    required
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    placeholder="recipient@example.com"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="compose-subject" className="text-xs font-medium text-zinc-500">Subject</label>
                  <input
                    id="compose-subject"
                    type="text"
                    required
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="Subject"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="compose-body" className="text-xs font-medium text-zinc-500">Message</label>
                  <textarea
                    id="compose-body"
                    required
                    rows={6}
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    placeholder="Write your message..."
                    className="resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={sendLoading}
                    className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <PaperAirplaneIcon className="h-4 w-4" />
                    {sendLoading ? 'Sending...' : 'Send'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposeOpen(false)}
                    className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {messagesLoading ? (
            <p className="text-sm text-zinc-500">Loading inbox messages...</p>
          ) : !hasMessages ? (
            <div className="rounded-xl border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500 shadow-sm">
              No inbox emails found for the current query.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">From</th>
                      <th className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Subject</th>
                      <th className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Snippet</th>
                      <th className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((message) => (
                      <tr key={message.id} className="border-none transition-colors hover:bg-zinc-50/80">
                        <td className="border-b border-zinc-100 px-4 py-3 text-sm text-zinc-700">
                          <div className="max-w-[220px] truncate">
                            {message.from_header || '—'}
                          </div>
                        </td>
                        <td className="border-b border-zinc-100 px-4 py-3 text-sm text-zinc-700">
                          <div className="flex items-center gap-2">
                            {message.unread && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                            <span className="max-w-[260px] truncate font-medium text-zinc-900">
                              {message.subject || '(No subject)'}
                            </span>
                            {message.has_attachments && (
                              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                                Attachment
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="border-b border-zinc-100 px-4 py-3 text-sm text-zinc-600">
                          <div className="max-w-[350px] truncate">
                            {message.snippet || '—'}
                          </div>
                        </td>
                        <td className="border-b border-zinc-100 px-4 py-3 text-sm text-zinc-600">
                          {formatDate(message.received_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3">
                <span className="text-sm text-zinc-500">{pageLabel}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!hasPreviousPage}
                    onClick={onPreviousPage}
                    className="rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!canNext}
                    onClick={onNextPage}
                    className="rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {sendSuccess && <p className="mt-4 text-sm text-green-600">{sendSuccess}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
