const INTERNAL_COMPANIES = [
  { domain: 'endeavorai.com', names: ['endeavorai', 'endeavor ai'] },
  { domain: 'iconiqcapital.com', names: ['iconiqcapital', 'iconiq capital'] },
  { domain: 'swingsearch.com', names: ['swingsearch', 'swing search'] },
  { domain: 'pickworthgtm.com', names: ['pickworthgtm', 'pickworth gtm'] },
];

const INTERNAL_NAMES = new Set(INTERNAL_COMPANIES.flatMap((c) => c.names));

export function isInternalCompany(name: string): boolean {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');

  if (INTERNAL_NAMES.has(normalized)) return true;

  return INTERNAL_COMPANIES.some(
    ({ domain }) => normalized === domain || normalized.endsWith(`.${domain}`),
  );
}

export function isCustomerMeeting(meeting: { company_names: string[] }): boolean {
  return meeting.company_names.some((n) => {
    const trimmed = n.trim();
    return trimmed.length > 0 && !isInternalCompany(trimmed);
  });
}
