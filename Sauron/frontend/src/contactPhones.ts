export interface ContactPhoneNumber {
  id: number;
  number: string;
  type: string;
  is_primary: boolean;
}

const PHONE_TYPE_LABELS: Record<string, string> = {
  mobile: 'Mobile',
  direct: 'Direct',
  office: 'Office',
  work: 'Work',
  main: 'Main',
  home: 'Home',
  other: 'Other',
  unknown: 'Unknown',
};

export const PHONE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'direct', label: 'Direct' },
  { value: 'office', label: 'Office' },
  { value: 'work', label: 'Work' },
  { value: 'main', label: 'Main' },
  { value: 'home', label: 'Home' },
  { value: 'other', label: 'Other' },
  { value: 'unknown', label: 'Unknown' },
];

export function formatPhoneNumber(phone: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  const isUsTenDigit = digits.length === 10;
  const isUsWithCountryCode = digits.length === 11 && digits.startsWith('1');

  if (isUsTenDigit || isUsWithCountryCode) {
    const local = isUsTenDigit ? digits : digits.slice(1);
    const pretty = `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
    return isUsWithCountryCode || trimmed.startsWith('+') ? `+1 ${pretty}` : pretty;
  }

  return trimmed;
}

export function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}

export function phoneTypeLabel(type: string | null | undefined): string {
  const normalized = (type ?? 'unknown').trim().toLowerCase().replace(/\s+/g, '_');
  return PHONE_TYPE_LABELS[normalized] ?? normalized.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function sortPhoneNumbers(phoneNumbers: ContactPhoneNumber[]): ContactPhoneNumber[] {
  return [...phoneNumbers].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.id - b.id;
  });
}

export function getDisplayPhoneNumbers(
  contact: { phone: string | null; phone_numbers?: ContactPhoneNumber[] | null },
): ContactPhoneNumber[] {
  const phoneNumbers = sortPhoneNumbers(contact.phone_numbers ?? []);
  if (phoneNumbers.length > 0) return phoneNumbers;
  if (!contact.phone) return [];
  return [{ id: -1, number: contact.phone, type: 'unknown', is_primary: true }];
}

export function getPrimaryPhone(
  contact: { phone: string | null; phone_numbers?: ContactPhoneNumber[] | null },
): ContactPhoneNumber | null {
  return getDisplayPhoneNumbers(contact)[0] ?? null;
}
