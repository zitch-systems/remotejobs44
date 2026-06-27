// lib/sitemap-shards.ts — shared sharding math for the sitemap.
//
// Both app/sitemap.ts (which emits the per-shard <urlset> files at
// /sitemap/<id>.xml via generateSitemaps) and app/sitemap.xml/route.ts (which
// emits the <sitemapindex> that links them) need the same answer to "how many
// shards are there right now". Keeping it in one place stops the two from
// drifting — a mismatch would either orphan a shard or list a 404 in the index.
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';

export const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.com').replace(/\/$/, '');

// Google caps a single sitemap at 50k URLs / 50MB. 20k keeps each shard well
// inside both with room for long job-id URLs.
export const JOB_SHARD_SIZE = 20000;

// Runaway-growth backstop: 12 × 20k = 240k job URLs, far beyond inventory.
export const MAX_JOB_SHARDS = 12;

/** Count of publicly-visible job postings (mirrors the read-time gate). */
export async function countVisibleJobs(): Promise<number> {
  try {
    const admin = createAdminSupabaseClient();
    const { count } = await admin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .or(notExpired())
      .or(NOT_FLAGGED);
    return count ?? 0;
  } catch {
    return 0; // DB unavailable at build → static-only sitemap
  }
}

/** Number of job-URL shards (ids 1..N). Shard 0 is always the static shard. */
export async function jobShardCount(): Promise<number> {
  const total = await countVisibleJobs();
  return Math.min(MAX_JOB_SHARDS, Math.ceil(total / JOB_SHARD_SIZE));
}
