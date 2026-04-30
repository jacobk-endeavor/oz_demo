import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  UserIcon,
  ArrowUturnLeftIcon,
  PaperAirplaneIcon,
  InboxArrowDownIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import api from '../api';
import {
  type ActionCategory,
  type LeadAction,
  type ActionPayload,
  ACTION_CATEGORIES,
  TRANSITION_MS,
  categoryIcon,
  categoryLabel,
  formatActionDate,
  contactName,
  formatDuration,
  currentUserFromJWT,
  useAnimatedModal,
} from './activity/types';
import EmailThreadViewer from './activity/EmailThreadViewer';
import ActionForm from './activity/ActionForm';
import DialerModal from './activity/DialerModal';
import EmailComposePanel from './activity/EmailComposePanel';

export type { ActivityContact, LeadEmail } from './activity/types';

const ICON_CLS = 'h-4 w-4';
const LOADING_SKELETON_DELAY_MS = 140;
const LOADING_SKELETON_MIN_VISIBLE_MS = 180;

function useGentleLoadingSkeleton(active: boolean) {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    let timer: number | null = null;

    if (active) {
      if (visible) return;
      timer = window.setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, LOADING_SKELETON_DELAY_MS);
    } else {
      if (!visible) return;
      const shownAt = shownAtRef.current;
      const elapsed = shownAt ? Date.now() - shownAt : LOADING_SKELETON_MIN_VISIBLE_MS;
      const remaining = Math.max(0, LOADING_SKELETON_MIN_VISIBLE_MS - elapsed);
      timer = window.setTimeout(() => {
        shownAtRef.current = null;
        setVisible(false);
      }, remaining);
    }

    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, [active, visible]);

  return visible;
}

export default function ActivityLog({
  leadId,
  contacts,
  refreshKey,
  onReply,
  className,
  prefillCallRequest,
  prefillEmailRequest,
}: {
  leadId: number;
  contacts: import('./activity/types').ActivityContact[];
  refreshKey?: number;
  onReply?: (email: import('./activity/types').LeadEmail) => void;
  className?: string;
  prefillCallRequest?: { requestId: number; contactId: number | null; phoneId: number | null } | null;
  prefillEmailRequest?: { requestId: number; contactId: number | null } | null;
}) {
  const [actions, setActions] = useState<LeadAction[]>([]);
  const [emails, setEmails] = useState<import('./activity/types').LeadEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [presetCategory, setPresetCategory] = useState<ActionCategory>('call');
  const pickerTimerRef = useRef<number | null>(null);
  const callActiveRef = useRef(false);
  const needsConfirmRef = useRef(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [expandedTranscriptId, setExpandedTranscriptId] = useState<number | null>(null);
  const [expandedBodies, setExpandedBodies] = useState<Set<number>>(new Set());
  const [viewingEmail, setViewingEmail] = useState<import('./activity/types').LeadEmail | null>(null);
  const [emailLogManually, setEmailLogManually] = useState(false);
  const [dialerInitialContactId, setDialerInitialContactId] = useState<number | null>(null);
  const [dialerInitialPhoneId, setDialerInitialPhoneId] = useState<number | null>(null);
  const [emailInitialContactId, setEmailInitialContactId] = useState<number | null>(null);

  const modal = useAnimatedModal();
  const emailModal = useAnimatedModal();

  const currentUserId = currentUserFromJWT();
  const currentRole = localStorage.getItem('role');
  const isAdminOrExec = currentRole === 'admin' || currentRole === 'exec';

  const emailByActionId = useMemo(() => {
    const map = new Map<number, import('./activity/types').LeadEmail>();
    for (const e of emails) {
      if (e.lead_action_id != null) map.set(e.lead_action_id, e);
    }
    return map;
  }, [emails]);

  const toggleBody = useCallback((actionId: number) => {
    setExpandedBodies((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) next.delete(actionId);
      else next.add(actionId);
      return next;
    });
  }, []);

  const fetchActions = useCallback(() => {
    api
      .get(`/api/leads/${leadId}/actions`)
      .then((res) => setActions(res.data))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [leadId]);

  const fetchEmails = useCallback(() => {
    api
      .get(`/api/leads/${leadId}/emails`)
      .then((res) => setEmails(res.data))
      .catch(() => { });
  }, [leadId]);

  useEffect(() => { fetchActions(); fetchEmails(); }, [fetchActions, fetchEmails, refreshKey]);
  useEffect(() => () => { if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current); }, []);

  const guardedClose = useCallback(() => {
    if (needsConfirmRef.current) {
      setShowDiscardConfirm(true);
      return;
    }
    modal.close();
  }, [modal.close]);

  const confirmDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
    modal.close();
  }, [modal.close]);

  const cancelDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
  }, []);

  useEffect(() => {
    if (!modal.isOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || saving || callActiveRef.current) return;
      if (showDiscardConfirm) { setShowDiscardConfirm(false); return; }
      guardedClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('keydown', onEsc);
    };
  }, [modal.isOpen, saving, guardedClose, showDiscardConfirm]);

  useEffect(() => {
    if (!emailModal.isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        emailModal.close();
        setTimeout(() => setViewingEmail(null), TRANSITION_MS);
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onEsc);
    };
  }, [emailModal.isOpen, emailModal.close]);

  const sortedActions = useMemo(
    () =>
      [...actions].sort(
        (a, b) =>
          new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime() ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [actions],
  );

  const openWithCategory = useCallback((cat: ActionCategory) => {
    setPresetCategory(cat);
    setEditingId(null);
    setShowCatPicker(false);
    setEmailLogManually(false);
    setDialerInitialContactId(null);
    setDialerInitialPhoneId(null);
    setEmailInitialContactId(null);
    modal.open();
  }, [modal.open]);

  useEffect(() => {
    if (!prefillCallRequest) return;
    setPresetCategory('call');
    setEditingId(null);
    setShowCatPicker(false);
    setEmailLogManually(false);
    setDialerInitialContactId(prefillCallRequest.contactId);
    setDialerInitialPhoneId(prefillCallRequest.phoneId);
    setEmailInitialContactId(null);
    modal.open();
  }, [prefillCallRequest, modal.open]);

  useEffect(() => {
    if (!prefillEmailRequest) return;
    setPresetCategory('email');
    setEditingId(null);
    setShowCatPicker(false);
    setEmailLogManually(false);
    setDialerInitialContactId(null);
    setDialerInitialPhoneId(null);
    setEmailInitialContactId(prefillEmailRequest.contactId);
    modal.open();
  }, [prefillEmailRequest, modal.open]);

  const handleCreate = useCallback(
    async (data: ActionPayload) => {
      setSaving(true);
      try {
        const res = await api.post(`/api/leads/${leadId}/actions`, {
          category: data.category,
          title: data.title,
          notes: data.notes || null,
          occurred_at: data.occurred_at,
          contact_id: data.contact_id,
          call_duration_seconds: data.call_duration_seconds,
          call_transcript: data.call_transcript || null,
        });
        setActions((prev) => [res.data, ...prev]);
        modal.close();
      } finally {
        setSaving(false);
      }
    },
    [leadId, modal.close],
  );

  const handleUpdate = useCallback(
    async (actionId: number, data: ActionPayload) => {
      setSaving(true);
      try {
        const res = await api.patch(`/api/leads/${leadId}/actions/${actionId}`, {
          category: data.category,
          title: data.title,
          notes: data.notes || null,
          occurred_at: data.occurred_at,
          contact_id: data.contact_id,
          call_duration_seconds: data.call_duration_seconds,
          call_transcript: data.call_transcript || null,
        });
        setActions((prev) => prev.map((a) => (a.id === actionId ? res.data : a)));
        setEditingId(null);
      } finally {
        setSaving(false);
      }
    },
    [leadId],
  );

  const handleDelete = useCallback(
    async (actionId: number) => {
      await api.delete(`/api/leads/${leadId}/actions/${actionId}`);
      setActions((prev) => prev.filter((a) => a.id !== actionId));
    },
    [leadId],
  );

  const handleCallActiveChange = useCallback((active: boolean) => {
    callActiveRef.current = active;
  }, []);

  const handleNeedsConfirmChange = useCallback((needs: boolean) => {
    needsConfirmRef.current = needs;
  }, []);
  const showLoadingSkeleton = useGentleLoadingSkeleton(loading);
  const isEmailComposeCard = presetCategory === 'email' && !emailLogManually;

  return (
    <section
      className={[
        'rounded-lg border border-zinc-200 bg-white flex flex-col h-[calc(100vh-5.5rem)]',
        className ?? '',
      ].join(' ').trim()}
    >
      {/* Header */}
      <div className="flex items-center border-b border-zinc-100 px-5 py-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <ClipboardDocumentListIcon className="h-4 w-4" />
          Activity Log
          {actions.length > 0 && (
            <span className="text-zinc-300 font-normal normal-case tracking-normal">
              ({actions.length})
            </span>
          )}
        </h2>
        <div
          className="ml-auto relative"
          onMouseEnter={() => {
            if (pickerTimerRef.current) { clearTimeout(pickerTimerRef.current); pickerTimerRef.current = null; }
            if (!modal.isOpen && !modal.mounted) setShowCatPicker(true);
          }}
          onMouseLeave={() => {
            pickerTimerRef.current = window.setTimeout(() => setShowCatPicker(false), 300);
          }}
        >
          <button
            type="button"
            onClick={() => setShowCatPicker((v) => !v)}
            disabled={modal.isOpen || modal.mounted}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Log Action
          </button>
          <div
            className={`absolute right-0 top-full mt-1 z-10 w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg transition-all duration-200 ease-out origin-top-right ${showCatPicker
                ? 'opacity-100 scale-100 translate-y-0'
                : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
              }`}
          >
            {ACTION_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => openWithCategory(cat.value)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-indigo-50 hover:text-indigo-600"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 transition-colors group-hover:bg-indigo-100">
                  {categoryIcon(cat.value)}
                </span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions list */}
      <div className="flex-1 p-5 space-y-4 overflow-y-auto scrollbar-autohide">
        {loading ? (
          showLoadingSkeleton ? (
            <div className="space-y-3 animate-fade-in">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-xl border border-zinc-100/80 bg-gradient-to-br from-white to-zinc-50/80 shadow-sm"
                >
                  <div className="space-y-3 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded-full bg-zinc-200/80 animate-pulse"
                        style={{ animationDelay: `${i * 120}ms` }}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div
                          className="h-2.5 w-20 rounded-full bg-zinc-200/80 animate-pulse"
                          style={{ animationDelay: `${i * 120}ms` }}
                        />
                        <div
                          className="h-3 w-2/3 rounded-full bg-zinc-200/70 animate-pulse"
                          style={{ animationDelay: `${i * 120 + 60}ms` }}
                        />
                      </div>
                    </div>
                    <div className="space-y-2 pl-11">
                      <div
                        className="h-2.5 w-11/12 rounded-full bg-zinc-100 animate-pulse"
                        style={{ animationDelay: `${i * 120 + 90}ms` }}
                      />
                      <div
                        className="h-2.5 w-8/12 rounded-full bg-zinc-100 animate-pulse"
                        style={{ animationDelay: `${i * 120 + 140}ms` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full" aria-hidden="true" />
          )
        ) : (
          <div className="animate-fade-in">
            {actions.length === 0 && !modal.isOpen ? (
              <div className="flex items-center justify-center py-8 text-center">
                <div>
                  <p className="text-sm text-zinc-400">No actions logged yet.</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Click &ldquo;Log Action&rdquo; to record your first interaction.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {sortedActions.map((action) => {
                  if (editingId === action.id) {
                    return (
                      <ActionForm
                        key={action.id}
                        initial={action}
                        contacts={contacts}
                        onSave={(data) => handleUpdate(action.id, data)}
                        onCancel={() => setEditingId(null)}
                        saving={saving}
                      />
                    );
                  }

                  const email = emailByActionId.get(action.id);
                  const isEmail = action.category === 'email' && !!email;
                  const isSent = isEmail && email.direction === 'sent';
                  const isExpanded = expandedBodies.has(action.id);
                  const emailBody = isEmail ? (email.body_plain ?? action.notes) : null;
                  const bodyIsLong = (emailBody?.length ?? 0) > 200;

                  function emailIcon() {
                    if (!isEmail) return categoryIcon(action.category);
                    return isSent
                      ? <PaperAirplaneIcon className={ICON_CLS} />
                      : <InboxArrowDownIcon className={ICON_CLS} />;
                  }

                  function badgeLabel() {
                    if (!isEmail) return categoryLabel(action.category);
                    return isSent ? 'Sent' : 'Received';
                  }

                  return (
                    <div
                      key={action.id}
                      onClick={isEmail && email ? () => {
                        setViewingEmail(email);
                        emailModal.open();
                      } : undefined}
                      className={`group relative flex gap-3 overflow-hidden rounded-lg border border-zinc-100 bg-zinc-50/50 px-4 py-3 transition-all duration-200 hover:border-zinc-200 hover:bg-zinc-50 ${isEmail && email ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500">
                        {emailIcon()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                            {badgeLabel()}
                          </span>
                          {action.category === 'call' && action.call_duration_seconds != null && (
                            <>
                              <span className="text-zinc-300">&middot;</span>
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-600">
                                <ClockIcon className="h-3 w-3" />
                                {formatDuration(action.call_duration_seconds)}
                              </span>
                            </>
                          )}
                          <span className="text-[11px] text-zinc-400">
                            {formatActionDate(action.occurred_at)}
                          </span>
                        </div>

                        {isEmail ? (
                          <>
                            <p className="text-sm font-medium text-zinc-800 mt-1 truncate">
                              {email.subject || '(No subject)'}
                            </p>
                            <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                              {isSent ? `To: ${email.to_email}` : `From: ${email.from_email}`}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm font-medium text-zinc-800 mt-1">{action.title}</p>
                        )}

                        {isEmail && emailBody ? (
                          <div className="mt-1.5">
                            <div
                              className={`rounded border border-zinc-200 bg-white/80 px-2.5 py-2 text-xs text-zinc-500 leading-relaxed whitespace-pre-line break-words overflow-hidden ${!isExpanded && bodyIsLong ? 'line-clamp-4' : ''
                                }`}
                            >
                              {emailBody}
                            </div>
                            {bodyIsLong && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleBody(action.id); }}
                                className="mt-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-600 transition"
                              >
                                {isExpanded ? 'Show less' : 'Show more'}
                              </button>
                            )}
                          </div>
                        ) : action.notes && !isEmail ? (
                          <p className="text-xs text-zinc-500 leading-relaxed mt-1 whitespace-pre-line break-words overflow-hidden">
                            {action.notes}
                          </p>
                        ) : null}

                        {action.call_transcript && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedTranscriptId(
                                  expandedTranscriptId === action.id ? null : action.id,
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 transition"
                            >
                              <ClipboardDocumentListIcon className="h-3 w-3" />
                              {expandedTranscriptId === action.id
                                ? 'Hide transcript'
                                : 'View transcript'}
                            </button>
                            {expandedTranscriptId === action.id && (
                              <div className="mt-1.5 max-h-40 overflow-y-auto rounded border border-zinc-200 bg-white px-3 py-2">
                                <pre className="text-[11px] leading-relaxed text-zinc-600 whitespace-pre-wrap font-sans">
                                  {action.call_transcript}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-1.5">
                          {action.contact && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                              <UserIcon className="h-3 w-3" />
                              {contactName(action.contact)}
                            </span>
                          )}
                          <span className="text-[11px] text-zinc-400">
                            Logged by {action.user_name}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        {isEmail && onReply && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onReply(email); }}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700"
                            title="Reply"
                          >
                            <ArrowUturnLeftIcon className="h-3 w-3" />
                            Reply
                          </button>
                        )}
                        {(action.user_id === currentUserId || isAdminOrExec) && !action.is_gmail_email && !isEmail && (
                          <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                            {action.user_id === currentUserId && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditingId(action.id); }}
                                className="rounded p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 transition"
                                title="Edit"
                              >
                                <PencilSquareIcon className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!window.confirm('Delete this action?')) return;
                                handleDelete(action.id);
                              }}
                              className="rounded p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition"
                              title="Delete"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action widget — Gmail-style bottom-right floating box */}
      {modal.mounted && (
        <div
          className={`fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] ${isEmailComposeCard ? 'max-w-[560px]' : 'max-w-[420px]'} flex flex-col rounded-lg border border-zinc-200 bg-white shadow-2xl transition-all duration-200 ease-out ${
            modal.entered ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
          style={{ maxHeight: 'calc(100vh - 2rem)' }}
        >
          <div className="flex items-center justify-between rounded-t-lg bg-zinc-900 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-white">
              {presetCategory === 'call'
                ? 'Make a Call'
                : presetCategory === 'email' && !emailLogManually
                  ? 'Send Email'
                  : `Log ${categoryLabel(presetCategory)}`}
            </h3>
            <button
              type="button"
              onClick={presetCategory === 'call' ? guardedClose : modal.close}
              disabled={saving || (presetCategory === 'call' && callActiveRef.current)}
              className="rounded p-0.5 text-zinc-400 transition hover:bg-zinc-700 hover:text-white disabled:opacity-50"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto p-4">
            {presetCategory === 'call' ? (
              <DialerModal
                contacts={contacts}
                initialContactId={dialerInitialContactId}
                initialPhoneId={dialerInitialPhoneId}
                onSave={handleCreate}
                onCancel={guardedClose}
                saving={saving}
                onCallActiveChange={handleCallActiveChange}
                onNeedsConfirmChange={handleNeedsConfirmChange}
              />
            ) : presetCategory === 'email' && !emailLogManually ? (
              <EmailComposePanel
                leadId={leadId}
                contacts={contacts}
                initialContactId={emailInitialContactId}
                onSent={() => { fetchEmails(); fetchActions(); modal.close(); }}
                onCancel={modal.close}
                onLogManually={() => setEmailLogManually(true)}
              />
            ) : (
              <ActionForm
                defaultCategory={presetCategory}
                contacts={contacts}
                onSave={handleCreate}
                onCancel={modal.close}
                saving={saving}
                autoFocusTitle
              />
            )}
          </div>
        </div>
      )}

      {/* Custom discard-confirmation dialog */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h4 className="text-sm font-semibold text-zinc-900">Discard unlogged call?</h4>
            <p className="mt-1 text-sm text-zinc-500">
              You haven&apos;t logged this call yet. Are you sure you want to close without saving?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelDiscard}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={confirmDiscard}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email viewer modal */}
      {emailModal.mounted && viewingEmail && (() => {
        const threadEmails = viewingEmail.gmail_thread_id
          ? emails.filter((e) => e.gmail_thread_id === viewingEmail.gmail_thread_id).sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime())
          : [viewingEmail];

        const closeEmailModal = () => {
          emailModal.close();
          setTimeout(() => setViewingEmail(null), TRANSITION_MS);
        };

        return (
          <div
            className={`fixed inset-0 z-40 flex items-center justify-center bg-zinc-900/35 p-4 backdrop-blur-[1px] transition-opacity duration-200 ease-out ${emailModal.entered ? 'opacity-100' : 'opacity-0'
              }`}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeEmailModal();
            }}
          >
            <div
              className={`flex w-full max-w-2xl max-h-[88vh] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl transition-all duration-200 ease-out ${emailModal.entered ? 'translate-y-0 scale-100' : 'translate-y-2 scale-[0.985]'
                }`}
            >
              <EmailThreadViewer
                threadEmails={threadEmails}
                onClose={closeEmailModal}
                onReply={onReply ? (email) => {
                  emailModal.close();
                  setTimeout(() => {
                    setViewingEmail(null);
                    onReply(email);
                  }, TRANSITION_MS);
                } : undefined}
              />
            </div>
          </div>
        );
      })()}
    </section>
  );
}
