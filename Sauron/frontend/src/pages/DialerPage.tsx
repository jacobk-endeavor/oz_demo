import { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneIcon, PhoneXMarkIcon } from '@heroicons/react/24/solid';
import { MagnifyingGlassIcon, XMarkIcon, ClipboardDocumentListIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Device, Call } from '@twilio/voice-sdk';
import api from '../api';
import {
  type ContactPhoneNumber,
  formatPhoneNumber,
  getDisplayPhoneNumbers,
  getPrimaryPhone,
  phoneDigits,
  phoneTypeLabel,
} from '../contactPhones';
import toast from 'react-hot-toast';
import { useTranscriptStream } from '../hooks/useTranscriptStream';
import LiveTranscript from '../components/LiveTranscript';

interface DialerContact {
  id: number;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  phone_numbers: ContactPhoneNumber[];
  title: string | null;
  company: string;
  lead_id: number;
}

type CallStatus = 'idle' | 'connecting' | 'ringing' | 'open' | 'disconnected' | 'error';

const STATUS_LABEL: Record<CallStatus, string> = {
  idle: 'Ready',
  connecting: 'Connecting...',
  ringing: 'Ringing...',
  open: 'In call',
  disconnected: 'Call ended',
  error: 'Error',
};

const STATUS_DOT: Record<CallStatus, string> = {
  idle: 'bg-zinc-300',
  connecting: 'bg-yellow-400 animate-pulse',
  ringing: 'bg-blue-400 animate-pulse',
  open: 'bg-green-500',
  disconnected: 'bg-zinc-400',
  error: 'bg-red-500',
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function DialerPage() {
  const [phoneNumber, setPhoneNumber] = useState('+1');
  const [status, setStatus] = useState<CallStatus>('idle');
  const [deviceReady, setDeviceReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<DialerContact[]>([]);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<DialerContact | null>(null);
  const [selectedPhoneId, setSelectedPhoneId] = useState<number | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const contactBoxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showLogForm, setShowLogForm] = useState(false);
  const [logTitle, setLogTitle] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [rawTranscript, setRawTranscript] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logged, setLogged] = useState(false);
  const callStartTimeRef = useRef<Date | null>(null);
  const logTitleRef = useRef<HTMLInputElement>(null);

  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { utterances, status: txStatus, reset: resetTranscript } = useTranscriptStream(sessionId);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);

  const clearActiveCall = useCallback(() => {
    stopTimer();
    activeCallRef.current = null;
  }, [stopTimer]);

  useEffect(() => {
    let cancelled = false;

    async function initDevice() {
      try {
        const { data } = await api.get('/api/dialer/token');
        if (cancelled) return;

        const device = new Device(data.token, {
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
          logLevel: 1,
        });

        device.on('registered', () => {
          if (!cancelled) setDeviceReady(true);
        });
        device.on('error', (err) => {
          console.error('Twilio Device error:', err);
          if (!cancelled) toast.error(`Device error: ${err.message}`);
        });

        await device.register();
        deviceRef.current = device;
      } catch (err: any) {
        if (cancelled) return;
        toast.error(err.response?.data?.detail || 'Failed to initialize Twilio device');
      }
    }

    initDevice();

    return () => {
      cancelled = true;
      deviceRef.current?.destroy();
      deviceRef.current = null;
      stopTimer();
    };
  }, [stopTimer]);

  // Debounced contact search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = contactSearch.trim();
    if (term.length < 2) {
      setContactResults([]);
      setContactsOpen(false);
      return;
    }
    setContactsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/api/dialer/contacts', { params: { search: term } });
        setContactResults(data);
        setContactsOpen(data.length > 0);
      } catch {
        setContactResults([]);
      } finally {
        setContactsLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [contactSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (contactBoxRef.current && !contactBoxRef.current.contains(e.target as Node)) {
        setContactsOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectContact = useCallback((contact: DialerContact) => {
    const primaryPhone = getPrimaryPhone(contact);
    setSelectedContact(contact);
    setSelectedPhoneId(primaryPhone?.id ?? null);
    setContactSearch('');
    setContactResults([]);
    setContactsOpen(false);
    if (primaryPhone) setPhoneNumber(primaryPhone.number);
    else if (contact.phone) setPhoneNumber(contact.phone);
  }, []);

  const handleClearContact = useCallback(() => {
    setSelectedContact(null);
    setSelectedPhoneId(null);
    setPhoneNumber('+1');
    setContactSearch('');
  }, []);

  const contactPhoneNumbers = selectedContact ? getDisplayPhoneNumbers(selectedContact) : [];
  const selectedPhone = contactPhoneNumbers.find((phone) => phone.id === selectedPhoneId) ?? null;

  const handlePhoneSelect = useCallback((phoneId: number | null) => {
    if (!selectedContact || phoneId == null) {
      setSelectedPhoneId(null);
      return;
    }
    const phone = getDisplayPhoneNumbers(selectedContact).find((entry) => entry.id === phoneId);
    if (!phone) return;
    setSelectedPhoneId(phone.id);
    setPhoneNumber(phone.number);
  }, [selectedContact]);

  const handlePhoneNumberChange = useCallback((value: string) => {
    setPhoneNumber(value);
    if (!selectedContact) {
      setSelectedPhoneId(null);
      return;
    }
    const valueDigits = phoneDigits(value);
    const matched = getDisplayPhoneNumbers(selectedContact).find((phone) => (
      valueDigits.length > 0 && valueDigits === phoneDigits(phone.number)
    ));
    setSelectedPhoneId(matched?.id ?? null);
  }, [selectedContact]);

  const makeCall = useCallback(async () => {
    if (!deviceRef.current) return toast.error('Twilio device not ready');
    if (phoneNumber.length < 5) return toast.error('Please enter a valid phone number');

    setStatus('connecting');
    callStartTimeRef.current = new Date();
    const sid = crypto.randomUUID();
    setSessionId(sid);

    try {
      const call = await deviceRef.current.connect({ params: { To: phoneNumber, SessionId: sid } });
      activeCallRef.current = call;

      call.on('ringing', () => setStatus('ringing'));
      call.on('accept', () => {
        setStatus('open');
        startTimer();
      });
      call.on('disconnect', () => {
        setStatus('disconnected');
        clearActiveCall();
      });
      call.on('cancel', () => {
        setStatus('idle');
        clearActiveCall();
      });
      call.on('error', (err) => {
        console.error('Call error:', err);
        setStatus('error');
        clearActiveCall();
        toast.error(`Call error: ${err.message}`);
      });
    } catch (err: any) {
      setStatus('error');
      toast.error(err.message || 'Failed to connect call');
    }
  }, [phoneNumber, startTimer, clearActiveCall]);

  const hangUp = useCallback(() => {
    activeCallRef.current?.disconnect();
    setStatus('disconnected');
    clearActiveCall();
  }, [clearActiveCall]);

  const resetCall = useCallback(() => {
    setStatus('idle');
    setElapsed(0);
    setSessionId(null);
    setSelectedContact(null);
    setSelectedPhoneId(null);
    setPhoneNumber('+1');
    setContactSearch('');
    setShowLogForm(false);
    setLogTitle('');
    setLogNotes('');
    setRawTranscript(null);
    setLogged(false);
    callStartTimeRef.current = null;
    resetTranscript();
  }, [resetTranscript]);

  const contactDisplayName = selectedContact
    ? [selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ')
    : null;

  const openLogForm = useCallback(() => {
    setShowLogForm(true);
    setLogTitle(contactDisplayName ? `Call with ${contactDisplayName}` : `Call to ${phoneNumber}`);

    const finals = utterances.filter((u) => u.is_final);
    if (finals.length > 0) {
      const transcriptText = finals
        .map((u) => {
          const label = u.track === 'inbound_track' ? 'You' : 'Customer';
          return `${label}: ${u.text}`;
        })
        .join('\n');
      setRawTranscript(transcriptText);

      setSummarizing(true);
      api
        .post('/api/dialer/summarize-transcript', { transcript: transcriptText })
        .then(({ data }) => setLogNotes(data.summary || transcriptText))
        .catch(() => setLogNotes(transcriptText))
        .finally(() => setSummarizing(false));
    } else {
      setRawTranscript(null);
      setTimeout(() => logTitleRef.current?.focus(), 40);
    }
  }, [contactDisplayName, phoneNumber, utterances]);

  const handleSaveLog = useCallback(async () => {
    if (!logTitle.trim() || !selectedContact || saving) return;
    setSaving(true);
    try {
      await api.post(`/api/leads/${selectedContact.lead_id}/actions`, {
        category: 'call',
        title: logTitle.trim(),
        notes: logNotes.trim() || null,
        occurred_at: (callStartTimeRef.current ?? new Date()).toISOString(),
        contact_id: selectedContact.id,
        call_duration_seconds: elapsed > 0 ? elapsed : null,
        call_transcript: rawTranscript,
        dialed_phone_number: phoneNumber.trim() || null,
        dialed_phone_type: selectedPhone?.type ?? null,
      });
      setLogged(true);
      toast.success('Call logged to activity');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to log call');
    } finally {
      setSaving(false);
    }
  }, [logTitle, logNotes, selectedContact, saving, elapsed, rawTranscript, phoneNumber, selectedPhone]);

  const isInCall = status === 'connecting' || status === 'ringing' || status === 'open';
  const isFinished = status === 'disconnected' || status === 'error';
  const isInitializing = !deviceReady && status === 'idle';

  function getCallButtonLabel() {
    if (isInitializing) return 'Initializing...';
    if (isFinished) return 'New call';
    return 'Call';
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900">Dialer</h1>
      <p className="mb-8 text-sm text-zinc-500">Make outbound phone calls via Twilio</p>

      <div className="mx-auto max-w-md">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
            <span className="text-xs font-medium text-zinc-500">{STATUS_LABEL[status]}</span>
            {status === 'open' && (
              <span className="ml-auto font-mono text-xs tabular-nums text-zinc-400">
                {formatTime(elapsed)}
              </span>
            )}
          </div>

          {/* Contact search */}
          {!isInCall && !isFinished && (
            <div ref={contactBoxRef} className="relative mb-4">
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Contact</label>
              {selectedContact ? (
                <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {[selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ')}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {[selectedContact.title, selectedContact.company].filter(Boolean).join(' · ')}
                      {selectedPhone && (
                        <span className="ml-1.5">
                          · {formatPhoneNumber(selectedPhone.number) ?? selectedPhone.number}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearContact}
                    className="ml-2 flex-shrink-0 rounded p-0.5 text-zinc-400 transition hover:text-zinc-600"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      onFocus={() => { if (contactResults.length > 0) setContactsOpen(true); }}
                      placeholder="Search contacts by name, company, or phone..."
                      className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    />
                    {contactsLoading && (
                      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                      </div>
                    )}
                  </div>
                  {contactsOpen && contactResults.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                      {contactResults.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectContact(c)}
                            className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-zinc-50"
                          >
                            <span className="text-sm font-medium text-zinc-900">
                              {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                              {c.title && <span className="ml-1.5 font-normal text-zinc-400">· {c.title}</span>}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {c.company}
                              {getPrimaryPhone(c) && (
                                <span className="ml-1.5">
                                  · {formatPhoneNumber(getPrimaryPhone(c)?.number ?? null) ?? getPrimaryPhone(c)?.number}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {selectedContact && contactPhoneNumbers.length > 0 && !isInCall && !isFinished && (
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Saved numbers</label>
              <div className="flex flex-wrap gap-2">
                {contactPhoneNumbers.map((phone) => (
                  <button
                    key={phone.id}
                    type="button"
                    onClick={() => handlePhoneSelect(phone.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition ${selectedPhoneId === phone.id ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-800'}`}
                  >
                    <span className="block font-medium">
                      {formatPhoneNumber(phone.number) ?? phone.number}
                    </span>
                    <span className="block text-[10px] uppercase tracking-wide opacity-80">
                      {phoneTypeLabel(phone.type)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected contact shown during call */}
          {isInCall && selectedContact && (
            <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <p className="truncate text-sm font-medium text-zinc-900">
                {[selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ')}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {[selectedContact.title, selectedContact.company].filter(Boolean).join(' · ')}
                {selectedPhone && (
                  <span className="ml-1.5">
                    · {phoneTypeLabel(selectedPhone.type)}
                  </span>
                )}
              </p>
            </div>
          )}

          <label htmlFor="phone" className="mb-2 block text-sm font-medium text-zinc-700">
            Phone number
          </label>
          <div className="relative mb-4">
            <PhoneIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="phone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => handlePhoneNumberChange(e.target.value)}
              disabled={isInCall}
              placeholder="+1 (555) 000-0100"
              className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-400"
            />
          </div>

          {isInCall ? (
            <button
              onClick={hangUp}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
            >
              <PhoneXMarkIcon className="h-4 w-4" />
              Hang up
            </button>
          ) : (
            <button
              onClick={isFinished ? resetCall : makeCall}
              disabled={isInitializing}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PhoneIcon className="h-4 w-4" />
              {getCallButtonLabel()}
            </button>
          )}
        </div>

        {sessionId && (status === 'open' || status === 'ringing' || status === 'disconnected') && (
          <div className="mt-4">
            <LiveTranscript
              utterances={utterances}
              streaming={txStatus === 'connecting' || txStatus === 'streaming'}
            />
          </div>
        )}

        {status === 'disconnected' && elapsed > 0 && (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">
              Call to{' '}
              {contactDisplayName ? (
                <span className="font-medium text-zinc-900">{contactDisplayName}</span>
              ) : (
                <span className="font-mono text-zinc-900">{formatPhoneNumber(phoneNumber) ?? phoneNumber}</span>
              )}{' '}
              lasted <span className="font-mono text-zinc-900">{formatTime(elapsed)}</span>
            </p>
          </div>
        )}

        {/* Log to activity form */}
        {status === 'disconnected' && selectedContact && !logged && (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white shadow-sm">
            {!showLogForm ? (
              <button
                type="button"
                onClick={openLogForm}
                className="flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 rounded-xl"
              >
                <ClipboardDocumentListIcon className="h-4 w-4" />
                Log to activity
              </button>
            ) : (
              <div className="space-y-3 p-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">Title</label>
                  <input
                    ref={logTitleRef}
                    type="text"
                    value={logTitle}
                    onChange={(e) => setLogTitle(e.target.value)}
                    placeholder="Brief summary of the call"
                    className="block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">
                    Notes
                    {summarizing && (
                      <span className="ml-2 font-normal text-zinc-400 animate-pulse">
                        Generating summary...
                      </span>
                    )}
                  </label>
                  <textarea
                    value={logNotes}
                    onChange={(e) => setLogNotes(e.target.value)}
                    rows={4}
                    disabled={summarizing}
                    placeholder={summarizing ? 'Summarizing call transcript...' : 'What was discussed?'}
                    className="block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-400"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!logTitle.trim() || saving}
                    onClick={handleSaveLog}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save to Activity Log'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLogForm(false)}
                    disabled={saving}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 transition hover:text-zinc-700 disabled:opacity-50"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Success confirmation after logging */}
        {status === 'disconnected' && logged && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-green-600" />
            <p className="text-sm font-medium text-green-800">Call logged to activity</p>
          </div>
        )}
      </div>
    </div>
  );
}
