// Pure, client-safe helpers + types for the Deep Ocean landing.
//
// This module must NOT import anything server-only (no @/lib/supabase/server,
// no next/headers). The client island `Listings.tsx` imports from here, so any
// server-only transitive import would pull `next/headers` into the browser
// bundle and break the build. Server-side data fetching lives in ./data.
import { formatSalary, formatRelativeDate } from '@/lib/utils';
import { HIDDEN_COMPANY_LABEL, scrubCompanyIdentity } from '@/lib/jobs/company-mask';

export type LandingWorkplace = 'remote' | 'onsite' | 'hybrid' | 'unknown';

// Minimal, paywall-safe shape passed to all landing sections.
export interface LandingJob {
  id: string;
  title: string;
  company: string;
  logo: string;        // generic public fallback; never employer-derived
  category: string;
  type: string;        // e.g. "full-time"
  location: string;
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  posted: string;      // ISO
  featured: boolean;
  workplaceType: LandingWorkplace;
  relocationSupported: boolean;
}

function publicTitle(title: string, company: string): string {
  const scrubbed = scrubCompanyIdentity(title, company);
  const name = company.trim();
  if (!name || name.length >= 3) return scrubbed;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return scrubbed.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), 'the company');
}

/** Convert a trusted DB row to the anonymous homepage payload. */
export function toPublicLandingJob(j: any): LandingJob {
  const realCompany = j.company ?? '';
  const workplaceType: LandingWorkplace = ['remote', 'onsite', 'hybrid'].includes(j.workplace_type)
    ? j.workplace_type
    : j.remote === true ? 'remote' : 'unknown';
  return {
    id: j.id,
    title: publicTitle(j.title ?? 'Open role', realCompany),
    company: HIDDEN_COMPANY_LABEL,
    logo: 'RJ',
    category: j.category ?? 'other',
    type: j.type ?? 'full-time',
    location: j.location ?? 'Location not specified',
    salaryMin: j.salary_min ?? undefined,
    salaryMax: j.salary_max ?? undefined,
    currency: j.currency ?? 'USD',
    posted: j.posted_at ?? j.created_at ?? new Date().toISOString(),
    featured: j.featured ?? false,
    workplaceType,
    relocationSupported: j.relocation_supported === true,
  };
}

// Render published salary only; job type has its own badge.
export function payLabel(job: LandingJob): string | null {
  const s = formatSalary(job.salaryMin, job.salaryMax, job.currency);
  return s || null;
}

// Compact pay used in the hero preview rows ("$90k+" style) — same guard.
export function payCompact(job: LandingJob): string {
  const s = formatSalary(job.salaryMin, job.salaryMax, job.currency);
  if (s) return s.split('–')[0].replace('/yr', '');
  return workplaceLabel(job);
}

export function workplaceLabel(job: Pick<LandingJob, 'workplaceType'>): string {
  if (job.workplaceType === 'remote') return 'Remote';
  if (job.workplaceType === 'onsite') return 'On-site';
  if (job.workplaceType === 'hybrid') return 'Hybrid';
  return 'Workplace not specified';
}

export function ageLabel(job: LandingJob): string {
  return formatRelativeDate(job.posted);
}

// "2.1k" / "920" — compact count for the category tiles + filter rail.
export function compactCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10) + 'k';
  }
  return String(n);
}

// Deterministic tint per company so monograms look intentional (no CDN logos).
const LOGO_TINTS: Array<[string, string]> = [
  ['#eff6ff', '#2563eb'],
  ['#faf5ff', '#9333ea'],
  ['#fdf2f8', '#db2777'],
  ['#ecfeff', '#0891b2'],
  ['#fffbeb', '#d97706'],
  ['#fff7ed', '#ea580c'],
  ['#eef2ff', '#4f46e5'],
  ['#fff1f2', '#e11d48'],
  ['#f0fdf4', '#16a34a'],
];

export function tintFor(seed: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const [bg, fg] = LOGO_TINTS[h % LOGO_TINTS.length];
  return { bg, fg };
}
