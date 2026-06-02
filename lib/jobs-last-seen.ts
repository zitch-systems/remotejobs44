// lib/jobs-last-seen.ts
// Shared "we still see this posting" helper. The manual company refresh and
// (indirectly) the ingest paths need to bump last_seen_at for a batch of
// postings so a job an upstream still lists never ages out of the daily
// 60-day staleness sweep (app/api/cron/daily). Kept in its own dependency-
// light module so importing it never pulls the ATS engine (and its dynamic
// chromium fallback) into a caller's function bundle.
import type { createAdminSupabaseClient } from '@/lib/supabase/server';
import { logWarn } from '@/lib/log';

type AdminSupabase = ReturnType<typeof createAdminSupabaseClient>;

// A single PostgREST `.in()` list gets unwieldy past a few hundred values, and
// the search_vector GIN trigger makes wide UPDATEs heavier — so chunk.
const CHUNK = 200;

// Bump last_seen_at for the given apply_urls. Never flips is_active — an admin
// soft-delete must stay deleted. Best-effort: a failure here must not fail the
// caller's primary work. Returns the number of rows touched.
export async function touchLastSeen(
  supabase: AdminSupabase,
  urls: Array<string | null | undefined>,
): Promise<number> {
  const list = Array.from(new Set(urls.filter((u): u is string => !!u)));
  if (list.length === 0) return 0;
  const now = new Date().toISOString();
  let touched = 0;
  for (let i = 0; i < list.length; i += CHUNK) {
    try {
      const { count } = await supabase
        .from('jobs')
        .update({ last_seen_at: now }, { count: 'exact' })
        .in('apply_url', list.slice(i, i + CHUNK));
      touched += count ?? 0;
    } catch (err: any) {
      logWarn({ event: 'jobs.touch_last_seen_failed', error: err?.message ?? String(err) });
    }
  }
  return touched;
}
