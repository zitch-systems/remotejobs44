// Pure, client-safe helpers + types for the Deep Ocean landing.
//
// This module must NOT import anything server-only (no @/lib/supabase/server,
// no next/headers). The client island `Listings.tsx` imports from here, so any
// server-only transitive import would pull `next/headers` into the browser
// bundle and break the build. Server-side data fetching lives in ./data.
import { formatSalary, formatRelativeDate } from '@/lib/utils';

// Minimal, paywall-safe shape passed to all landing sections.
export interface LandingJob {
  id: string;
  title: string;
  company: string;
  logo: string;        // monogram (first letter)
  category: string;
  type: string;        // e.g. "full-time"
  location: string;
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  posted: string;      // ISO
  featured: boolean;
}

// Pay label: only when a real range exists (salary is ~0% populated and
// formatSalary already hides non-USD). Falls back to job type, never an
// invented number.
export function payLabel(job: LandingJob): string {
  const s = formatSalary(job.salaryMin, job.salaryMax, job.currency);
  if (s) return s;
  return job.type
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');
}

// Compact pay used in the hero preview rows ("$90k+" style) — same guard.
export function payCompact(job: LandingJob): string {
  const s = formatSalary(job.salaryMin, job.salaryMax, job.currency);
  if (s) return s.split('–')[0].replace('/yr', '');
  return 'Remote';
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
