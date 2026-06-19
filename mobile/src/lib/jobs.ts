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
  categories?: string[]; // lowercase categories (OR'd), e.g. ['engineering','data']
  type?: string; // lowercase job type, e.g. 'full-time'
  level?: ExperienceLevel; // experience bucket (matched against the free-form level)
  remoteOnly?: boolean; // only remote=true roles
  location?: string; // free-text location match (ilike on the location column)
  postedWithinDays?: number; // max posting age in days
}

/** True when no filters are set — lets the default feed reuse the disk cache. */
export function isDefaultQuery(q: JobQuery): boolean {
  return (
    !q.text?.trim() &&
    !q.categories?.length &&
    !q.type &&
    (!q.level || q.level === 'Any') &&
    !q.remoteOnly &&
    !q.location?.trim() &&
    !q.postedWithinDays
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

// In-memory cache of jobs we've already mapped (keyed by id). Lets the detail
// screen paint instantly from the list data the user just tapped, instead of
// waiting on a fresh fetch. Refreshed whenever a list or the detail re-fetches.
const jobCache = new Map<string, Job>();
function cacheJobs(jobs: Job[]): Job[] {
  for (const j of jobs) jobCache.set(j.id, j);
  return jobs;
}
export function getCachedJob(id?: string): Job | undefined {
  return id ? jobCache.get(id) : undefined;
}

export async function fetchJobs(query: JobQuery = {}, opts: { limit?: number; offset?: number } = {}): Promise<Job[]> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  let q = supabase.from('jobs').select(SAFE_COLUMNS).eq('is_active', true);

  const text = sanitizeText(query.text ?? '');
  if (text) q = q.or(`title.ilike.%${text}%,company.ilike.%${text}%`);
  if (query.categories?.length) q = q.in('category', query.categories);
  if (query.type) q = q.eq('type', query.type);
  if (query.remoteOnly) q = q.eq('remote', true);
  const location = sanitizeText(query.location ?? '');
  if (location) q = q.ilike('location', `%${location}%`);
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
  return cacheJobs(((data as JobRow[]) ?? []).map(rowToJob));
}

export async function fetchJobById(id: string): Promise<Job | null> {
  const { data, error } = await supabase.from('jobs').select(SAFE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [job] = cacheJobs([rowToJob(data as JobRow)]);
  return job;
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
  const reqRef = useRef(0); // "latest wins" token so query changes can't be dropped

  const load = useCallback(
    async (offset: number, mode: 'initial' | 'refresh' | 'more') => {
      if (!isSupabaseConfigured) return;
      // Only block a concurrent loadMore (pagination). A query change (initial/
      // refresh) must ALWAYS supersede an in-flight load, or rapid filter/search
      // edits get silently dropped and the feed shows stale results.
      if (mode === 'more' && busy.current) return;
      const reqId = ++reqRef.current;
      busy.current = true;
      if (mode === 'refresh') setRefreshing(true);
      else if (mode === 'initial') setLoading(true);
      try {
        const batch = await fetchJobs(query, { limit: pageSize, offset });
        if (reqId !== reqRef.current) return; // superseded by a newer query → discard
        setError(null);
        setHasMore(batch.length === pageSize);
        setJobs((prev) => (mode === 'more' ? [...prev, ...batch] : batch));
        if (mode !== 'more') {
          gotFresh.current = true;
          if (isDefault) saveFeedCache(batch); // only cache the default feed
        }
      } catch (e: any) {
        if (reqId !== reqRef.current) return; // stale failure → ignore
        if (mode !== 'more' && !gotFresh.current && isDefault) {
          setJobs(SEED_JOBS);
          setHasMore(false);
        } else if (mode !== 'more') {
          setJobs([]); // a filtered query that failed shows empty, not seed
          setHasMore(false);
        }
        setError(e?.message ?? 'Failed to load jobs');
      } finally {
        // Only the latest request owns the shared busy/loading flags.
        if (reqId === reqRef.current) {
          busy.current = false;
          setLoading(false);
          setRefreshing(false);
        }
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

/** Single job by id. Paints instantly from the cache (the list the user just
 *  tapped), then refreshes from the server in the background. */
export function useJob(id?: string): { job: Job | null; loading: boolean } {
  // Seed from the in-memory cache so opening a role from a list is instant.
  const cached = getCachedJob(id) ?? (isSupabaseConfigured ? null : SEED_JOBS.find((j) => j.id === id) ?? null);
  const [state, setState] = useState<{ job: Job | null; loading: boolean }>({
    job: cached,
    // Only show a loader when we have nothing to display yet.
    loading: Boolean(isSupabaseConfigured && id && !cached),
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !id) return;
    let active = true;
    // Re-seed synchronously when the id changes (cache may already have it).
    // If it's not cached, show a loader instead of the PREVIOUS job's data.
    const seed = getCachedJob(id);
    setState(seed ? { job: seed, loading: false } : { job: null, loading: true });
    fetchJobById(id)
      .then((job) => active && job && setState({ job, loading: false }))
      .catch(() => active && setState((s) => (s.job ? { ...s, loading: false } : { job: SEED_JOBS.find((j) => j.id === id) ?? null, loading: false })));
    return () => {
      active = false;
    };
  }, [id]);

  return state;
}
