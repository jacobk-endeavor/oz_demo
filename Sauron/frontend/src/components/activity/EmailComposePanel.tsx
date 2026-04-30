import { useState, useRef, useEffect } from 'react';
import {
  PencilSquareIcon,
  EnvelopeIcon,
  CheckIcon,
  ChevronDownIcon,
  UserIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import api from '../../api';
import { type ActivityContact } from './types';

function EmailSpinner({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function EmailComposePanel({
  leadId,
  contacts,
  initialContactId = null,
  onSent,
  onCancel,
  onLogManually,
}: {
  leadId: number;
  contacts: ActivityContact[];
  initialContactId?: number | null;
  onSent: () => void;
  onCancel: () => void;
  onLogManually: () => void;
}) {
  const contactsWithEmail = contacts.filter((c) => c.email);
  const initialContact = initialContactId != null
    ? contactsWithEmail.find((contact) => contact.id === initialContactId) ?? null
    : null;

  const [contactId, setContactId] = useState<number | null>(
    initialContact?.id ?? (contactsWithEmail.length === 1 ? contactsWithEmail[0].id : null),
  );
  const [useCustomEmail, setUseCustomEmail] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [contactOpen, setContactOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gmailReauthNeeded, setGmailReauthNeeded] = useState(false);

  const [gmailStatusLoading, setGmailStatusLoading] = useState(true);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);

  useEffect(() => {
    api
      .get<{ connected: boolean; requires_reauth: boolean }>('/api/gmail/status')
      .then((res) => {
        setGmailConnected(res.data.connected);
        if (res.data.requires_reauth) setGmailReauthNeeded(true);
      })
      .catch(() => setGmailConnected(false))
      .finally(() => setGmailStatusLoading(false));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contactRef.current && !contactRef.current.contains(e.target as Node)) setContactOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (initialContactId == null) return;
    const contact = contacts.find((entry) => entry.id === initialContactId && !!entry.email);
    if (!contact) return;
    setContactId(contact.id);
    setUseCustomEmail(false);
    setCustomEmail('');
    setContactOpen(false);
  }, [contacts, initialContactId]);

  const selectedContact = contactsWithEmail.find((c) => c.id === contactId);
  const hasValidRecipient = useCustomEmail
    ? customEmail.trim().includes('@')
    : contactId !== null;

  async function handleConnectGmail() {
    setConnectLoading(true);
    try {
      const res = await api.get<{ auth_url: string }>('/api/gmail/auth-url');
      window.location.href = res.data.auth_url;
    } catch {
      setError('Unable to start Gmail connect flow.');
      setConnectLoading(false);
    }
  }

  async function handleSend() {
    if (!gmailConnected || !hasValidRecipient || !subject.trim() || !body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        subject: subject.trim(),
        body: body.trim(),
      };
      if (useCustomEmail) {
        payload.to = customEmail.trim();
      } else {
        payload.contact_id = contactId;
      }
      await api.post(`/api/leads/${leadId}/emails/send`, payload);
      onSent();
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Failed to send email';
      setError(detail);
      if (err.response?.status === 409) {
        setGmailReauthNeeded(true);
        setGmailConnected(false);
      } else {
        setGmailReauthNeeded(false);
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col gap-3" onKeyDown={handleKeyDown}>
      {/* Gmail connection banner */}
      {!gmailStatusLoading && !gmailConnected && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-sm font-medium text-amber-800">
            {gmailReauthNeeded
              ? 'Your Gmail session has expired. Please reconnect to send emails.'
              : 'Connect your Gmail account to send emails.'}
          </p>
          <button
            type="button"
            onClick={handleConnectGmail}
            disabled={connectLoading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <EnvelopeIcon className="h-3.5 w-3.5" />
            {connectLoading ? 'Redirecting to Google...' : gmailReauthNeeded ? 'Reconnect Gmail' : 'Connect Gmail'}
          </button>
        </div>
      )}

      {/* To field */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-zinc-500">To</label>
          <button
            type="button"
            onClick={() => { setUseCustomEmail((v) => !v); setContactId(null); setCustomEmail(''); }}
            className="text-[11px] text-indigo-500 hover:text-indigo-700 transition font-medium"
          >
            {useCustomEmail ? 'Select a contact' : 'Type a custom email'}
          </button>
        </div>

        {useCustomEmail ? (
          <div className="relative">
            <EnvelopeIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="email"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="block w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>
        ) : (
          <div ref={contactRef} className="relative">
            <button
              type="button"
              onClick={() => setContactOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 transition hover:border-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <span className="flex min-w-0 items-center gap-2">
                <UserIcon className="h-4 w-4 text-zinc-400" />
                {selectedContact ? (
                  <span className="truncate">
                    {[selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ')}
                    <span className="text-zinc-300 mx-1">&middot;</span>
                    <span className="text-zinc-400">{selectedContact.email}</span>
                  </span>
                ) : (
                  <span className="truncate text-zinc-400">Select a contact...</span>
                )}
              </span>
              <ChevronDownIcon className={`h-4 w-4 text-zinc-400 transition ${contactOpen ? 'rotate-180' : ''}`} />
            </button>
            {contactOpen && (
              <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
                {contactsWithEmail.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => { setContactId(c.id); setContactOpen(false); }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition ${c.id === contactId ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-700 hover:bg-zinc-50'
                        }`}
                    >
                      <span className="flex-1 text-left truncate">
                        {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                        <span className="text-zinc-300 mx-1">&middot;</span>
                        <span className="text-zinc-400">{c.email}</span>
                        {c.title && <span className="text-zinc-400 ml-1">· {c.title}</span>}
                      </span>
                      {c.id === contactId && <CheckIcon className="h-4 w-4 text-indigo-600" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Subject */}
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject"
          className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          autoFocus={!useCustomEmail}
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder="Write your message..."
          className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 resize-y focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {error && (
        <div className="text-xs text-red-600">
          <p>{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!gmailConnected || !hasValidRecipient || !subject.trim() || !body.trim() || sending}
          onClick={handleSend}
          className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {sending ? <EmailSpinner className="h-3.5 w-3.5 animate-spin" /> : <PaperAirplaneIcon className="h-3.5 w-3.5" />}
          {sending ? 'Sending...' : 'Send Email'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={sending}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:text-zinc-700 disabled:opacity-50"
        >
          Cancel
        </button>
        <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap pl-2 text-[11px] text-zinc-400">
          <kbd className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-[10px] font-medium">&#8984;</kbd>
          <span>+</span>
          <kbd className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-[10px] font-medium">Enter</kbd>
          <span>to send</span>
        </span>
      </div>

      {/* Log manually link */}
      <div className="border-t border-zinc-100 pt-3">
        <button
          type="button"
          onClick={onLogManually}
          disabled={sending}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition hover:text-zinc-700 disabled:opacity-50"
        >
          <PencilSquareIcon className="h-3.5 w-3.5" />
          Log email manually instead
        </button>
      </div>
    </div>
  );
}
