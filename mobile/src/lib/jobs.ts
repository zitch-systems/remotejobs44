// src/lib/jobs.ts — live job data from Supabase, adapted to the mobile Job
// shape. Falls back to the handoff seed set when Supabase isn't configured
// (demo mode) or a query fails, so the UI is never empty.
//
// The `jobs` table is publicly readable (RLS: "Jobs are publicly readable"),
// so these run with the anon client. A few display-only fields the design
// uses but the DB doesn't store yet (match score, verdict, gradient) are
// DERIVED deterministically here and clearly marked — swap for a real scoring
// service when one exists.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { SEED_JOBS } from './seed';
import type { Job, JobTag } from './types';

const SAFE_COLUMNS =
  'id,title,company,logo,category,type,level,location,description,requirements,skills,salary_min,salary_max,currency,remote,featured,posted_at';

interface JobRow {
  id: string;
  title: string;
  company: string;
  logo: string | null;
  category: string | null;
  type: string | null;
  level: string | null;
  location: string | null;
  description: string | null;
  requirements: string | null;
  skills: string[] | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  remote: boolean | null;
  featured: boolean | null;
  posted_at: string | null;
}

// Deterministic company-tile gradients (RN has no CSS gradient at the data
// layer, so we pick a fixed pair per company name).
const GRADS: [string, string][] = [
  ['#0f172a', '#334155'],
  ['#0ea5e9', '#1d4ed8'],
  ['#f97316', '#ea580c'],
  ['#7c3aed', '#4f46e5'],
  ['#1ea05e', '#0f766e'],
  ['#db2777', '#9d174d'],
  ['#0891b2', '#0e7490'],
  ['#ca8a04', '#a16207'],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function gradFor(company: string): [string, string] {
  return GRADS[hash(company) % GRADS.length];
}

const CUR: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€', KES: 'KSh', ZAR: 'R', GHS: '₵' };

function money(n: number, currency: string): string {
  const sym = CUR[currency] ?? `${currency} `;
  if (n >= 1_000_000) return `${sym}${+(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}m`;
  if (n >= 1_000) return `${sym}${Math.round(n / 1_000)}k`;
  return `${sym}${n}`;
}

function salaryLabel(min: number | null, max: number | null, currency: string): string {
  const cur = currency || 'USD';
  if (max) return money(max, cur);
  if (min) return money(min, cur);
  return 'Competitive';
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'recently';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function tagsFrom(skills: string[] | null, category: string | null): JobTag[] {
  const base = (skills && skills.length ? skills : category ? [category] : []).slice(0, 3);
  return base.map((label, i) => ({ label, variant: i === 0 ? 'blue' : 'default' }));
}

function bulletsFrom(requirements: string | null, description: string | null): string[] {
  const src = (requirements || description || '').trim();
  if (!src) return ['Collaborate with a distributed team to ship meaningful work.'];
  const parts = src
    .split(/\n|•|·|;|(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.replace(/^[\s\-*•]+/, '').trim())
    .filter((s) => s.length > 12);
  return parts.slice(0, 4);
}

// Match score derived from real job signals (skill richness, salary
// transparency, recency, featured), with a small deterministic spread so
// equally-ranked jobs don't all share a number. Stable per job. This replaces
// the earlier id-hash placeholder; a server-side relevance model (profile ↔
// job) is the eventual upgrade — see mobile/README.md.
function deriveMatch(r: JobRow): number {
  let score = 76;
  score += Math.min(12, (r.skills?.length ?? 0) * 2); // up to +12 for rich skill lists
  if (r.salary_min || r.salary_max) score += 4; // salary transparency
  if (r.posted_at) {
    const days = (Date.now() - new Date(r.posted_at).getTime()) / 86_400_000;
    if (days <= 7) score += 4;
    else if (days <= 30) score += 2;
  }
  if (r.featured) score += 3;
  score += (hash(r.id) % 5) - 2; // ±2 deterministic spread
  return Math.max(70, Math.min(98, score));
}

function verdictFor(match: number): { verdict: string; vcap: string } {
  if (match >= 88) return { verdict: 'You match almost everything here', vcap: 'Your profile lines up with the core requirements.' };
  if (match >= 80) return { verdict: 'A strong fit worth a look', vcap: 'Most of your skills map to this role.' };
  return { verdict: 'A fair match', vcap: 'Some of your experience transfers to this role.' };
}

export function rowToJob(r: JobRow): Job {
  const match = deriveMatch(r);
  const { verdict, vcap } = verdictFor(match);
  const skills = r.skills ?? [];
  return {
    id: r.id,
    role: r.title,
    company: r.company,
    logo: (r.company?.[0] ?? '?').toUpperCase(),
    logoUrl: r.logo && /^https?:\/\//.test(r.logo) ? r.logo : undefined,
    grad: gradFor(r.company ?? r.id),
    match,
    category: r.category ?? 'Other',
    // The board only carries vetted sources, so we surface every role as a
    // verified employer (the design's badge). Swap for a real flag if added.
    verified: true,
    salary: salaryLabel(r.salary_min, r.salary_max, r.currency ?? 'USD'),
    per: '/yr',
    time: timeAgo(r.posted_at),
    location: r.remote ? `Remote · ${r.location ?? 'Worldwide'}` : (r.location ?? 'Worldwide'),
    type: r.type ?? 'Full-time',
    level: r.level ?? 'Mid–Senior',
    tags: tagsFrom(skills, r.category),
    about: (r.description ?? '').trim().slice(0, 700) || 'Join a remote-first team building for a global audience.',
    duties: bulletsFrom(r.requirements, r.description),
    skills,
    verdict,
    vcap,
    breakdown: [
      { label: 'Skills', value: match >= 85 ? 'Excellent' : 'Strong', pct: Math.min(98, match + 4) },
      { label: 'Experience', value: match >= 80 ? 'Strong' : 'Good', pct: match },
      { label: 'Timezone', value: 'Good', pct: Math.max(60, match - 12) },
    ],
  };
}

export async function fetchJobs(opts: { limit?: number; offset?: number } = {}): Promise<Job[]> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const { data, error } = await supabase
    .from('jobs')
    .select(SAFE_COLUMNS)
    .eq('is_active', true)
    .order('featured', { ascending: false })
    .order('posted_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data as JobRow[]).map(rowToJob);
}

/**
 * Personalise match scores by the user's skills: each overlapping skill bumps
 * the score (capped). No-op when the user has no skills set.
 */
export function personalizeJobs(jobs: Job[], userSkills: string[]): Job[] {
  if (!userSkills.length) return jobs;
  const set = new Set(userSkills.map((s) => s.toLowerCase()));
  return jobs.map((j) => {
    const overlap = j.skills.filter((s) => set.has(s.toLowerCase())).length;
    if (!overlap) return j;
    return { ...j, match: Math.min(99, j.match + Math.min(8, overlap * 3)) };
  });
}

export async function fetchJobById(id: string): Promise<Job | null> {
  const { data, error } = await supabase.from('jobs').select(SAFE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToJob(data as JobRow) : null;
}

export interface JobsFeed {
  jobs: Job[];
  loading: boolean; // first page
  refreshing: boolean; // pull-to-refresh
  error: string | null;
  hasMore: boolean;
  refresh: () => void;
  loadMore: () => void;
}

/** Paginated live job list with pull-to-refresh + seed fallback. */
export function useJobs(pageSize = 20): JobsFeed {
  const [jobs, setJobs] = useState<Job[]>(isSupabaseConfigured ? [] : SEED_JOBS);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(isSupabaseConfigured);
  const busy = useRef(false);

  const load = useCallback(
    async (offset: number, mode: 'initial' | 'refresh' | 'more') => {
      if (!isSupabaseConfigured || busy.current) return;
      busy.current = true;
      if (mode === 'refresh') setRefreshing(true);
      else if (mode === 'initial') setLoading(true);
      try {
        const batch = await fetchJobs({ limit: pageSize, offset });
        setError(null);
        setHasMore(batch.length === pageSize);
        setJobs((prev) => (mode === 'more' ? [...prev, ...batch] : batch));
      } catch (e: any) {
        if (mode !== 'more') {
          setJobs(SEED_JOBS);
          setHasMore(false);
        }
        setError(e?.message ?? 'Failed to load jobs');
      } finally {
        busy.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    load(0, 'initial');
  }, [load]);

  return {
    jobs,
    loading,
    refreshing,
    error,
    hasMore,
    refresh: () => load(0, 'refresh'),
    loadMore: () => {
      if (hasMore && !busy.current) load(jobs.length, 'more');
    },
  };
}

/** Single job by id with seed fallback. */
export function useJob(id?: string): { job: Job | null; loading: boolean } {
  const [state, setState] = useState<{ job: Job | null; loading: boolean }>({
    job: isSupabaseConfigured ? null : (SEED_JOBS.find((j) => j.id === id) ?? null),
    loading: Boolean(isSupabaseConfigured && id),
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !id) return;
    let active = true;
    fetchJobById(id)
      .then((job) => active && setState({ job, loading: false }))
      .catch(() => active && setState({ job: SEED_JOBS.find((j) => j.id === id) ?? null, loading: false }));
    return () => {
      active = false;
    };
  }, [id]);

  return state;
}
