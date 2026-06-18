// src/lib/jobs.ts — live job data from Supabase, adapted to the mobile Job
// shape. Falls back to the handoff seed set when Supabase isn't configured
// (demo mode) or a query fails, so the UI is never empty.
//
// Pure adapters/formatters live in ./format (unit-tested); this file owns the
// Supabase queries + React hooks.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { SEED_JOBS } from './seed';
import { loadFeedCache, saveFeedCache } from './feed-cache';
import { bulletsFrom, deriveMatch, gradFor, salaryLabel, tagsFrom, timeAgo, verdictFor } from './format';
import { LEVEL_TOKENS, type ExperienceLevel } from './filters';
import type { Job } from './types';

// Server-side job query. Every field is optional; an absent field = no filter.
// category/type are the lowercase DB values (see CATEGORY_OPTIONS/TYPE_OPTIONS).
export interface JobQuery {
  text?: string; // free-text match on title + company
  category?: string; // lowercase category, e.g. 'engineering'
  type?: string; // lowercase job type, e.g. 'full-time'
  level?: ExperienceLevel; // experience bucket (matched against the free-form level)
  remoteOnly?: boolean; // only remote=true roles
  postedWithinDays?: number; // max posting age in days
}

/** True when no filters are set — lets the default feed reuse the disk cache. */
export function isDefaultQuery(q: JobQuery): boolean {
  return (
    !q.text?.trim() && !q.category && !q.type && (!q.level || q.level === 'Any') && !q.remoteOnly && !q.postedWithinDays
  );
}

// PostgREST .or() values are comma/parenthesis-delimited, so strip those (and
// the ilike wildcard) from user text to keep the filter expression valid.
function sanitizeText(s: string): string {
  return s.replace(/[%,()]/g, ' ').trim();
}

// Re-export so existing importers (the feed) keep their import path.
export { personalizeJobs } from './format';

const SAFE_COLUMNS =
  'id,title,company,logo,category,type,level,location,apply_url,apply_email,description,requirements,skills,salary_min,salary_max,currency,remote,featured,posted_at';

interface JobRow {
  id: string;
  title: string;
  company: string;
  logo: string | null;
  category: string | null;
  type: string | null;
  level: string | null;
  location: string | null;
  apply_url: string | null;
  apply_email: string | null;
  description: string | null;
  requirements: string[] | string | null;
  skills: string[] | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  remote: boolean | null;
  featured: boolean | null;
  posted_at: string | null;
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
    applyUrl: r.apply_url ?? undefined,
    applyEmail: r.apply_email ?? undefined,
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

export async function fetchJobs(query: JobQuery = {}, opts: { limit?: number; offset?: number } = {}): Promise<Job[]> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  let q = supabase.from('jobs').select(SAFE_COLUMNS).eq('is_active', true);

  const text = sanitizeText(query.text ?? '');
  if (text) q = q.or(`title.ilike.%${text}%,company.ilike.%${text}%`);
  if (query.category) q = q.eq('category', query.category);
  if (query.type) q = q.eq('type', query.type);
  if (query.remoteOnly) q = q.eq('remote', true);
  if (query.postedWithinDays) {
    const since = new Date(Date.now() - query.postedWithinDays * 86_400_000).toISOString();
    q = q.gte('posted_at', since);
  }
  // Experience level is a free-form column; match the bucket's keywords with an
  // OR of ILIKEs. Each .or() is ANDed with the others (and the text filter).
  if (query.level && query.level !== 'Any') {
    const tokens = LEVEL_TOKENS[query.level];
    q = q.or(tokens.map((t) => `level.ilike.%${t}%`).join(','));
  }

  const { data, error } = await q
    .order('featured', { ascending: false })
    .order('posted_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data as JobRow[]).map(rowToJob);
}

export async function fetchJobById(id: string): Promise<Job | null> {
  const { data, error } = await supabase.from('jobs').select(SAFE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToJob(data as JobRow) : null;
}

/** Other active roles in the same category (for the detail "more like this"). */
export async function fetchSimilarJobs(category: string, excludeId: string, limit = 4): Promise<Job[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select(SAFE_COLUMNS)
    .eq('is_active', true)
    .eq('category', category)
    .neq('id', excludeId)
    .order('posted_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as JobRow[]).map(rowToJob);
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

/**
 * Paginated live job list with pull-to-refresh + seed fallback.
 *
 * `query` filters server-side across the whole table (not just the loaded
 * page). Changing it refetches from offset 0. The disk cache + seed fallback
 * only apply to the default (unfiltered) feed.
 */
export function useJobs(pageSize = 20, query: JobQuery = {}): JobsFeed {
  const queryKey = JSON.stringify(query);
  const isDefault = isDefaultQuery(query);
  const [jobs, setJobs] = useState<Job[]>(isSupabaseConfigured ? [] : SEED_JOBS);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(isSupabaseConfigured);
  const busy = useRef(false);
  const gotFresh = useRef(false);

  const load = useCallback(
    async (offset: number, mode: 'initial' | 'refresh' | 'more') => {
      if (!isSupabaseConfigured || busy.current) return;
      busy.current = true;
      if (mode === 'refresh') setRefreshing(true);
      else if (mode === 'initial') setLoading(true);
      try {
        const batch = await fetchJobs(query, { limit: pageSize, offset });
        setError(null);
        setHasMore(batch.length === pageSize);
        setJobs((prev) => (mode === 'more' ? [...prev, ...batch] : batch));
        if (mode !== 'more') {
          gotFresh.current = true;
          if (isDefault) saveFeedCache(batch); // only cache the default feed
        }
      } catch (e: any) {
        if (mode !== 'more' && !gotFresh.current && isDefault) {
          setJobs(SEED_JOBS);
          setHasMore(false);
        } else if (mode !== 'more') {
          setJobs([]); // a filtered query that failed shows empty, not seed
          setHasMore(false);
        }
        setError(e?.message ?? 'Failed to load jobs');
      } finally {
        busy.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    // queryKey stands in for `query` (a fresh object each render); changing any
    // filter recreates `load`, which the effect below reruns from offset 0.
    [pageSize, queryKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Show the last cached page instantly on cold start (default feed only).
  useEffect(() => {
    if (!isSupabaseConfigured || !isDefault) return;
    let active = true;
    loadFeedCache().then((cached) => {
      if (active && cached?.length && !gotFresh.current) {
        setJobs(cached);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [isDefault]);

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

/** Server-side relevance: jobs ranked for the signed-in user (migration_v44). */
export async function fetchRecommendedJobs(limit = 30): Promise<Job[]> {
  const { data, error } = await supabase.rpc('recommended_jobs', { limit_n: limit });
  if (error) throw error;
  return ((data as JobRow[]) ?? []).map(rowToJob);
}

const seedRecommended = (): Job[] => [...SEED_JOBS].sort((a, b) => b.match - a.match);

/** Personalised "For you" list (server-ranked live; seed fallback in demo). */
export function useRecommendedJobs(limit = 30): { jobs: Job[]; loading: boolean; error: string | null; refresh: () => void } {
  const [jobs, setJobs] = useState<Job[]>(isSupabaseConfigured ? [] : seedRecommended());
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setJobs(seedRecommended());
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetchRecommendedJobs(limit)
      .then((list) => {
        if (!active) return;
        setJobs(list.length ? list : seedRecommended());
        setError(null);
        setLoading(false);
      })
      .catch((e: any) => {
        if (!active) return;
        setJobs(seedRecommended());
        setError(e?.message ?? 'Failed to load recommendations');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [nonce, limit]);

  return { jobs, loading, error, refresh: () => setNonce((n) => n + 1) };
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
