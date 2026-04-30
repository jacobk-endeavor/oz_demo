import { useState, useRef, useEffect, useCallback } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import {
  type ActionCategory,
  type LeadAction,
  type ActivityContact,
  type ActionPayload,
  ACTION_CATEGORIES,
  categoryIcon,
  categoryLabel,
  contactName,
  useClickOutside,
} from './types';
import DateTimePicker from './DateTimePicker';

const TITLE_PLACEHOLDER: Partial<Record<ActionCategory, string>> = {
  meeting: 'e.g. Quarterly review with client',
  note: 'e.g. Followed up on proposal',
  site_visit: 'e.g. Toured warehouse facility',
  other: 'Brief summary of the action',
  call: 'Brief summary of the call',
  email: 'Brief summary of the email',
};

const NOTES_PLACEHOLDER: Partial<Record<ActionCategory, string>> = {
  meeting: 'Who attended, what was discussed, next steps...',
  note: 'Additional context or details...',
  site_visit: 'Observations, findings, follow-up items...',
  other: 'Additional details...',
  call: 'What was discussed?',
  email: 'Additional details...',
};

export default function ActionForm({
  initial,
  defaultCategory,
  contacts,
  onSave,
  onCancel,
  saving,
  autoFocusTitle = false,
}: {
  initial?: LeadAction;
  defaultCategory?: ActionCategory;
  contacts: ActivityContact[];
  onSave: (data: ActionPayload) => void;
  onCancel: () => void;
  saving: boolean;
  autoFocusTitle?: boolean;
}) {
  const isEditing = !!initial;
  const lockedCategory = !isEditing && !!defaultCategory;

  const [category, setCategory] = useState<ActionCategory>(initial?.category ?? defaultCategory ?? 'call');
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);
  const [contactId, setContactId] = useState<number | null>(initial?.contact_id ?? null);
  const [contactOpen, setContactOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const titleRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [occurredAt, setOccurredAt] = useState<Date>(
    initial?.occurred_at ? new Date(initial.occurred_at) : new Date(),
  );

  useClickOutside(catRef, useCallback(() => setCatOpen(false), []));
  useClickOutside(contactRef, useCallback(() => setContactOpen(false), []));

  useEffect(() => {
    if (!autoFocusTitle) return;
    const timer = window.setTimeout(() => titleRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [autoFocusTitle]);

  const selectedContact = contacts.find((c) => c.id === contactId);
  const contactDisplayName = selectedContact ? contactName(selectedContact) : null;

  function buildPayload(): ActionPayload {
    return {
      category,
      title: title.trim(),
      notes: notes.trim(),
      occurred_at: occurredAt.toISOString(),
      contact_id: contactId,
      call_duration_seconds: initial?.call_duration_seconds ?? null,
      call_transcript: initial?.call_transcript ?? null,
    };
  }

  function handleSubmit() {
    if (!title.trim() || saving) return;
    onSave(buildPayload());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown}>
      {/* Category selector -- only shown when editing an existing action */}
      {!lockedCategory && (
        <div ref={catRef} className="relative">
          <label className="block text-xs font-medium text-zinc-500 mb-1">Category</label>
          <button
            type="button"
            onClick={() => setCatOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 transition hover:border-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <span className="flex min-w-0 items-center gap-2">
              {categoryIcon(category)}
              <span className="truncate">{categoryLabel(category)}</span>
            </span>
            <ChevronDownIcon className={`h-4 w-4 text-zinc-400 transition ${catOpen ? 'rotate-180' : ''}`} />
          </button>
          {catOpen && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
              {ACTION_CATEGORIES.map((c) => (
                <li key={c.value}>
                  <button
                    type="button"
                    onClick={() => { setCategory(c.value); setCatOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition ${c.value === category ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-700 hover:bg-zinc-50'
                      }`}
                  >
                    {categoryIcon(c.value)}
                    <span className="flex-1 text-left">{c.label}</span>
                    {c.value === category && <CheckIcon className="h-4 w-4 text-indigo-600" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <DateTimePicker value={occurredAt} onChange={setOccurredAt} />

      {contacts.length > 0 && (
        <div ref={contactRef} className="relative">
          <label className="block text-xs font-medium text-zinc-500 mb-1">
            Contact <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <button
            type="button"
            onClick={() => setContactOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 transition hover:border-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <span className="flex min-w-0 items-center gap-2">
              <UserIcon className="h-4 w-4 text-zinc-400" />
              {contactDisplayName
                ? <span className="truncate">{contactDisplayName}</span>
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
                  onClick={() => { setContactId(null); setContactOpen(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition ${contactId === null ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-500 hover:bg-zinc-50'
                    }`}
                >
                  <span className="flex-1 text-left italic">None</span>
                  {contactId === null && <CheckIcon className="h-4 w-4 text-indigo-600" />}
                </button>
              </li>
              {contacts.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => { setContactId(c.id); setContactOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition ${c.id === contactId ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-700 hover:bg-zinc-50'
                      }`}
                  >
                    <span className="flex-1 text-left">
                      {contactName(c)}
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

      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Title</label>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={TITLE_PLACEHOLDER[category] ?? 'Brief summary of the action'}
          className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">
          Notes <span className="text-zinc-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder={NOTES_PLACEHOLDER[category] ?? 'Additional details...'}
          className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 resize-y focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!title.trim() || saving}
          onClick={handleSubmit}
          className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : initial ? 'Update' : `Log ${categoryLabel(category)}`}
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
