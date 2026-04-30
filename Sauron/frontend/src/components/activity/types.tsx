import { useState, useCallback, useRef, useEffect } from 'react';
import {
  PhoneArrowUpRightIcon,
  EnvelopeIcon,
  CalendarDaysIcon,
  MapPinIcon,
  EllipsisHorizontalIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';

import type { ContactPhoneNumber } from '../../contactPhones';

/* ── Types ────────────────────────────────────────────────────────────────── */

export type ActionCategory = 'call' | 'email' | 'meeting' | 'note' | 'site_visit' | 'other';

export interface ActionContact {
  id: number;
  first_name: string;
  last_name: string | null;
  title: string | null;
}

export interface LeadAction {
  id: number;
  lead_id: number;
  user_id: number;
  user_name: string;
  contact_id: number | null;
  contact: ActionContact | null;
  category: ActionCategory;
  title: string;
  notes: string | null;
  call_duration_seconds: number | null;
  call_transcript: string | null;
  dialed_phone_number?: string | null;
  dialed_phone_type?: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  is_gmail_email?: boolean;
}

export interface ActivityContact {
  id: number;
  first_name: string;
  last_name: string | null;
  title: string | null;
  phone: string | null;
  phone_numbers: ContactPhoneNumber[];
  email?: string | null;
}

export interface LeadEmail {
  id: number;
  lead_id: number;
  contact_id: number | null;
  lead_action_id: number | null;
  sent_by_user_id: number | null;
  sent_by_user_name: string | null;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  direction: 'sent' | 'received';
  from_email: string;
  to_email: string;
  subject: string;
  body_plain: string | null;
  is_read: boolean;
  occurred_at: string;
  created_at: string;
}

export interface ActionPayload {
  category: ActionCategory;
  title: string;
  notes: string;
  occurred_at: string;
  contact_id: number | null;
  call_duration_seconds: number | null;
  call_transcript: string | null;
  dialed_phone_number?: string | null;
  dialed_phone_type?: string | null;
}

/* ── Constants ────────────────────────────────────────────────────────────── */

export const ACTION_CATEGORIES: { value: ActionCategory; label: string }[] = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'note', label: 'Note' },
  { value: 'site_visit', label: 'Site Visit' },
  { value: 'other', label: 'Other' },
];

const ICON_CLS = 'h-4 w-4';
const ICON_SM_CLS = 'h-3.5 w-3.5';
export const TRANSITION_MS = 200;

export const CATEGORY_ICONS: Record<ActionCategory, React.ReactNode> = {
  call: <PhoneArrowUpRightIcon className={ICON_CLS} />,
  email: <EnvelopeIcon className={ICON_CLS} />,
  meeting: <CalendarDaysIcon className={ICON_CLS} />,
  note: <ClipboardDocumentListIcon className={ICON_CLS} />,
  site_visit: <MapPinIcon className={ICON_CLS} />,
  other: <EllipsisHorizontalIcon className={ICON_CLS} />,
};

export const CATEGORY_ICONS_SM: Record<ActionCategory, React.ReactNode> = {
  call: <PhoneArrowUpRightIcon className={ICON_SM_CLS} />,
  email: <EnvelopeIcon className={ICON_SM_CLS} />,
  meeting: <CalendarDaysIcon className={ICON_SM_CLS} />,
  note: <ClipboardDocumentListIcon className={ICON_SM_CLS} />,
  site_visit: <MapPinIcon className={ICON_SM_CLS} />,
  other: <EllipsisHorizontalIcon className={ICON_SM_CLS} />,
};

/* ── Helper functions ─────────────────────────────────────────────────────── */

export function categoryIcon(cat: ActionCategory) {
  return CATEGORY_ICONS[cat] ?? CATEGORY_ICONS.other;
}

export function categoryLabel(cat: ActionCategory): string {
  return ACTION_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

export function formatActionDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

export function contactName(c: { first_name: string; last_name: string | null }): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ');
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function currentUserFromJWT(): number | null {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    return Number(JSON.parse(atob(token.split('.')[1])).sub);
  } catch {
    return null;
  }
}

export function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHrs = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export function extractDisplayName(email: string): string {
  const match = email.match(/^(.+?)\s*<[^>]+>$/);
  if (match) return match[1].replace(/^["']|["']$/g, '');
  const atIdx = email.indexOf('@');
  if (atIdx > 0) return email.substring(0, atIdx);
  return email;
}

export function extractInitials(email: string): string {
  const name = extractDisplayName(email);
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
];

export function avatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = ((hash << 5) - hash + email.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/* ── FadingScroll component ───────────────────────────────────────────────── */

const FADE_PX = 32;
const MASK_BOTH = `linear-gradient(to bottom, transparent, black ${FADE_PX}px, black calc(100% - ${FADE_PX}px), transparent)`;
const MASK_DOWN = `linear-gradient(to bottom, black calc(100% - ${FADE_PX}px), transparent)`;
const MASK_UP = `linear-gradient(to bottom, transparent, black ${FADE_PX}px)`;

export function FadingScroll({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mask, setMask] = useState<string | undefined>(undefined);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const up = el.scrollTop > 2;
    const down = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    if (up && down) setMask(MASK_BOTH);
    else if (down) setMask(MASK_DOWN);
    else if (up) setMask(MASK_UP);
    else setMask(undefined);
  }, []);

  useEffect(() => {
    check();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [check, children]);

  return (
    <div
      ref={ref}
      onScroll={check}
      className={className}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      {children}
    </div>
  );
}

/* ── Hooks ────────────────────────────────────────────────────────────────── */

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

/**
 * Manages mount -> enter -> leave -> unmount lifecycle for animated overlays.
 */
export function useAnimatedModal() {
  const [intent, setIntent] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const timerRef = useRef<number | null>(null);

  const open = useCallback(() => setIntent(true), []);

  const close = useCallback(() => {
    setEntered(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setIntent(false);
      setMounted(false);
      timerRef.current = null;
    }, TRANSITION_MS);
  }, []);

  useEffect(() => {
    if (!intent) return;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setMounted(true);
  }, [intent]);

  useEffect(() => {
    if (!mounted) return;
    let id: number;
    const outer = window.requestAnimationFrame(() => {
      id = window.requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(id);
    };
  }, [mounted]);

  return { mounted, entered, open, close, isOpen: intent } as const;
}
