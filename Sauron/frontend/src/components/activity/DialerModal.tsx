import { useState, useCallback, useRef, useEffect } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  UserIcon,
  PhoneXMarkIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { PhoneIcon } from '@heroicons/react/24/solid';
import { Device, Call } from '@twilio/voice-sdk';
import toast from 'react-hot-toast';
import api from '../../api';
import {
  formatPhoneNumber,
  getDisplayPhoneNumbers,
  getPrimaryPhone,
  phoneDigits,
  phoneTypeLabel,
} from '../../contactPhones';
import { useTranscriptStream } from '../../hooks/useTranscriptStream';
import LiveTranscript from '../LiveTranscript';
import {
  type ActivityContact,
  type ActionPayload,
  contactName,
  formatDuration,
  useClickOutside,
} from './types';

type DialerPhase = 'dial' | 'log';
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

export default function DialerModal({
  contacts,
  initialContactId = null,
  initialPhoneId = null,
  onSave,
  onCancel,
  saving,
  onCallActiveChange,
  onNeedsConfirmChange,
}: {
  contacts: ActivityContact[];
  initialContactId?: number | null;
  initialPhoneId?: number | null;
  onSave: (data: ActionPayload) => void;
  onCancel: () => void;
  saving: boolean;
  onCallActiveChange: (active: boolean) => void;
  onNeedsConfirmChange: (needs: boolean) => void;
}) {
  const initialContact = initialContactId != null
    ? contacts.find((contact) => contact.id === initialContactId) ?? null
    : null;
  const initialPhone = initialContact
    ? (
      initialPhoneId != null
        ? getDisplayPhoneNumbers(initialContact).find((phone) => phone.id === initialPhoneId) ?? getPrimaryPhone(initialContact)
        : getPrimaryPhone(initialContact)
    )
    : null;
  const [phase, setPhase] = useState<DialerPhase>('dial');
  const [phoneNumber, setPhoneNumber] = useState(initialPhone?.number ?? initialContact?.phone ?? '+1');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(initialContact?.id ?? null);
  const [selectedPhoneId, setSelectedPhoneId] = useState<number | null>(initialPhone?.id ?? null);
  const [contactOpen, setContactOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<CallStatus>('idle');
  const [deviceReady, setDeviceReady] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const { utterances, status: txStatus } = useTranscriptStream(sessionId);
  const [rawTranscript, setRawTranscript] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useClickOutside(contactRef, useCallback(() => setContactOpen(false), []));

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback(() => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);

  useEffect(() => {
    onNeedsConfirmChange(phase === 'log');
    return () => onNeedsConfirmChange(false);
  }, [phase, onNeedsConfirmChange]);

  useEffect(() => {
    if (initialContactId == null) return;
    const contact = contacts.find((entry) => entry.id === initialContactId);
    if (!contact) return;
    const initialSelectedPhone = initialPhoneId != null
      ? getDisplayPhoneNumbers(contact).find((phone) => phone.id === initialPhoneId) ?? getPrimaryPhone(contact)
      : getPrimaryPhone(contact);
    setSelectedContactId(contact.id);
    setSelectedPhoneId(initialSelectedPhone?.id ?? null);
    if (initialSelectedPhone) {
      setPhoneNumber(initialSelectedPhone.number);
    } else if (contact.phone) {
      setPhoneNumber(contact.phone);
    }
    setContactOpen(false);
  }, [contacts, initialContactId, initialPhoneId]);

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
          if (!cancelled) setDeviceError(err.message);
        });

        await device.register();
        deviceRef.current = device;
      } catch (err: any) {
        if (cancelled) return;
        const msg = err.response?.data?.detail || 'Failed to initialize dialer';
        setDeviceError(msg);
      }
    }

    initDevice();

    return () => {
      cancelled = true;
      activeCallRef.current?.disconnect();
      deviceRef.current?.destroy();
      deviceRef.current = null;
      stopTimer();
    };
  }, [stopTimer]);

  const selectedContact = contacts.find((c) => c.id === selectedContactId);
  const contactPhoneNumbers = selectedContact ? getDisplayPhoneNumbers(selectedContact) : [];
  const selectedPhone = contactPhoneNumbers.find((phone) => phone.id === selectedPhoneId) ?? null;

  const handleContactSelect = useCallback((cId: number | null) => {
    setSelectedContactId(cId);
    setSelectedPhoneId(null);
    if (cId) {
      const c = contacts.find((ct) => ct.id === cId);
      const primaryPhone = c ? getPrimaryPhone(c) : null;
      if (primaryPhone) {
        setSelectedPhoneId(primaryPhone.id);
        setPhoneNumber(primaryPhone.number);
      } else if (c?.phone) {
        setPhoneNumber(c.phone);
      }
    }
    setContactOpen(false);
  }, [contacts]);

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
    if (!deviceRef.current) return toast.error('Dialer not ready');
    if (phoneNumber.replace(/\D/g, '').length < 5) return toast.error('Enter a valid phone number');

    setStatus('connecting');
    setCallStartTime(new Date());
    onCallActiveChange(true);

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
        stopTimer();
        activeCallRef.current = null;
        onCallActiveChange(false);
        setPhase('log');
      });
      call.on('cancel', () => {
        setStatus('idle');
        stopTimer();
        activeCallRef.current = null;
        onCallActiveChange(false);
      });
      call.on('error', (err) => {
        console.error('Call error:', err);
        setStatus('error');
        stopTimer();
        activeCallRef.current = null;
        onCallActiveChange(false);
        toast.error(`Call error: ${err.message}`);
      });
    } catch (err: any) {
      setStatus('error');
      onCallActiveChange(false);
      toast.error(err.message || 'Failed to connect call');
    }
  }, [phoneNumber, startTimer, stopTimer, onCallActiveChange]);

  const hangUp = useCallback(() => {
    activeCallRef.current?.disconnect();
  }, []);

  useEffect(() => {
    if (phase !== 'log') return;
    if (selectedContact) {
      setTitle(`Call with ${contactName(selectedContact)}`);
    } else {
      setTitle(`Call to ${phoneNumber}`);
    }
    const finals = utterances.filter((u) => u.is_final);
    if (finals.length > 0) {
      const transcriptText = finals
        .map((u) => {
          const label = u.track === 'inbound_track' ? 'You' : 'Customer';
          return `${label}: ${u.text}`;
        })
        .join('\n');
      setRawTranscript(transcriptText);

      let cancelled = false;
      setSummarizing(true);
      api
        .post('/api/dialer/summarize-transcript', { transcript: transcriptText })
        .then(({ data }) => {
          if (!cancelled) setNotes(data.summary || transcriptText);
        })
        .catch(() => {
          if (!cancelled) setNotes(transcriptText);
        })
        .finally(() => {
          if (!cancelled) setSummarizing(false);
        });

      return () => { cancelled = true; };
    }
    const timer = window.setTimeout(() => titleRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selectedContact, phoneNumber]);

  function handleSubmit() {
    if (!title.trim() || saving) return;
    onNeedsConfirmChange(false);
    onSave({
      category: 'call',
      title: title.trim(),
      notes: notes.trim(),
      occurred_at: (callStartTime ?? new Date()).toISOString(),
      contact_id: selectedContactId,
      call_duration_seconds: elapsed > 0 ? elapsed : null,
      call_transcript: rawTranscript,
      dialed_phone_number: phoneNumber.trim() || null,
      dialed_phone_type: selectedPhone?.type ?? null,
    });
  }

  function handleLogKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const isInCall = status === 'connecting' || status === 'ringing' || status === 'open';
  const isInitializing = !deviceReady && !deviceError && status === 'idle';

  /* ── Phase 1: Dialer ──────────────────────────────────────────────────── */
  if (phase === 'dial') {
    return (
      <div className="space-y-4">
        {/* Status bar */}
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
          <span className="text-xs font-medium text-zinc-500">{STATUS_LABEL[status]}</span>
          {status === 'open' && (
            <span className="ml-auto font-mono text-xs tabular-nums text-zinc-400">
              {formatDuration(elapsed)}
            </span>
          )}
        </div>

        {deviceError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-600">{deviceError}</p>
            <button
              type="button"
              onClick={() => { setPhase('log'); setTitle(''); }}
              className="mt-1 text-xs font-medium text-red-700 underline hover:text-red-800"
            >
              Log call manually instead
            </button>
          </div>
        )}

        {!deviceError && (
          <>
            {/* Contact selector */}
            {contacts.length > 0 && !isInCall && (
              <div ref={contactRef} className="relative">
                <label className="block text-xs font-medium text-zinc-500 mb-1">Contact</label>
                <button
                  type="button"
                  onClick={() => setContactOpen((o) => !o)}
                  className="flex w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 transition hover:border-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <UserIcon className="h-4 w-4 text-zinc-400" />
                    {selectedContact
                      ? (
                        <span className="truncate">
                          {contactName(selectedContact)}
                          {selectedPhone && (
                            <span className="text-zinc-400 ml-1">
                              · {formatPhoneNumber(selectedPhone.number) ?? selectedPhone.number}
                            </span>
                          )}
                        </span>
                      )
                      : <span className="truncate text-zinc-400">Select a contact</span>
                    }
                  </span>
                  <ChevronDownIcon className={`h-4 w-4 text-zinc-400 transition ${contactOpen ? 'rotate-180' : ''}`} />
                </button>
                {contactOpen && (
                  <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
                    <li>
                      <button
                        type="button"
                        onClick={() => handleContactSelect(null)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition ${selectedContactId === null ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-500 hover:bg-zinc-50'
                          }`}
                      >
                        <span className="flex-1 text-left italic">None</span>
                        {selectedContactId === null && <CheckIcon className="h-4 w-4 text-indigo-600" />}
                      </button>
                    </li>
                    {contacts.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => handleContactSelect(c.id)}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition ${c.id === selectedContactId ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-700 hover:bg-zinc-50'
                            }`}
                        >
                          <span className="flex-1 text-left">
                            {contactName(c)}
                            {c.title && <span className="text-zinc-400 ml-1">· {c.title}</span>}
                            {getPrimaryPhone(c) && (
                              <span className="text-zinc-400 ml-1">
                                · {formatPhoneNumber(getPrimaryPhone(c)?.number ?? null) ?? getPrimaryPhone(c)?.number}
                              </span>
                            )}
                          </span>
                          {c.id === selectedContactId && <CheckIcon className="h-4 w-4 text-indigo-600" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {selectedContact && contactPhoneNumbers.length > 0 && !isInCall && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Saved number</label>
                <div className="flex flex-wrap gap-2">
                  {contactPhoneNumbers.map((phone) => (
                    <button
                      key={phone.id}
                      type="button"
                      onClick={() => handlePhoneSelect(phone.id)}
                      className={`rounded-md border px-3 py-1.5 text-left text-xs transition ${selectedPhoneId === phone.id ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-800'}`}
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

            {/* Phone number input */}
            {!isInCall && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Phone number</label>
                <div className="relative">
                  <PhoneIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => handlePhoneNumberChange(e.target.value)}
                    placeholder="+1 (555) 000-0100"
                    className="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-9 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            {/* In-call info */}
            {isInCall && (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-center">
                {selectedContact && (
                  <p className="text-sm font-medium text-zinc-800">{contactName(selectedContact)}</p>
                )}
                <p className="text-xs text-zinc-500 font-mono">
                  {formatPhoneNumber(phoneNumber) ?? phoneNumber}
                  {selectedPhone && (
                    <span className="ml-2 font-sans uppercase tracking-wide text-zinc-400">
                      {phoneTypeLabel(selectedPhone.type)}
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Live transcript */}
            {sessionId && (status === 'open' || status === 'ringing') && (
              <LiveTranscript
                utterances={utterances}
                streaming={txStatus === 'connecting' || txStatus === 'streaming'}
              />
            )}

            {/* Call / Hang up button */}
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
                onClick={makeCall}
                disabled={isInitializing || phoneNumber.replace(/\D/g, '').length < 5}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PhoneIcon className="h-4 w-4" />
                {isInitializing ? 'Initializing...' : 'Call'}
              </button>
            )}
          </>
        )}

        {/* Divider and skip link */}
        {!isInCall && (
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-zinc-200" />
            <span className="text-[11px] text-zinc-400">or</span>
            <div className="flex-1 border-t border-zinc-200" />
          </div>
        )}
        {!isInCall && (
          <button
            type="button"
            onClick={() => { setPhase('log'); setTitle(''); }}
            className="w-full text-center text-xs font-medium text-zinc-500 hover:text-zinc-700 transition"
          >
            Skip, just log a call manually
          </button>
        )}
      </div>
    );
  }

  /* ── Phase 2: Log call ────────────────────────────────────────────────── */
  return (
    <div className="space-y-3" onKeyDown={handleLogKeyDown}>
      {/* Call summary */}
      {elapsed > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          <ClockIcon className="h-4 w-4 text-zinc-400" />
          <span className="text-xs text-zinc-600">
            Call ended &middot; Duration: <span className="font-mono font-medium">{formatDuration(elapsed)}</span>
          </span>
        </div>
      )}

      {/* Contact selector */}
      {contacts.length > 0 && (
        <div ref={contactRef} className="relative">
          <label className="block text-xs font-medium text-zinc-500 mb-1">Contact</label>
          <button
            type="button"
            onClick={() => setContactOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 transition hover:border-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <span className="flex min-w-0 items-center gap-2">
              <UserIcon className="h-4 w-4 text-zinc-400" />
              {selectedContact
                ? (
                  <span className="truncate">
                    {contactName(selectedContact)}
                    {selectedPhone && (
                      <span className="ml-1 text-zinc-400">
                        · {formatPhoneNumber(selectedPhone.number) ?? selectedPhone.number}
                      </span>
                    )}
                  </span>
                )
                : <span className="truncate text-zinc-400">No contact selected</span>
              }
            </span>
            <ChevronDownIcon className={`h-4 w-4 text-zinc-400 transition ${contactOpen ? 'rotate-180' : ''}`} />
          </button>
          {contactOpen && (
            <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
              <li>
                <button
                  type="button"
                  onClick={() => handleContactSelect(null)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition ${selectedContactId === null ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-500 hover:bg-zinc-50'
                    }`}
                >
                  <span className="flex-1 text-left italic">None</span>
                  {selectedContactId === null && <CheckIcon className="h-4 w-4 text-indigo-600" />}
                </button>
              </li>
              {contacts.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handleContactSelect(c.id)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition ${c.id === selectedContactId ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-700 hover:bg-zinc-50'
                      }`}
                  >
                    <span className="flex-1 text-left">
                      {contactName(c)}
                      {c.title && <span className="text-zinc-400 ml-1">· {c.title}</span>}
                    </span>
                    {c.id === selectedContactId && <CheckIcon className="h-4 w-4 text-indigo-600" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selectedContact && contactPhoneNumbers.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Dialed number</label>
          <div className="flex flex-wrap gap-2">
            {contactPhoneNumbers.map((phone) => (
              <button
                key={phone.id}
                type="button"
                onClick={() => handlePhoneSelect(phone.id)}
                className={`rounded-md border px-3 py-1.5 text-left text-xs transition ${selectedPhoneId === phone.id ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-800'}`}
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

      {/* Title */}
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Title</label>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief summary of the call"
          className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">
          Notes <span className="text-zinc-400 font-normal">(optional)</span>
          {summarizing && (
            <span className="ml-2 text-indigo-500 font-normal animate-pulse">
              Generating summary...
            </span>
          )}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          disabled={summarizing}
          placeholder={summarizing ? 'Summarizing call transcript...' : 'What was discussed?'}
          className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-zinc-50 disabled:text-zinc-400"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!title.trim() || saving}
          onClick={handleSubmit}
          className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Log Call'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:text-zinc-700 disabled:opacity-50"
        >
          Cancel
        </button>
        <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap pl-2 text-[11px] text-zinc-400">
          <kbd className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-[10px] font-medium">&#8984;</kbd>
          <span>+</span>
          <kbd className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-[10px] font-medium">Enter</kbd>
          <span>to save</span>
        </span>
      </div>
    </div>
  );
}
