import type { LeadSourceId } from './leadSourceMeta'
import { getLeadSourceIdForIndex } from './leadSourceMeta'
import type { LeadSpendProfile } from './leadSpendProfiles'
import { getSpendProfileForCompanyUrl } from './leadSpendProfiles'
import { MILWAUKEE_COMPANY_SEED } from './milwaukeeDistributors50.seed'

export type Engagement = 'net_new' | 'engaged'

export interface DistributorRow {
  name: string
  contactName: string
  location: string
  country: string
  linkedInUrl: string
  description: string
  primaryIndustry: string
  size: string
  type: string
  sourceId: LeadSourceId
  engagement: Engagement
  /** Present for the first five seed companies: synthetic LTM + monthly history (demo). */
  spendProfile?: LeadSpendProfile
  /**
   * Demo: explicit sku / line bundle the account is pulling (exterior dealer lens),
   * when different from the prose in `description`.
   */
  productsRequested?: string
}

export type { LeadSpendProfile }

function detRand(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

/**
 * Exteriors / Russin story seeds must stay **engaged** so the “likely buyers if you stock
 * Thermory–AZEK lines” view (engaged + description needle) is never empty. Row 0 was always
 * `net_new` because detRand(0)===0, which hid our best Thermory blurbs.
 */
function engagementFromSeed(
  i: number,
  seed: (typeof MILWAUKEE_COMPANY_SEED)[0],
): Engagement {
  const combined = `${seed.description} ${seed.productsRequested ?? ''}`.toLowerCase()
  if (
    combined.includes('thermory') ||
    combined.includes('azek') ||
    combined.includes('deckorator') ||
    combined.includes('millboard')
  ) {
    return 'engaged'
  }
  return (detRand(i * 1.1) > 0.45 ? 'engaged' : 'net_new') as Engagement
}

function buildRowFromSeed(i: number, seed: (typeof MILWAUKEE_COMPANY_SEED)[0]): DistributorRow {
  const s = getLeadSourceIdForIndex(i)
  const e = engagementFromSeed(i, seed)
  const spendProfile = getSpendProfileForCompanyUrl(seed.linkedInUrl)
  return {
    name: seed.name,
    contactName: '—',
    location: seed.location,
    country: seed.country,
    linkedInUrl: seed.linkedInUrl,
    description: seed.description,
    primaryIndustry: seed.primaryIndustry,
    size: seed.size,
    type: seed.type,
    sourceId: s,
    engagement: e,
    ...(spendProfile ? { spendProfile } : {}),
    ...(seed.productsRequested != null
      ? { productsRequested: seed.productsRequested }
      : {}),
  }
}

const POOL: DistributorRow[] = MILWAUKEE_COMPANY_SEED.map((s, i) => buildRowFromSeed(i, s))

/**
 * @param set — `standard` (first 28) or `expanded` (all ~50; “491 results” is UI-only for scale)
 */
export function buildMilwaukeeDistributorRows(set: 'standard' | 'expanded' = 'standard'): DistributorRow[] {
  const n = set === 'expanded' ? POOL.length : 28
  return POOL.slice(0, n)
}

export const MILWAUKEE_LEAD_RESULT_TOTAL = 491
