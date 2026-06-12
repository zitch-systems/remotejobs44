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
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { SAFE_JOB_COLUMNS } from '@/lib/auth/requester-plan';

// Raw snake_case row (SAFE columns only). Typed as `any`-ish record for the
// same reason the page casts: select() with a runtime column string can't
// narrow the row type.
export type JobDetailRow = Record<string, any>;

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
 * Returns null when the job is absent, expired, flagged, or the DB errored —
 * callers already treat null as notFound(), matching prior behaviour.
 */
export const getJobDetailRow = cache(async (id: string): Promise<JobDetailRow | null> => {
  try {
    // The id is baked into the key parts AND the tag, so an admin edit can
    // flush exactly this job via revalidateTag(`job-${id}`) while the bulk
    // 'jobs' tag covers create/delete sweeps from /api/jobs.
    return await unstable_cache(
      () => fetchJobRow(id),
      ['job-detail-v1', id],
      { revalidate: 300, tags: ['jobs', `job-${id}`] },
    )();
  } catch {
    return null;
  }
});
