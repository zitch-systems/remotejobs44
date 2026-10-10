// src/lib/jobs.ts — live job data from Supabase, adapted to the mobile Job
// shape. The handoff seed set is used only when Supabase isn't configured.
//
// Pure adapters/formatters live in ./format (unit-tested); this file owns the
// Supabase queries + React hooks.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { apiFetch } from './api';
import { SEED_JOBS } from './seed';
import { loadFeedCache, saveFeedCache } from './feed-cache';
import { bulletsFrom, deriveMatch, gradFor, plainJobText, salaryLabel, tagsFrom, timeAgo, verdictFor } from './format';
import { matchesLevel, type ExperienceLevel, type WorkplaceFilter } from './filters';
import type { Job } from './types';
import { subscribeEntitlementInvalidation } from './entitlement-invalidation';
import { onSessionChange } from './session-change';

// Server-side job query. Every field is optional; an absent field = no filter.
// category/type are the lowercase DB values (see CATEGORY_OPTIONS/TYPE_OPTIONS).
export interface JobQuery {
  text?: string; // free-text match on title + company
  categories?: string[]; // lowercase categories (OR'd), e.g. ['engineering','data']
  type?: string; // lowercase job type, e.g. 'full-time'
  level?: ExperienceLevel; // experience bucket (matched against the free-form level)
  workplace?: WorkplaceFilter;
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
    (!q.workplace || q.workplace === 'all') &&
    !q.location?.trim() &&
    !q.postedWithinDays
  );
}

/** Filter bundled demo rows using their explicit fixture metadata. */
export function filterDemoJobs(jobs: Job[], query: JobQuery): Job[] {
  const text = query.text?.trim().toLowerCase();
  const location = query.location?.trim().toLowerCase();
  const categories = query.categories?.map((category) => category.toLowerCase());

  return jobs.filter((job) => {
    if (text && !job.role.toLowerCase().includes(text) && !job.company.toLowerCase().includes(text)) return false;
    if (categories?.length && !categories.includes(job.category.toLowerCase())) return false;
    if (query.type && job.type.toLowerCase() !== query.type.toLowerCase()) return false;
    if (query.level && !matchesLevel(job.level, query.level)) return false;
    if (location && !job.location.toLowerCase().includes(location)) return false;
    if (query.postedWithinDays) {
      const age = /^(\d+)([hdw]) ago$/.exec(job.time);
      if (!age) return false;
      const days = Number(age[1]) * (age[2] === 'w' ? 7 : age[2] === 'h' ? 1 / 24 : 1);
      if (days > query.postedWithinDays) return false;
    }
    if (query.workplace && query.workplace !== 'all') {
      if (query.workplace === 'relocation') {
        if (!job.relocationSupported) return false;
      } else {
        const workplace = job.workplaceType ?? (/^Remote\s*·/i.test(job.location) ? 'remote' : 'unknown');
        if (workplace !== query.workplace) return false;
      }
    }
    return true;
  });
}

// Re-export so existing importers (the feed) keep their import path.
export { personalizeJobs } from './format';

/** Auth callbacks must return before work that calls Supabase auth again. */
export function scheduleAfterAuth(work: () => void): ReturnType<typeof setTimeout> {
  return setTimeout(work, 0);
}

export interface JobRow {
  id: string;
  title: string;
  company: string;
  logo: string | null;
  category: string | null;
  type: string | null;
  level: string | null;
  location: string | null;
  applyUrl?: string | null;
  applyEmail?: string | null;
  description: string | null;
  requirements: string[] | string | null;
  skills: string[] | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  salaryText?: string | null;
  remote: boolean | null;
  featured: boolean | null;
  posted?: string | null;
  workplaceType?: Job['workplaceType'];
  relocationSupported?: boolean;
  visaSponsorship?: boolean;
  source?: string | null;
}

export function rowToJob(r: JobRow): Job {
  const match = deriveMatch({
    id: r.id,
    featured: r.featured,
    posted_at: r.posted ?? null,
    salary_min: r.salaryMin,
    salary_max: r.salaryMax,
    skills: r.skills,
  });
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
    // This is source provenance, not a claim that we verified the employer.
    verified: ['greenhouse', 'lever', 'ashby', 'workable'].includes((r.source ?? '').toLowerCase()),
    salary: r.salaryText?.trim() || salaryLabel(r.salaryMin, r.salaryMax, r.currency ?? 'USD'),
    per: r.salaryText?.trim() ? '' : '/yr',
    time: timeAgo(r.posted ?? null),
    location: r.workplaceType === 'remote' || r.remote
      ? `Remote · ${r.location ?? 'Location not specified'}`
      : (r.location ?? 'Location not specified'),
    type: r.type ?? 'Full-time',
    level: r.level ?? 'Mid–Senior',
    workplaceType: r.workplaceType ?? (r.remote ? 'remote' : 'unknown'),
    relocationSupported: r.relocationSupported === true,
    visaSponsorship: r.visaSponsorship === true,
    applyUrl: r.applyUrl ?? undefined,
    applyEmail: r.applyEmail ?? undefined,
    tags: tagsFrom(skills, r.category),
    about: plainJobText(r.description ?? '') || 'Description not provided.',
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

// A cached Pro response contains employer identity. Never carry it into a
// different session after sign-out/account switch.
supabase.auth.onAuthStateChange(() => {
  jobCache.clear();
});

export async function fetchJobs(query: JobQuery = {}, opts: { limit?: number; offset?: number } = {}): Promise<Job[]> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const params = new URLSearchParams({ page: String(Math.floor(offset / limit) + 1), perPage: String(limit) });
  if (query.text?.trim()) params.set('q', query.text.trim());
  if (query.categories?.length) params.set('category', query.categories.join(','));
  if (query.type) params.set('type', query.type);
  if (query.level && query.level !== 'Any') params.set('level', query.level.toLowerCase());
  if (query.workplace && query.workplace !== 'all') params.set('workplace', query.workplace);
  if (query.location?.trim()) params.set('country', query.location.trim());
  if (query.postedWithinDays) params.set('posted', String(query.postedWithinDays));
  const response = await apiFetch(`/api/jobs?${params}`);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Failed to load jobs (${response.status})`);
  return cacheJobs(((body?.jobs as JobRow[]) ?? []).map(rowToJob));
}

export async function fetchJobById(id: string): Promise<Job | null> {
  const response = await apiFetch(`/api/jobs?id=${encodeURIComponent(id)}`);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Failed to load job (${response.status})`);
  if (!body?.job) return null;
  const [job] = cacheJobs([rowToJob(body.job as JobRow)]);
  return job;
}

/** Fetch jobs in bounded API batches while preserving caller order. */
export async function fetchJobsByIds(ids: string[]): Promise<Job[]> {
  const unique = Array.from(new Set(ids));
  const rows: Job[] = [];
  for (let i = 0; i < unique.length; i += 10) {
    const batch = unique.slice(i, i + 10);
    const response = await apiFetch(`/api/jobs?ids=${encodeURIComponent(batch.join(','))}`);
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? `Failed to load jobs (${response.status})`);
    rows.push(...((body?.jobs as JobRow[]) ?? []).map(rowToJob));
  }
  const byId = new Map(rows.map((job) => [job.id, job]));
  return cacheJobs(unique.map((id) => byId.get(id)).filter((job): job is Job => Boolean(job)));
}

/**
 * Paid-only apply channel. apply_url/apply_email are paywalled columns the
 * session role can't SELECT; entitled callers (unexpired daily/pro, admin)
 * fetch them through the plan-checked SECURITY DEFINER RPC job_apply_channel
 * (migration_v65). Free/expired callers get zero rows back — the check is
 * server-side, not a client gate.
 */
export async function fetchApplyChannel(
  jobId: string,
): Promise<{ applyUrl?: string; applyEmail?: string } | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('job_apply_channel', { p_job_id: jobId });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { applyUrl: row.apply_url ?? undefined, applyEmail: row.apply_email ?? undefined };
}

/**
 * Apply channel for a job the signed-in user has already tracked an application
 * for. Free-plan users can't call job_apply_channel (above); on the web the
 * tracked application itself is the capability that releases the employer's
 * link, so the app does the same: track first, then ask the API
 * (GET /api/applications?channel=). 404 means the application isn't recorded
 * (yet), and any failure reads as "no channel" rather than blocking the apply.
 */
export async function fetchTrackedApplyChannel(
  jobId: string,
): Promise<{ applyUrl?: string; applyEmail?: string } | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const res = await apiFetch(`/api/applications?channel=${encodeURIComponent(jobId)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { applyUrl?: unknown; applyEmail?: unknown } | null;
    const applyUrl = typeof body?.applyUrl === 'string' && body.applyUrl ? body.applyUrl : undefined;
    const applyEmail = typeof body?.applyEmail === 'string' && body.applyEmail ? body.applyEmail : undefined;
    return applyUrl || applyEmail ? { applyUrl, applyEmail } : null;
  } catch {
    return null;
  }
}

/** Other active roles in the same category (for the detail "more like this"). */
export async function fetchSimilarJobs(category: string, excludeId: string, limit = 4): Promise<Job[]> {
  const jobs = await fetchJobs({ categories: [category] }, { limit: limit + 1 });
  return jobs.filter((job) => job.id !== excludeId).slice(0, limit);
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
 * Paginated live job list with pull-to-refresh and a demo-only seed set.
 *
 * `query` filters server-side across the whole table (not just the loaded
 * page). Changing it refetches from offset 0. The privacy-safe disk cache only
 * applies to the default (unfiltered) feed.
 */
export function useJobs(pageSize = 20, query: JobQuery = {}): JobsFeed {
  const queryKey = JSON.stringify(query);
  const isDefault = isDefaultQuery(query);
  const [jobs, setJobs] = useState<Job[]>(isSupabaseConfigured ? [] : filterDemoJobs(SEED_JOBS, query));
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(isSupabaseConfigured);
  const busy = useRef(false);
  const gotFresh = useRef(false);
  const reqRef = useRef(0); // "latest wins" token so query changes can't be dropped

  useEffect(() => {
    if (!isSupabaseConfigured) setJobs(filterDemoJobs(SEED_JOBS, query));
  }, [queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
          // Disk cache only the privacy-safe public representation. A Pro feed
          // can contain employer identity and must not survive a tier/account
          // change on a shared device.
          if (isDefault && batch.every((job) => job.company === 'Hidden Company')) saveFeedCache(batch);
        }
      } catch (e: any) {
        if (reqId !== reqRef.current) return; // stale failure → ignore
        if (mode !== 'more') {
          // Never fabricate demo jobs as if they were live on a configured
          // build — surface the error/empty state instead. Default feed: keep
          // any cached rows already on screen (or stay empty). Filtered query:
          // clear stale results so the empty state is honest.
          if (!isDefault) setJobs([]);
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

  useEffect(() => subscribeEntitlementInvalidation(() => {
    ++reqRef.current;
    setJobs([]);
    setLoading(true);
    void load(0, 'initial');
  }), [load]);

  // Re-resolve plan-aware fields after sign-in/out, token refresh or an account
  // switch. This removes a real company name promptly after entitlement loss.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onSessionChange(() => {
      // Supabase awaits auth callbacks while holding its auth lock. Clear any
      // paid response synchronously, then defer getSession/network work until
      // after the callback returns.
      ++reqRef.current; // invalidate an in-flight response from the old session
      busy.current = false;
      setJobs([]);
      setError(null);
      setHasMore(false);
      setLoading(true);
      setRefreshing(false);
      if (timer) clearTimeout(timer);
      timer = scheduleAfterAuth(() => { void load(0, 'initial'); });
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
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
  return fetchJobs({}, { limit });
}

const seedRecommended = (): Job[] => [...SEED_JOBS].sort((a, b) => b.match - a.match);

/** Personalised "For you" list (server-ranked live; seed fallback in demo). */
export function useRecommendedJobs(limit = 30): { jobs: Job[]; loading: boolean; error: string | null; refresh: () => void } {
  const [jobs, setJobs] = useState<Job[]>(isSupabaseConfigured ? [] : seedRecommended());
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setJobs(seedRecommended());
      setLoading(false);
      return;
    }
    let active = true;
    const reqId = ++reqRef.current;
    setLoading(true);
    fetchRecommendedJobs(limit)
      .then((list) => {
        if (!active || reqId !== reqRef.current) return;
        setJobs(list);
        setError(null);
        setLoading(false);
      })
      .catch((e: any) => {
        if (!active || reqId !== reqRef.current) return;
        setJobs([]);
        setError(e?.message ?? 'Failed to load recommendations');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [nonce, limit]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onSessionChange(() => {
      ++reqRef.current;
      setJobs([]);
      setError(null);
      setLoading(true);
      if (timer) clearTimeout(timer);
      timer = scheduleAfterAuth(() => setNonce((n) => n + 1));
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => subscribeEntitlementInvalidation(() => {
    ++reqRef.current;
    setJobs([]);
    setError(null);
    setLoading(true);
    setNonce((n) => n + 1);
  }), []);

  return { jobs, loading, error, refresh: () => setNonce((n) => n + 1) };
}

/** Single job by id. Paints instantly from the cache (the list the user just
 *  tapped), then refreshes from the server in the background. */
export function useJob(id?: string): { job: Job | null; loading: boolean } {
  // Seed from the in-memory cache so opening a role from a list is instant.
  // Configured builds revalidate before painting. Cached Pro rows can include
  // employer identity and the profile plan may have changed since navigation.
  const cached = isSupabaseConfigured ? null : SEED_JOBS.find((j) => j.id === id) ?? null;
  const [state, setState] = useState<{ job: Job | null; loading: boolean }>({
    job: cached,
    // Only show a loader when we have nothing to display yet.
    loading: Boolean(isSupabaseConfigured && id && !cached),
  });
  const reqRef = useRef(0);

  const loadJob = useCallback(async () => {
    if (!isSupabaseConfigured || !id) return;
    const reqId = ++reqRef.current;
    setState({ job: null, loading: true });
    try {
      const job = await fetchJobById(id);
      if (reqId === reqRef.current) setState({ job, loading: false });
    } catch {
      if (reqId === reqRef.current) setState({ job: null, loading: false });
    }
  }, [id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !id) return;
    void loadJob();
    return () => {
      ++reqRef.current;
    };
  }, [id, loadJob]);

  useEffect(() => {
    if (!isSupabaseConfigured || !id) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onSessionChange(() => {
      ++reqRef.current; // old Pro response can no longer win the race
      setState({ job: null, loading: true });
      if (timer) clearTimeout(timer);
      timer = scheduleAfterAuth(() => { void loadJob(); });
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [id, loadJob]);

  useEffect(() => subscribeEntitlementInvalidation(() => {
    ++reqRef.current;
    setState({ job: null, loading: true });
    void loadJob();
  }), [loadJob]);

  return state;
}
