// lib/jobs/job-detail.ts — single source of truth for the job-detail row.
//
// /jobs/[id] used to run TWO uncached Supabase queries per request — one in
// the layout's generateMetadata, one in the page's fetchJob — plus an auth
// getUser + profiles read, all sequential, on EVERY hit (cookies() makes the
// route dynamic, so the page-level `revalidate` export never applied). At
// P75 that stack was the bulk of the route's 1.6–2s TTFB.
//
// This helper collapses both reads into one fetch that is:
//   * cached across requests via unstable_cache (5 min TTL, tagged so the
//     /api/jobs admin mutations can flush it instantly), and
//   * deduped within a request via React cache(), so generateMetadata and
//     the page body share one lookup.
//
// PAYWALL INVARIANT: only SAFE_JOB_COLUMNS ever enter this cache — never
// apply_url / apply_email. The shared cache serves anonymous, free, and paid
// requests alike, so a row with paid fields in it would leak them to anyone.
// Paid requesters get those two fields merged in by the page via a separate
// per-request query (see app/jobs/[id]/page.tsx).
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { SAFE_JOB_COLUMNS, getRequesterPlan, type RequesterPlan } from '@/lib/auth/requester-plan';
import { isSafeClosedJobMeta } from '@/lib/jobs/closed-job';

// Raw snake_case row (SAFE columns only). Typed as `any`-ish record for the
// same reason the page casts: select() with a runtime column string can't
// narrow the row type.
export type JobDetailRow = Record<string, any>;

// jobs.id is a uuid, so anything else can never match a row. Without this
// guard a non-uuid path segment (/jobs/abc, or the injection probes scanners
// fire at every route) reaches Postgres as `id = 'abc'`, which fails with
// 22P02 "invalid input syntax for type uuid". fetchJobRow deliberately throws
// on query errors (so a transient outage is not cached as a 404), which turned
// each of those probes into a 500 in the runtime logs instead of a 404 — and
// gave every distinct probe its own unstable_cache key and `job-${id}` tag.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchJobRow(id: string): Promise<JobDetailRow | null> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('jobs')
    .select(SAFE_JOB_COLUMNS)
    .eq('id', id)
    .eq('is_active', true)
    .or(notExpired())
    .or(NOT_FLAGGED)
    .maybeSingle();
  // Throw on transport/query errors so unstable_cache does NOT memoise a
  // transient failure as "job doesn't exist" for the whole TTL. A clean
  // null (row genuinely absent/expired) is safe to cache.
  if (error) throw new Error(`job-detail fetch failed: ${error.message}`);
  return (data as JobDetailRow | null) ?? null;
}

/**
 * Cached, request-deduped job-detail row (SAFE columns, visibility-filtered).
 * Returns null when the job is genuinely absent, expired, or flagged. Query
 * failures reject so the route error boundary can render a retriable failure
 * instead of misreporting a transient outage as a permanent 404.
 */
export const getJobDetailRow = cache(async (id: string): Promise<JobDetailRow | null> => {
  // A malformed id is a genuine "no such job": answer it here, before the
  // cache key/tag are minted and before Postgres is asked.
  if (!UUID_RE.test(id)) return null;
  // The id is baked into the key parts AND the tag, so an admin edit can
  // flush exactly this job via revalidateTag(`job-${id}`) while the bulk
  // 'jobs' tag covers create/delete sweeps from /api/jobs.
  return unstable_cache(
    () => fetchJobRow(id),
    ['job-detail-v1', id],
    { revalidate: 300, tags: ['jobs', `job-${id}`] },
  )();
});

/**
 * Request-deduped requester plan for the /jobs/[id] route. Both the layout's
 * generateMetadata and the page body need the plan now that the employer
 * name is masked server-side for non-subscribers; React cache() keeps that
 * at one auth round-trip per request (and getRequesterPlan itself
 * short-circuits to 'anon' for cookie-less traffic, i.e. every crawler).
 *
 * NEVER wrap this in unstable_cache — the result is per-user, and a shared
 * cache would hand one visitor's entitlement to everyone.
 */
export const getRequesterPlanCached = cache(async (): Promise<RequesterPlan> =>
  getRequesterPlan(await createServerSupabaseClient())
);

/** Minimal record for a job that exists but is no longer publicly visible. */
export interface ExpiredJobMeta { title: string; company: string }

/**
 * Existence probe used ONLY on the not-visible path: when getJobDetailRow
 * returns null, this distinguishes "row exists but is expired/flagged/inactive"
 * (→ render a noindex "position closed" page, per Google's job-expiry guidance)
 * from "row never existed" (→ a genuine 404). It deliberately skips the
 * visibility gate and selects just enough to label the closed posting.
 *
 * React cache() dedupes it across generateMetadata + the page body in one
 * request, and it only fires when the cheap, cached visible-row lookup already
 * came back empty — so the happy path pays nothing.
 */
export const getExpiredJobMeta = cache(async (id: string): Promise<ExpiredJobMeta | null> => {
  if (!UUID_RE.test(id)) return null;
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('jobs')
    .select('title, company, flagged')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`closed-job fetch failed: ${error.message}`);
  if (!data || !isSafeClosedJobMeta(data as any)) return null;
  return { title: (data as any).title ?? 'This role', company: (data as any).company ?? '' };
});
