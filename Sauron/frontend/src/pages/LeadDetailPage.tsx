import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  SparklesIcon,
  EnvelopeIcon,
  PhoneIcon,
  ChevronDownIcon,
  LinkIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  CheckIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import api from '../api';
import { useAuth } from '../AuthContext';
import {
  type ContactPhoneNumber,
  PHONE_TYPE_OPTIONS,
  formatPhoneNumber,
  getDisplayPhoneNumbers,
  getPrimaryPhone,
  phoneTypeLabel,
} from '../contactPhones';
import DetailFields from '../components/DetailFields';
import ChatPanel from '../components/ChatPanel';
import MarkdownContent from '../components/MarkdownContent';
import ActivityLog, { type LeadEmail } from '../components/ActivityLogSidebar';
import { useChat, type ChatMessage } from '../hooks/useChat';
import { useSSEEnrich, type EnrichStep } from '../hooks/useSSEEnrich';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface LeadUser {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  color: string | null;
}

interface ContactExperience {
  id: number;
  company: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface LeadContact {
  id: number;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  phone_numbers: ContactPhoneNumber[];
  title: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  photo_url: string | null;
  summary: { role_description?: string; relevance?: string; personal_background?: string } | null;
  experiences: ContactExperience[];
}

interface TriggerEvent {
  category: string;
  description: string;
  source: string | null;
}

interface Lead {
  id: number;
  company: string;
  domain: string | null;
  erp: string | null;
  num_erp_users: number | null;
  num_locations: number | null;
  buying_groups: string[] | null;
  associations: string | null;
  primary_industry: string | null;
  company_type: string | null;
  revenue_m: string | null;
  type: string | null;
  hq_address: string | null;
  hq_phone: string | null;
  employee_count: number | null;
  hq_timezone: string | null;
  recent_initiatives: string | null;
  recent_initiatives_sources: string[] | null;
  public_priorities: string | null;
  public_priorities_sources: string[] | null;
  operational_changes: string | null;
  operational_changes_sources: string[] | null;
  workflow_modernization_signals: string | null;
  workflow_modernization_signals_sources: string[] | null;
  trigger_events: TriggerEvent[] | null;
  company_background: string | null;
  user_id: number | null;
  user: LeadUser | null;
  contacts: LeadContact[];
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const TIMEZONE_LABELS: Record<string, string> = {
  'America/New_York': 'Eastern', 'America/Detroit': 'Eastern',
  'America/Indiana/Indianapolis': 'Eastern', 'America/Indiana/Vincennes': 'Eastern',
  'America/Indiana/Winamac': 'Eastern', 'America/Indiana/Marengo': 'Eastern',
  'America/Indiana/Petersburg': 'Eastern', 'America/Indiana/Vevay': 'Eastern',
  'America/Kentucky/Louisville': 'Eastern', 'America/Kentucky/Monticello': 'Eastern',
  'US/Eastern': 'Eastern',
  'America/Toronto': 'Eastern', 'America/Montreal': 'Eastern',
  'America/Iqaluit': 'Eastern', 'America/Nipigon': 'Eastern',
  'America/Thunder_Bay': 'Eastern', 'America/Pangnirtung': 'Eastern',
  'Canada/Eastern': 'Eastern',
  'America/Bogota': 'Eastern', 'America/Lima': 'Eastern',
  'America/Guayaquil': 'Eastern', 'America/Rio_Branco': 'Eastern',
  'America/Chicago': 'Central', 'America/Indiana/Knox': 'Central',
  'America/Indiana/Tell_City': 'Central', 'America/Menominee': 'Central',
  'America/North_Dakota/Beulah': 'Central', 'America/North_Dakota/Center': 'Central',
  'America/North_Dakota/New_Salem': 'Central', 'US/Central': 'Central',
  'America/Winnipeg': 'Central', 'America/Rainy_River': 'Central',
  'America/Rankin_Inlet': 'Central', 'America/Resolute': 'Central',
  'America/Regina': 'Central', 'America/Swift_Current': 'Central',
  'Canada/Central': 'Central', 'Canada/Saskatchewan': 'Central',
  'America/Mexico_City': 'Central', 'America/Costa_Rica': 'Central',
  'America/El_Salvador': 'Central', 'America/Guatemala': 'Central',
  'America/Managua': 'Central', 'America/Tegucigalpa': 'Central',
  'America/Merida': 'Central', 'America/Monterrey': 'Central',
  'America/Bahia_Banderas': 'Central',
  'America/Denver': 'Mountain', 'America/Boise': 'Mountain',
  'America/Phoenix': 'Mountain', 'US/Mountain': 'Mountain', 'US/Arizona': 'Mountain',
  'America/Edmonton': 'Mountain', 'America/Cambridge_Bay': 'Mountain',
  'America/Inuvik': 'Mountain', 'America/Yellowknife': 'Mountain',
  'America/Dawson_Creek': 'Mountain', 'America/Creston': 'Mountain',
  'America/Fort_Nelson': 'Mountain', 'Canada/Mountain': 'Mountain',
  'America/Chihuahua': 'Mountain', 'America/Mazatlan': 'Mountain',
  'America/Hermosillo': 'Mountain',
  'America/Los_Angeles': 'Pacific', 'US/Pacific': 'Pacific',
  'America/Vancouver': 'Pacific', 'America/Whitehorse': 'Pacific',
  'America/Dawson': 'Pacific', 'Canada/Pacific': 'Pacific', 'Canada/Yukon': 'Pacific',
  'America/Tijuana': 'Pacific', 'Mexico/BajaNorte': 'Pacific',
  'America/Sao_Paulo': 'South America', 'America/Argentina/Buenos_Aires': 'South America',
  'America/Argentina/Cordoba': 'South America', 'America/Argentina/Salta': 'South America',
  'America/Argentina/Tucuman': 'South America', 'America/Argentina/Mendoza': 'South America',
  'America/Argentina/San_Juan': 'South America', 'America/Argentina/San_Luis': 'South America',
  'America/Argentina/Jujuy': 'South America', 'America/Argentina/Catamarca': 'South America',
  'America/Argentina/La_Rioja': 'South America', 'America/Argentina/Rio_Gallegos': 'South America',
  'America/Argentina/Ushuaia': 'South America',
  'America/Montevideo': 'South America', 'America/Santiago': 'South America',
  'America/Asuncion': 'South America', 'America/Caracas': 'South America',
  'America/La_Paz': 'South America', 'America/Manaus': 'South America',
  'America/Cuiaba': 'South America', 'America/Campo_Grande': 'South America',
  'America/Fortaleza': 'South America', 'America/Recife': 'South America',
  'America/Belem': 'South America', 'America/Bahia': 'South America',
  'America/Maceio': 'South America', 'America/Araguaina': 'South America',
  'America/Cayenne': 'South America', 'America/Paramaribo': 'South America',
  'America/Guyana': 'South America',
  'America/Anchorage': 'Alaska', 'America/Juneau': 'Alaska', 'America/Sitka': 'Alaska',
  'America/Yakutat': 'Alaska', 'America/Nome': 'Alaska', 'America/Metlakatla': 'Alaska',
  'America/Adak': 'Alaska', 'US/Alaska': 'Alaska', 'US/Aleutian': 'Alaska',
  'Pacific/Honolulu': 'Hawaii', 'US/Hawaii': 'Hawaii',
};

function formatTimezone(iana: string | null): string | null {
  if (!iana) return null;
  if (TIMEZONE_LABELS[iana]) return TIMEZONE_LABELS[iana];
  if (iana.startsWith('Europe/')) return 'Europe';
  return iana;
}

function formatPhone(phone: string | null): string | null {
  return formatPhoneNumber(phone);
}

function formatRevenue(revenueM: string | null): string | null {
  if (!revenueM) return null;
  const trimmed = revenueM.trim();
  if (!trimmed) return null;

  const numeric = Number(trimmed.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(numeric)) {
    return trimmed;
  }

  const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  if (numeric >= 1000) {
    return `$${formatter.format(numeric / 1000)}B`;
  }

  return `$${formatter.format(numeric)}M`;
}

const DEFAULT_BDR_COLOR = '#6b7280';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function bdrBadgeStyle(color: string | null | undefined) {
  const hex = color || DEFAULT_BDR_COLOR;
  const rgb = hexToRgb(hex);
  if (!rgb) return {};
  return {
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`,
    color: hex,
  };
}

function userDisplayName(user: LeadUser | null): string {
  if (!user) return '';
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return full || user.email;
}

function contactInitials(contact: LeadContact): string {
  const first = contact.first_name?.[0] ?? '';
  const last = contact.last_name?.[0] ?? '';
  return (first + last).toUpperCase() || '?';
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
];

function avatarColor(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

/* -------------------------------------------------------------------------- */
/*  Enrichment progress                                                       */
/* -------------------------------------------------------------------------- */

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
              <svg className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
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

/* -------------------------------------------------------------------------- */
/*  Contact card                                                              */
/* -------------------------------------------------------------------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
      {children}
    </div>
  );
}

interface EditableContactExperience {
  id: number;
  company: string;
  title: string;
  start_date: string;
  end_date: string;
}

interface EditableContactPhone {
  id: number;
  number: string;
  type: string;
  is_primary: boolean;
}

function isLikelyHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function DisclosureHeader({ label, open, onToggle, count }: { label: string; open: boolean; onToggle: () => void; count?: number }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
    >
      <span>
        {label}
        {count != null && count > 0 && <span className="ml-1.5 text-zinc-400">({count})</span>}
      </span>
      <ChevronDownIcon className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

function ContactEditModal({
  leadId,
  contact,
  onClose,
  onSaved,
}: {
  leadId: number;
  contact: LeadContact;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(contact.first_name);
  const [lastName, setLastName] = useState(contact.last_name ?? '');
  const [title, setTitle] = useState(contact.title ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const [phoneNumbers, setPhoneNumbers] = useState<EditableContactPhone[]>(() =>
    getDisplayPhoneNumbers(contact).map((phone) => ({
      id: phone.id,
      number: phone.number,
      type: phone.type ?? 'unknown',
      is_primary: phone.is_primary,
    })),
  );
  const [linkedinUrl, setLinkedinUrl] = useState(contact.linkedin_url ?? '');
  const [facebookUrl, setFacebookUrl] = useState(contact.facebook_url ?? '');
  const [instagramUrl, setInstagramUrl] = useState(contact.instagram_url ?? '');
  const [photoUrl, setPhotoUrl] = useState(contact.photo_url ?? '');
  const [about, setAbout] = useState(contact.summary?.role_description ?? '');
  const [relevance, setRelevance] = useState(contact.summary?.relevance ?? '');
  const [personalBackground, setPersonalBackground] = useState(contact.summary?.personal_background ?? '');
  const [experiences, setExperiences] = useState<EditableContactExperience[]>(() =>
    (contact.experiences ?? []).map((exp) => ({
      id: exp.id,
      company: exp.company ?? '',
      title: exp.title ?? '',
      start_date: exp.start_date ?? '',
      end_date: exp.end_date ?? '',
    })),
  );
  const nextExperienceIdRef = useRef(-1);
  const nextPhoneIdRef = useRef(-1000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLinks, setShowLinks] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showExperiences, setShowExperiences] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onEsc);
    };
  }, [saving, onClose]);

  const inputCls = 'w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400';

  function addExperience() {
    setExperiences((prev) => [
      ...prev,
      {
        id: nextExperienceIdRef.current--,
        company: '',
        title: '',
        start_date: '',
        end_date: '',
      },
    ]);
  }

  function updateExperience(
    id: number,
    field: 'company' | 'title' | 'start_date' | 'end_date',
    value: string,
  ) {
    setExperiences((prev) => prev.map((exp) => (exp.id === id ? { ...exp, [field]: value } : exp)));
  }

  function removeExperience(id: number) {
    setExperiences((prev) => prev.filter((exp) => exp.id !== id));
  }

  function addPhoneNumber() {
    setPhoneNumbers((prev) => [
      ...prev,
      {
        id: nextPhoneIdRef.current--,
        number: '',
        type: 'mobile',
        is_primary: prev.length === 0,
      },
    ]);
  }

  function updatePhoneNumber(
    id: number,
    field: 'number' | 'type',
    value: string,
  ) {
    setPhoneNumbers((prev) => prev.map((phone) => (
      phone.id === id ? { ...phone, [field]: value } : phone
    )));
  }

  function setPrimaryPhone(id: number) {
    setPhoneNumbers((prev) => prev.map((phone) => ({ ...phone, is_primary: phone.id === id })));
  }

  function removePhoneNumber(id: number) {
    setPhoneNumbers((prev) => {
      const remaining = prev.filter((phone) => phone.id !== id);
      if (remaining.length > 0 && !remaining.some((phone) => phone.is_primary)) {
        remaining[0] = { ...remaining[0], is_primary: true };
      }
      return remaining;
    });
  }

  async function handleSave() {
    const trimmedFirstName = firstName.trim();
    const trimmedEmail = email.trim();
    if (!trimmedFirstName) {
      setError('First name is required.');
      return;
    }
    if (trimmedEmail && !trimmedEmail.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    const urlsToValidate = [
      { label: 'LinkedIn URL', value: linkedinUrl.trim() },
      { label: 'Facebook URL', value: facebookUrl.trim() },
      { label: 'Instagram URL', value: instagramUrl.trim() },
      { label: 'Photo URL', value: photoUrl.trim() },
    ];
    for (const item of urlsToValidate) {
      if (item.value && !isLikelyHttpUrl(item.value)) {
        setError(`${item.label} must start with http:// or https://`);
        return;
      }
    }

    const normalizedExperiences: Array<{
      company: string;
      title: string | null;
      start_date: string | null;
      end_date: string | null;
    }> = [];
    for (const exp of experiences) {
      const company = exp.company.trim();
      const roleTitle = exp.title.trim();
      const startDate = exp.start_date.trim();
      const endDate = exp.end_date.trim();
      const hasAnyValue = !!(company || roleTitle || startDate || endDate);
      if (!hasAnyValue) continue;
      if (!company) {
        setError('Each experience row needs a company name.');
        return;
      }
      normalizedExperiences.push({
        company,
        title: roleTitle || null,
        start_date: startDate || null,
        end_date: endDate || null,
      });
    }

    const normalizedPhoneNumbers: Array<{
      number: string;
      type: string | null;
      is_primary: boolean;
    }> = [];
    for (const phone of phoneNumbers) {
      const number = phone.number.trim();
      if (!number) continue;
      normalizedPhoneNumbers.push({
        number,
        type: phone.type || 'unknown',
        is_primary: phone.is_primary,
      });
    }
    if (normalizedPhoneNumbers.length > 0 && !normalizedPhoneNumbers.some((phone) => phone.is_primary)) {
      normalizedPhoneNumbers[0].is_primary = true;
    }
    let sawPrimary = false;
    for (const phone of normalizedPhoneNumbers) {
      if (phone.is_primary && !sawPrimary) {
        sawPrimary = true;
        continue;
      }
      phone.is_primary = false;
    }

    const summaryPayload = {
      role_description: about.trim() || null,
      relevance: relevance.trim() || null,
      personal_background: personalBackground.trim() || null,
    };
    const hasSummaryValue = Object.values(summaryPayload).some((value) => value !== null);

    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/leads/${leadId}/contacts/${contact.id}`, {
        first_name: trimmedFirstName,
        last_name: lastName.trim() || null,
        title: title.trim() || null,
        email: trimmedEmail || null,
        phone_numbers: normalizedPhoneNumbers,
        linkedin_url: linkedinUrl.trim() || null,
        facebook_url: facebookUrl.trim() || null,
        instagram_url: instagramUrl.trim() || null,
        photo_url: photoUrl.trim() || null,
        summary: hasSummaryValue ? summaryPayload : null,
        experiences: normalizedExperiences,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })
        .response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to save contact details');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-900/35 p-4 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            {contact.photo_url ? (
              <img src={contact.photo_url} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 ${avatarColor(contact.id)}`}>
                {contactInitials(contact)}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-zinc-900 truncate">
                Edit {[contact.first_name, contact.last_name].filter(Boolean).join(' ')}
              </h3>
              <p className="text-[11px] text-amber-600 mt-0.5">Enrichment may overwrite manual edits</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50"
            aria-label="Close"
          >
            <XMarkIcon className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid gap-3 grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-400">First Name *</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} placeholder="First name" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-400">Last Name</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} placeholder="Last name" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-400">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Job title" />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-400">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="name@company.com" />
          </div>

          <div className="rounded-md border border-zinc-200 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="block text-[11px] font-medium text-zinc-400">Phone Numbers</label>
              <button
                type="button"
                onClick={addPhoneNumber}
                className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-800"
              >
                Add phone
              </button>
            </div>
            {phoneNumbers.length === 0 ? (
              <p className="text-xs text-zinc-400">No phone numbers saved for this contact.</p>
            ) : (
              <div className="space-y-3">
                {phoneNumbers.map((phone) => (
                  <div key={phone.id} className="grid gap-2 sm:grid-cols-[1.6fr_0.9fr_auto_auto]">
                    <input
                      type="text"
                      value={phone.number}
                      onChange={(e) => updatePhoneNumber(phone.id, 'number', e.target.value)}
                      className={inputCls}
                      placeholder="+1 (555) 123-4567"
                    />
                    <select
                      value={phone.type}
                      onChange={(e) => updatePhoneNumber(phone.id, 'type', e.target.value)}
                      className={inputCls}
                    >
                      {PHONE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setPrimaryPhone(phone.id)}
                      className={`rounded-md border px-3 py-2 text-xs font-medium transition ${phone.is_primary ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'}`}
                    >
                      {phone.is_primary ? 'Primary' : 'Set primary'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removePhoneNumber(phone.id)}
                      className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-700"
                      aria-label="Remove phone number"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border border-zinc-100">
            <DisclosureHeader
              label="Social Links"
              open={showLinks}
              onToggle={() => setShowLinks((v) => !v)}
            />
            {showLinks && (
              <div className="space-y-3 px-3 pb-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-zinc-400">LinkedIn</label>
                  <input type="url" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} className={inputCls} placeholder="https://linkedin.com/in/..." />
                </div>
                <div className="grid gap-3 grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-zinc-400">Facebook</label>
                    <input type="url" value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} className={inputCls} placeholder="https://facebook.com/..." />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-zinc-400">Instagram</label>
                    <input type="url" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} className={inputCls} placeholder="https://instagram.com/..." />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-zinc-400">Photo URL</label>
                  <input type="url" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} className={inputCls} placeholder="https://..." />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md border border-zinc-100">
            <DisclosureHeader label="Summary" open={showSummary} onToggle={() => setShowSummary((v) => !v)} />
            {showSummary && (
              <div className="space-y-3 px-3 pb-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-zinc-400">About</label>
                  <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={3} className={inputCls} placeholder="Role description" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-zinc-400">Why They Matter</label>
                  <textarea value={relevance} onChange={(e) => setRelevance(e.target.value)} rows={3} className={inputCls} placeholder="Relevance to this lead" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-zinc-400">Personal Background</label>
                  <textarea value={personalBackground} onChange={(e) => setPersonalBackground(e.target.value)} rows={3} className={inputCls} placeholder="Personal context" />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md border border-zinc-100">
            <DisclosureHeader label="Experience" open={showExperiences} onToggle={() => setShowExperiences((v) => !v)} count={experiences.length} />
            {showExperiences && (
              <div className="px-3 pb-3 space-y-2">
                {experiences.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-1">No experiences yet.</p>
                ) : (
                  experiences.map((exp) => (
                    <div key={exp.id} className="rounded-md border border-zinc-200 bg-zinc-50/70 p-2.5 space-y-2">
                      <div className="flex gap-2">
                        <input type="text" value={exp.company} onChange={(e) => updateExperience(exp.id, 'company', e.target.value)} className={inputCls} placeholder="Company *" />
                        <button
                          type="button"
                          onClick={() => removeExperience(exp.id)}
                          className="h-[34px] w-8 flex-shrink-0 rounded-md text-zinc-400 transition hover:bg-red-50 hover:text-red-500"
                          aria-label="Remove"
                        >
                          <TrashIcon className="mx-auto h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input type="text" value={exp.title} onChange={(e) => updateExperience(exp.id, 'title', e.target.value)} className={inputCls} placeholder="Title" />
                      <div className="grid gap-2 grid-cols-2">
                        <input type="text" value={exp.start_date} onChange={(e) => updateExperience(exp.id, 'start_date', e.target.value)} className={inputCls} placeholder="Start" />
                        <input type="text" value={exp.end_date} onChange={(e) => updateExperience(exp.id, 'end_date', e.target.value)} className={inputCls} placeholder="End" />
                      </div>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={addExperience}
                  className="w-full rounded-md border border-dashed border-zinc-200 py-1.5 text-xs font-medium text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700"
                >
                  + Add experience
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-zinc-100 px-5 py-3 space-y-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !firstName.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : null}
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactListItem({
  contact,
  onEdit,
  onEmail,
  onCall,
}: {
  contact: LeadContact;
  onEdit: (contact: LeadContact) => void;
  onEmail: (contact: LeadContact) => void;
  onCall: (contact: LeadContact, phoneId?: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [animHeight, setAnimHeight] = useState<number | undefined>(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
  const experiences = contact.experiences ?? [];
  const hasSummary = contact.summary?.role_description || contact.summary?.relevance;
  const phoneNumbers = getDisplayPhoneNumbers(contact);
  const primaryPhone = getPrimaryPhone(contact);

  useLayoutEffect(() => {
    if (!contentRef.current) return;
    if (expanded) {
      setAnimHeight(contentRef.current.scrollHeight);
      const timer = setTimeout(() => setAnimHeight(undefined), 200);
      return () => clearTimeout(timer);
    } else {
      setAnimHeight(contentRef.current.scrollHeight);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimHeight(0));
      });
    }
  }, [expanded]);

  return (
    <div className="border-b border-zinc-100 last:border-b-0">
      <div className="group flex items-center gap-4 w-full px-5 py-4 hover:bg-zinc-50/60 transition">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-4 flex-1 min-w-0 text-left"
        >
          {contact.photo_url ? (
            <img
              src={contact.photo_url}
              alt={fullName}
              className="h-10 w-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 ${avatarColor(contact.id)}`}
            >
              {contactInitials(contact)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-zinc-900 truncate">{fullName}</span>
              {contact.title && (
                <span className="text-xs text-zinc-400 truncate hidden sm:inline">{contact.title}</span>
              )}
            </div>
            {contact.title && (
              <p className="text-xs text-zinc-400 truncate sm:hidden mt-0.5">{contact.title}</p>
            )}
          </div>
        </button>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(contact); }}
            className="rounded p-1 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-200 hover:text-zinc-600"
            title="Edit contact"
          >
            <PencilSquareIcon className="h-3.5 w-3.5" />
          </button>
          {contact.email && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEmail(contact);
              }}
              className="rounded p-1 text-zinc-300 transition hover:bg-zinc-200 hover:text-zinc-600"
              title={`Email ${fullName || contact.email}`}
              aria-label={`Email ${fullName || contact.email}`}
            >
              <EnvelopeIcon className="h-3.5 w-3.5" />
            </button>
          )}
          {primaryPhone && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCall(contact, primaryPhone.id);
              }}
              className="rounded p-1 text-zinc-300 transition hover:bg-zinc-200 hover:text-zinc-600"
              title={`Call ${fullName || 'contact'}`}
              aria-label={`Call ${fullName || 'contact'}`}
            >
              <PhoneIcon className="h-3.5 w-3.5" />
            </button>
          )}
          {contact.linkedin_url && (
            <a
              href={contact.linkedin_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1 text-zinc-300 transition hover:bg-zinc-200 hover:text-zinc-600"
              title={`Open ${fullName || 'contact'} LinkedIn`}
              aria-label={`Open ${fullName || 'contact'} LinkedIn`}
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          )}
          {contact.facebook_url && (
            <a
              href={contact.facebook_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1 text-zinc-300 transition hover:bg-zinc-200 hover:text-zinc-600"
              title={`Open ${fullName || 'contact'} Facebook`}
              aria-label={`Open ${fullName || 'contact'} Facebook`}
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
          )}
          {contact.instagram_url && (
            <a
              href={contact.instagram_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1 text-zinc-300 transition hover:bg-zinc-200 hover:text-zinc-600"
              title={`Open ${fullName || 'contact'} Instagram`}
              aria-label={`Open ${fullName || 'contact'} Instagram`}
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </a>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded p-0.5"
          >
            <ChevronDownIcon
              className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      <div
        ref={contentRef}
        className="overflow-hidden transition-[height] duration-200 ease-in-out"
        style={{ height: animHeight === undefined ? 'auto' : animHeight }}
      >
        <div className="px-5 pb-5 pl-6 space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                onClick={(e) => {
                  e.preventDefault();
                  onEmail(contact);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-900 transition"
              >
                <EnvelopeIcon className="h-3.5 w-3.5 text-zinc-400" />
                {contact.email}
              </a>
            )}
            {phoneNumbers.map((phone) => (
              <a
                key={phone.id}
                href={`tel:${phone.number}`}
                onClick={(e) => {
                  e.preventDefault();
                  onCall(contact, phone.id);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-900 transition"
              >
                <PhoneIcon className="h-3.5 w-3.5 text-zinc-400" />
                {formatPhone(phone.number) ?? phone.number}
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  {phoneTypeLabel(phone.type)}
                </span>
              </a>
            ))}
            {contact.linkedin_url && (
              <a
                href={contact.linkedin_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-blue-600 transition"
              >
                <svg className="h-3.5 w-3.5 text-zinc-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                LinkedIn
              </a>
            )}
            {contact.facebook_url && (
              <a
                href={contact.facebook_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-blue-600 transition"
              >
                <svg className="h-3.5 w-3.5 text-zinc-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                Facebook
              </a>
            )}
            {contact.instagram_url && (
              <a
                href={contact.instagram_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-pink-600 transition"
              >
                <svg className="h-3.5 w-3.5 text-zinc-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
                Instagram
              </a>
            )}
          </div>

          {hasSummary && contact.summary?.role_description && (
            <div>
              <SectionLabel>About</SectionLabel>
              <p className="text-xs text-zinc-600 leading-relaxed">
                {contact.summary.role_description}
              </p>
            </div>
          )}

          {contact.summary?.relevance && (
            <div>
              <SectionLabel>Why They Matter</SectionLabel>
              <p className="text-xs text-zinc-500 leading-relaxed">
                {contact.summary.relevance}
              </p>
            </div>
          )}

          {contact.summary?.personal_background && (
            <div>
              <SectionLabel>Personal Background</SectionLabel>
              <p className="text-xs text-zinc-500 leading-relaxed">
                {contact.summary.personal_background}
              </p>
            </div>
          )}

          {experiences.length > 0 && (
            <div>
              <SectionLabel>Experience ({experiences.length})</SectionLabel>
              <ul className="mt-1.5 space-y-2">
                {experiences.map((exp) => (
                  <li key={exp.id} className="text-xs">
                    <div className="font-medium text-zinc-700">{exp.title || 'Unknown role'}</div>
                    <div className="text-zinc-500">
                      {exp.company}
                      {(exp.start_date || exp.end_date) && (
                        <span className="text-zinc-400">
                          {' '}&middot; {exp.start_date ?? '?'} &ndash; {exp.end_date ?? 'present'}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Strategic context block                                                   */
/* -------------------------------------------------------------------------- */

function SourceLinks({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;

  function displayHost(url: string): string {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      return host.length > 30 ? host.slice(0, 28) + '...' : host;
    } catch {
      return url;
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {urls.map((url) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition"
        >
          <LinkIcon className="h-3 w-3 flex-shrink-0" />
          {displayHost(url)}
        </a>
      ))}
    </div>
  );
}

function StrategicContextBlock({
  label,
  text,
  sources,
}: {
  label: string;
  text: string;
  sources: string[] | null;
}) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 px-4 py-3">
      <SectionLabel>{label}</SectionLabel>
      <p className="text-sm text-zinc-700 leading-relaxed mt-1">{text}</p>
      {sources && sources.length > 0 && <SourceLinks urls={sources} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Enrichment section wrapper                                                */
/* -------------------------------------------------------------------------- */

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
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

function EnrichSection({
  title,
  titleExtra,
  enrich,
  children,
}: {
  title: string;
  titleExtra?: React.ReactNode;
  enrich: ReturnType<typeof useSSEEnrich>;
  children: React.ReactNode;
}) {
  const progressVisible = useAutoHide(enrich.running);
  const show = progressVisible && enrich.steps.length > 0;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-center border-b border-zinc-100 px-5 py-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {title}
          {titleExtra}
        </h2>
      </div>

      <div className="p-5">
        <div
          className={`overflow-hidden transition-all duration-500 ease-in-out ${show ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0'
            }`}
        >
          <div className="mb-4 rounded-md border border-zinc-100 bg-zinc-50 p-3">
            <EnrichProgress steps={enrich.steps} />
            {enrich.result && (
              <p className="mt-2 text-xs font-medium text-zinc-600 border-t border-zinc-200 pt-2">
                {enrich.result}
              </p>
            )}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Email compose modal                                                       */
/* -------------------------------------------------------------------------- */

interface ReplyContext {
  threadId: string;
  inReplyToMessageId: string;
  toEmail: string;
  subject: string;
  contactId?: number | null;
  originalMessage?: {
    body: string;
    date: string;
    from: string;
  };
}

function EmailComposeModal({
  leadId,
  contacts,
  onClose,
  onSent,
  replyContext,
  initialContactId,
}: {
  leadId: number;
  contacts: LeadContact[];
  onClose: () => void;
  onSent: () => void;
  replyContext?: ReplyContext | null;
  initialContactId?: number | null;
}) {
  const isReply = !!replyContext;
  const contactsWithEmail = contacts.filter((c) => c.email);

  const preselectedContactId = replyContext?.contactId != null
    ? replyContext.contactId
    : initialContactId != null
      ? initialContactId
    : contactsWithEmail.length === 1
      ? contactsWithEmail[0].id
      : null;

  const initialUseCustom = isReply && replyContext.contactId == null;
  const initialCustomEmail = isReply ? replyContext.toEmail : '';
  const initialSubject = isReply
    ? (replyContext.subject.toLowerCase().startsWith('re:')
      ? replyContext.subject
      : `Re: ${replyContext.subject}`)
    : '';

  const [contactId, setContactId] = useState<number | null>(preselectedContactId);
  const [useCustomEmail, setUseCustomEmail] = useState(initialUseCustom);
  const [customEmail, setCustomEmail] = useState(initialCustomEmail);
  const [contactOpen, setContactOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);
  const [subject, setSubject] = useState(initialSubject);
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onEsc); };
  }, [sending, onClose]);

  useEffect(() => {
    if (replyContext?.contactId != null) {
      setContactId(replyContext.contactId);
      setUseCustomEmail(false);
      setCustomEmail('');
      return;
    }

    if (initialContactId != null) {
      setContactId(initialContactId);
      setUseCustomEmail(false);
      setCustomEmail('');
    }
  }, [replyContext, initialContactId]);

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
      if (replyContext) {
        payload.thread_id = replyContext.threadId;
        payload.in_reply_to_message_id = replyContext.inReplyToMessageId;
      }
      await api.post(`/api/leads/${leadId}/emails/send`, payload);
      onSent();
      onClose();
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
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-900/35 p-4 backdrop-blur-[1px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
    >
      <div
        className="flex w-full max-w-2xl max-h-[85vh] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-zinc-900">{isReply ? 'Reply' : 'Send Email'}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* ── Gmail connection banner ── */}
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

          {/* ── To field ── */}
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
                        <span className="text-zinc-400 ml-1">&lt;{selectedContact.email}&gt;</span>
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
                            <span className="text-zinc-400 ml-1">&lt;{c.email}&gt;</span>
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

          {/* ── Subject ── */}
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

          {/* ── Body ── */}
          <div className="flex-1 flex flex-col min-h-0">
            <label className="block text-xs font-medium text-zinc-500 mb-1">Body</label>
            <div className="flex-1 flex flex-col rounded-md border border-zinc-300 bg-white overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                rows={isReply ? 4 : 10}
                placeholder="Write your message..."
                className="w-full shrink-0 resize-none border-0 bg-transparent px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:ring-0 min-h-[100px]"
              />
              {isReply && replyContext?.originalMessage && (
                <div className="flex-1 overflow-y-auto px-3 pb-3">
                  <div className="border-l-2 border-zinc-200 pl-3 pt-1 text-sm text-zinc-500">
                    <p className="mb-2 text-xs text-zinc-400">
                      On {new Date(replyContext.originalMessage.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} &lt;{replyContext.originalMessage.from}&gt; wrote:
                    </p>
                    <div className="whitespace-pre-line break-words text-[13px] opacity-80">
                      {replyContext.originalMessage.body}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-600">
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="flex shrink-0 items-center gap-2 border-t border-zinc-100 bg-zinc-50/50 px-5 py-3">
          <button
            type="button"
            disabled={!gmailConnected || !hasValidRecipient || !subject.trim() || !body.trim() || sending}
            onClick={handleSend}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {sending ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : <PaperAirplaneIcon className="h-3.5 w-3.5" />}
            {sending ? 'Sending...' : isReply ? 'Send Reply' : 'Send Email'}
          </button>
          <button
            type="button"
            onClick={onClose}
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
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Lead detail page                                                          */
/* -------------------------------------------------------------------------- */

interface LeadDetailPaneProps {
  leadId: number;
  embedded?: boolean;
  className?: string;
}

function LeadDetailContent({ leadId, embedded = false }: LeadDetailPaneProps) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [data, setData] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildChatBody = useCallback(
    ({ messages }: { messages: ChatMessage[] }) => ({ messages }),
    [],
  );
  const chat = useChat({ endpoint: `/api/leads/${leadId}/chat`, buildBody: buildChatBody });

  const fetchLead = useCallback(() => {
    api
      .get(`/api/leads/${leadId}`)
      .then((res) => setData(res.data))
      .catch((err) => {
        setError(err.response?.status === 404 ? 'Lead not found' : 'Failed to load lead');
      });
  }, [leadId]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  const contactEnrich = useSSEEnrich({
    endpoint: `/api/leads/${leadId}/enrich-contacts`,
    formatDone: useCallback((event: Record<string, unknown>) => {
      const n = event.contact_count as number;
      return `Found ${n} contact${n !== 1 ? 's' : ''}`;
    }, []),
    onFinally: fetchLead,
  });

  const contextEnrich = useSSEEnrich({
    endpoint: `/api/leads/${leadId}/enrich-strategic-context`,
    formatDone: useCallback(
      (event: Record<string, unknown>) => `Filled ${event.fields_filled} of 4 categories`,
      [],
    ),
    onFinally: fetchLead,
  });

  const backgroundEnrich = useSSEEnrich({
    endpoint: `/api/leads/${leadId}/enrich-company-background`,
    formatDone: useCallback(() => 'Background generated', []),
    onFinally: fetchLead,
  });

  const profileEnrich = useSSEEnrich({
    endpoint: `/api/leads/${leadId}/enrich-profile`,
    formatDone: useCallback(
      (event: Record<string, unknown>) => `Updated ${event.fields_updated} field${event.fields_updated !== 1 ? 's' : ''}`,
      [],
    ),
    onFinally: fetchLead,
  });

  const anyEnriching = profileEnrich.running || backgroundEnrich.running || contextEnrich.running || contactEnrich.running;

  const backgroundProgressVisible = useAutoHide(backgroundEnrich.running);
  const contextProgressVisible = useAutoHide(contextEnrich.running);

  const enrichAll = useCallback(() => {
    if (anyEnriching) return;
    profileEnrich.start();
    backgroundEnrich.start();
    contextEnrich.start();
    contactEnrich.start();
  }, [anyEnriching, profileEnrich, backgroundEnrich, contextEnrich, contactEnrich]);

  const [showCompose, setShowCompose] = useState(false);
  const [replyContext, setReplyContext] = useState<ReplyContext | null>(null);
  const [editingContact, setEditingContact] = useState<LeadContact | null>(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const emailRequestIdRef = useRef(0);
  const [prefillEmailRequest, setPrefillEmailRequest] = useState<{ requestId: number; contactId: number | null } | null>(null);
  const callRequestIdRef = useRef(0);
  const [prefillCallRequest, setPrefillCallRequest] = useState<{ requestId: number; contactId: number | null; phoneId: number | null } | null>(null);

  const handleReply = useCallback((email: LeadEmail) => {
    const replyAddr = email.direction === 'received' ? email.from_email : email.to_email;
    setReplyContext({
      threadId: email.gmail_thread_id ?? '',
      inReplyToMessageId: email.gmail_message_id,
      toEmail: replyAddr,
      subject: email.subject,
      contactId: email.contact_id,
      originalMessage: {
        body: email.body_plain ?? '',
        date: email.occurred_at,
        from: email.from_email,
      },
    });
    setShowCompose(true);
  }, []);

  const handleEmailContact = useCallback((contact: LeadContact) => {
    if (!contact.email) return;
    emailRequestIdRef.current += 1;
    setPrefillEmailRequest({
      requestId: emailRequestIdRef.current,
      contactId: contact.id,
    });
  }, []);

  const handleCallContact = useCallback((contact: LeadContact, phoneId?: number | null) => {
    const primaryPhone = getPrimaryPhone(contact);
    if (!primaryPhone) return;
    callRequestIdRef.current += 1;
    setPrefillCallRequest({
      requestId: callRequestIdRef.current,
      contactId: contact.id,
      phoneId: phoneId ?? primaryPhone.id ?? null,
    });
  }, []);

  useEffect(() => {
    if (!data) return;
    api.post(`/api/leads/${data.id}/emails/sync`).then((res) => {
      if (res.data?.synced > 0) setActivityRefreshKey((k) => k + 1);
    }).catch(() => { }).then(() => {
      api.post(`/api/leads/${data.id}/emails/mark-all-read`).catch(() => { });
    });
  }, [data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [insightsTab, setInsightsTab] = useState<'background' | 'context' | 'chat'>('background');
  const [visibleInsightsTab, setVisibleInsightsTab] = useState<'background' | 'context' | 'chat'>('background');
  const [tabFadingOut, setTabFadingOut] = useState(false);

  useEffect(() => {
    if (insightsTab === visibleInsightsTab) return;
    setTabFadingOut(true);
    const timer = setTimeout(() => {
      setVisibleInsightsTab(insightsTab);
      setTabFadingOut(false);
    }, 140);
    return () => clearTimeout(timer);
  }, [insightsTab, visibleInsightsTab]);

  if (error) {
    if (embedded) {
      return (
        <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-zinc-200 bg-white p-8 2xl:h-full">
          <p className="text-sm text-zinc-500">{error}</p>
        </div>
      );
    }

    return (
      <div>
        <button
          type="button"
          onClick={() => navigate('/leads')}
          className="mb-4 text-sm font-medium text-zinc-500 transition hover:text-zinc-700"
        >
          &larr; Back to Leads
        </button>
        <p className="text-sm text-zinc-500">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={embedded ? 'flex min-h-[420px] items-center justify-center rounded-lg border border-zinc-200 bg-white p-8 2xl:h-full' : undefined}>
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  const bdrName = userDisplayName(data.user);
  const contacts = data.contacts ?? [];
  const triggerEvents = data.trigger_events ?? [];
  const hasStrategicContext = !!(
    data.recent_initiatives ||
    data.public_priorities ||
    data.operational_changes ||
    data.workflow_modernization_signals ||
    triggerEvents.length > 0
  );
  const visibleInsightsEnrich =
    visibleInsightsTab === 'background'
      ? backgroundEnrich
      : visibleInsightsTab === 'context'
        ? contextEnrich
        : null;
  const visibleInsightsProgressVisible =
    visibleInsightsTab === 'background'
      ? backgroundProgressVisible
      : visibleInsightsTab === 'context'
        ? contextProgressVisible
        : false;
  const showInsightsProgress =
    visibleInsightsProgressVisible &&
    !!visibleInsightsEnrich &&
    visibleInsightsEnrich.steps.length > 0;
  const rootClassName = embedded
    ? 'space-y-6 md:grid md:h-full md:min-h-0 md:grid-cols-[minmax(0,1fr)_minmax(200px,27%)] md:gap-6 md:space-y-0'
    : 'flex gap-6 items-start';
  const contentClassName = embedded
    ? 'min-w-0 space-y-6 rounded-lg border border-zinc-200 bg-white p-4 md:p-5 md:min-h-0 md:overflow-y-auto no-scrollbar'
    : 'min-w-0 flex-1 space-y-6';
  const activityClassName = embedded
    ? 'h-[420px] md:h-full'
    : undefined;

  return (
    <div className={rootClassName}>
      <div className={contentClassName}>
        <div>
          {!embedded && (
            <button
              type="button"
              onClick={() => navigate('/leads')}
              className="mb-4 text-sm font-medium text-zinc-500 transition hover:text-zinc-700"
            >
              &larr; Back to Leads
            </button>
          )}

          <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-zinc-200 pb-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-semibold text-zinc-900">{data.company}</h1>
              </div>
              <div className="flex items-center gap-x-2 text-sm text-zinc-500 mt-1">
                {data.primary_industry && <span>{data.primary_industry}</span>}
                {isAdmin && data.type && (
                  <>
                    <span className="text-zinc-300">&middot;</span>
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                      {data.type}
                    </span>
                  </>
                )}
                {bdrName && (
                  <>
                    <span className="text-zinc-300">&middot;</span>
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={bdrBadgeStyle(data.user?.color)}
                    >
                      {bdrName}
                    </span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={enrichAll}
              disabled={anyEnriching}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {anyEnriching ? (
                <SpinnerIcon className="h-4 w-4 animate-spin" />
              ) : (
                <SparklesIcon className="h-4 w-4" />
              )}
              {anyEnriching ? 'Enriching...' : 'Enrich All'}
            </button>
          </div>
        </div>

        <EnrichSection
          title="Company Profile"
          enrich={profileEnrich}
        >
          <DetailFields
            bare
            fixedThreeColumns
            fields={[
              { label: 'Domain', value: data.domain },
              { label: 'HQ Address', value: data.hq_address },
              { label: 'HQ Phone', value: formatPhone(data.hq_phone) },
              { label: 'HQ Time Zone', value: formatTimezone(data.hq_timezone) },
              { label: 'Employees', value: data.employee_count?.toLocaleString() ?? null },
              { label: 'ERP', value: data.erp },
              { label: 'ERP Users', value: data.num_erp_users },
              { label: 'Locations', value: data.num_locations },
              { label: 'Revenue', value: formatRevenue(data.revenue_m) },
              { label: 'Primary Industry', value: data.primary_industry },
              { label: 'Company Type', value: data.company_type },
              { label: 'Buying Groups', value: data.buying_groups?.join(', ') ?? null },
              { label: 'Associations', value: data.associations },
            ]}
          />
        </EnrichSection>

        <section className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Company Intelligence
            </h2>
            <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
              <button
                type="button"
                onClick={() => setInsightsTab('background')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${insightsTab === 'background'
                    ? 'bg-white text-zinc-700 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                  }`}
              >
                Background
              </button>
              <button
                type="button"
                onClick={() => setInsightsTab('context')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${insightsTab === 'context'
                    ? 'bg-white text-zinc-700 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                  }`}
              >
                Strategic Context
              </button>
              <button
                type="button"
                onClick={() => setInsightsTab('chat')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${insightsTab === 'chat'
                    ? 'bg-white text-zinc-700 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                  }`}
              >
                Chat
              </button>
            </div>
            {insightsTab === 'chat' && chat.messages.length > 0 && !chat.streaming && (
              <div className="ml-auto">
                <button
                  type="button"
                  onClick={chat.clear}
                  className="text-xs text-zinc-400 transition hover:text-zinc-600"
                >
                  Clear chat
                </button>
              </div>
            )}
          </div>

          <div className="p-5">
            <div className={`transition-all duration-150 ease-out ${tabFadingOut ? 'translate-y-1 opacity-0' : 'translate-y-0 opacity-100'}`}>
              <div
                className={`overflow-hidden transition-all duration-500 ease-in-out ${showInsightsProgress ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0'
                  }`}
              >
                {visibleInsightsEnrich && visibleInsightsEnrich.steps.length > 0 && (
                  <div className="mb-4 rounded-md border border-zinc-100 bg-zinc-50 p-3">
                    <EnrichProgress steps={visibleInsightsEnrich.steps} />
                    {visibleInsightsEnrich.result && (
                      <p className="mt-2 text-xs font-medium text-zinc-600 border-t border-zinc-200 pt-2">
                        {visibleInsightsEnrich.result}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {visibleInsightsTab === 'background' ? (
                !data.company_background && !backgroundEnrich.running && backgroundEnrich.steps.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-zinc-400">No company background yet.</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      Click &ldquo;Enrich All&rdquo; to research {data.company}.
                    </p>
                  </div>
                ) : data.company_background ? (
                  <div className="prose prose-sm prose-zinc max-w-none text-xs leading-relaxed">
                    <MarkdownContent content={data.company_background} />
                  </div>
                ) : null
              ) : visibleInsightsTab === 'context' ? (
                !hasStrategicContext && !contextEnrich.running && contextEnrich.steps.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-zinc-400">No strategic context yet.</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      Click &ldquo;Enrich All&rdquo; to research strategic intelligence for {data.company}.
                    </p>
                  </div>
                ) : hasStrategicContext ? (
                  <div className="space-y-3">
                    {data.recent_initiatives && (
                      <StrategicContextBlock
                        label="Recent Initiatives"
                        text={data.recent_initiatives}
                        sources={data.recent_initiatives_sources}
                      />
                    )}
                    {data.public_priorities && (
                      <StrategicContextBlock
                        label="Public Priorities"
                        text={data.public_priorities}
                        sources={data.public_priorities_sources}
                      />
                    )}
                    {data.operational_changes && (
                      <StrategicContextBlock
                        label="Operational Changes"
                        text={data.operational_changes}
                        sources={data.operational_changes_sources}
                      />
                    )}
                    {data.workflow_modernization_signals && (
                      <StrategicContextBlock
                        label="Workflow Modernization Signals"
                        text={data.workflow_modernization_signals}
                        sources={data.workflow_modernization_signals_sources}
                      />
                    )}
                    {triggerEvents.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">
                          Trigger Events
                        </div>
                        <div className="space-y-3">
                          {triggerEvents.map((evt, i) => (
                            <div key={i} className="relative pl-3.5 border-l-2 border-zinc-200">
                              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
                                {evt.category}
                              </span>
                              <p className="text-sm text-zinc-700 leading-relaxed">{evt.description}</p>
                              {evt.source && (
                                <a
                                  href={evt.source}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 transition"
                                >
                                  <LinkIcon className="h-3 w-3 flex-shrink-0" />
                                  Source
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null
              ) : (
                <ChatPanel
                  chat={chat}
                  placeholder="Ask about this lead..."
                  emptyTitle={`Ask anything about ${data.company}`}
                  emptyHint='e.g. "What do we know about this company?" or "Help me prepare for outreach"'
                />
              )}
            </div>
          </div>
        </section>

        <EnrichSection
          title="Key Contacts"
          titleExtra={
            contacts.length > 0 && !contactEnrich.running ? (
              <span className="text-zinc-300 font-normal normal-case tracking-normal">
                ({contacts.length})
              </span>
            ) : undefined
          }
          enrich={contactEnrich}
        >
          {contacts.length === 0 && !contactEnrich.running && contactEnrich.steps.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-zinc-400">No contacts found yet.</p>
              <p className="text-xs text-zinc-400 mt-1">
                Click &ldquo;Enrich All&rdquo; to discover key stakeholders at {data.company}.
              </p>
            </div>
          ) : contacts.length > 0 ? (
            <div className="rounded-lg border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
              {contacts.map((contact) => (
                <ContactListItem
                  key={contact.id}
                  contact={contact}
                  onEdit={setEditingContact}
                  onEmail={handleEmailContact}
                  onCall={handleCallContact}
                />
              ))}
            </div>
          ) : null}
        </EnrichSection>
      </div>

      <div className={embedded ? 'min-h-0' : 'ml-auto hidden xl:block w-[30%] flex-shrink-0 sticky top-0'}>
        <ActivityLog
          leadId={data.id}
          contacts={contacts}
          refreshKey={activityRefreshKey}
          onReply={handleReply}
          className={activityClassName}
          prefillCallRequest={prefillCallRequest}
          prefillEmailRequest={prefillEmailRequest}
        />
      </div>

      {showCompose && (
        <EmailComposeModal
          leadId={data.id}
          contacts={contacts}
          onClose={() => { setShowCompose(false); setReplyContext(null); }}
          onSent={() => setActivityRefreshKey((k) => k + 1)}
          replyContext={replyContext}
        />
      )}

      {editingContact && (
        <ContactEditModal
          leadId={data.id}
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          onSaved={fetchLead}
        />
      )}
    </div>
  );
}

export function LeadDetailPane({ leadId, embedded = false, className }: LeadDetailPaneProps) {
  const [displayLeadId, setDisplayLeadId] = useState(leadId);
  const [transitionState, setTransitionState] = useState<'idle' | 'fading-out' | 'fading-in'>('idle');

  useEffect(() => {
    if (leadId === displayLeadId) return;

    setTransitionState('fading-out');
    const timer = window.setTimeout(() => {
      setDisplayLeadId(leadId);
      setTransitionState('fading-in');
    }, 140);

    return () => window.clearTimeout(timer);
  }, [leadId, displayLeadId]);

  useEffect(() => {
    if (transitionState !== 'fading-in') return;

    const timer = window.setTimeout(() => {
      setTransitionState('idle');
    }, 180);

    return () => window.clearTimeout(timer);
  }, [transitionState, displayLeadId]);

  const transitionClassName =
    transitionState === 'fading-out'
      ? 'opacity-0 translate-y-2'
      : 'opacity-100 translate-y-0';

  return (
    <div
      className={[
        className ?? '',
        embedded ? 'transition-all duration-200 ease-out md:h-full md:min-h-0 md:overflow-hidden' : 'h-full min-h-0 transition-all duration-200 ease-out',
        transitionClassName,
      ].join(' ').trim()}
    >
      <LeadDetailContent key={displayLeadId} leadId={displayLeadId} embedded={embedded} />
    </div>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams();
  const leadId = Number(id);

  if (!id || Number.isNaN(leadId)) {
    return <p className="text-sm text-zinc-500">Lead not found.</p>;
  }

  return <LeadDetailPane leadId={leadId} />;
}
