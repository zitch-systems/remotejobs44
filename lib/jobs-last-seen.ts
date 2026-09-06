// lib/jobs-last-seen.ts
// Shared "we still see this posting" helper. The manual company refresh, the
// ingest pipeline and the recurring ATS sweep all need to bump last_seen_at for
// a batch of postings so a job an upstream still lists never ages out of the
// daily 60-day staleness sweep (app/api/cron/daily). Kept in its own
// dependency-light module so importing it never pulls the ATS engine (and its
// dynamic chromium fallback) into a caller's function bundle.
import type { createAdminSupabaseClient } from '@/lib/supabase/server';
import { logWarn } from '@/lib/log';

type AdminSupabase = ReturnType<typeof createAdminSupabaseClient>;

// Hard cap on values per request. The search_vector GIN trigger makes wide
// UPDATEs heavier, and a long IN list is a slow scan regardless.
const MAX_URLS_PER_BATCH = 100;

// Cap on the raw bytes of apply_url the IN list may carry. This is the limit
// that actually bites: PostgREST takes filters in the QUERY STRING, so
// `.in('apply_url', urls)` becomes `?apply_url=in.("…","…",…)` on the request
// line, and Supabase's nginx front-end rejects a request line larger than its
// 8KB header buffer with 414 Request-URI Too Large. Percent-encoding roughly
// doubles a URL's length (`https://` alone becomes `https%3A%2F%2F`), so a
// batch of 200 typical ATS apply links — the previous chunk size — produced a
// ~13KB request line and 414'd every time.
//
// Nothing surfaced that: supabase-js RETURNS the error rather than throwing, so
// the surrounding try/catch never fired and the discarded result read as
// success. last_seen_at silently stopped being refreshed for the affected
// boards, and 60 days later the staleness sweep deactivated postings the
// upstream was still listing.
//
// 3.5KB of raw URL leaves headroom for encoding plus the base URL and still
// fits comfortably in one request.
const MAX_URL_BYTES_PER_BATCH = 3_500;

/**
 * Split values into batches bounded by BOTH count and total byte length, so no
 * batch can produce an over-long PostgREST request line. A single value longer
 * than the byte budget still gets its own batch — it has to go somewhere, and
 * one oversized URL should not silently drop the postings batched with it.
 * Exported for unit testing.
 */
export function batchByLength(
  values: string[],
  maxCount = MAX_URLS_PER_BATCH,
  maxBytes = MAX_URL_BYTES_PER_BATCH,
): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let bytes = 0;
  for (const v of values) {
    const len = v.length;
    if (current.length > 0 && (current.length >= maxCount || bytes + len > maxBytes)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(v);
    bytes += len;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Normalise a caller's input to a deduped list of non-empty apply_urls. */
function toUrlList(urls: Array<string | null | undefined>): string[] {
  return Array.from(new Set(urls.filter((u): u is string => !!u)));
}

// Bump last_seen_at for the given apply_urls. Never flips is_active — an admin
// soft-delete must stay deleted. Best-effort: a failure here must not fail the
// caller's primary work, but it IS logged (per batch) rather than discarded.
// Returns the number of rows touched.
export async function touchLastSeen(
  supabase: AdminSupabase,
  urls: Array<string | null | undefined>,
  context?: string,
): Promise<number> {
  const list = toUrlList(urls);
  if (list.length === 0) return 0;
  const now = new Date().toISOString();
  let touched = 0;
  for (const batch of batchByLength(list)) {
    try {
      const { count, error } = await supabase
        .from('jobs')
        .update({ last_seen_at: now }, { count: 'exact' })
        .in('apply_url', batch);
      // supabase-js resolves with { error } instead of throwing, so this check
      // — not the catch below — is what catches a 414 / statement timeout.
      if (error) {
        logWarn({
          event: 'jobs.touch_last_seen_failed',
          context: context ?? null,
          batch: batch.length,
          error: error.message,
        });
        continue;
      }
      touched += count ?? 0;
    } catch (err: any) {
      logWarn({
        event: 'jobs.touch_last_seen_threw',
        context: context ?? null,
        batch: batch.length,
        error: err?.message ?? String(err),
      });
    }
  }
  return touched;
}

/**
 * Same as touchLastSeen, but also flips is_active back on for postings the
 * staleness sweep had already retired — used by the ATS refresh, where seeing a
 * posting on the board again is proof it should not have been retired. Returns
 * how many rows were reactivated (were inactive → now active).
 */
export async function markSeenAndReactivate(
  supabase: AdminSupabase,
  urls: Array<string | null | undefined>,
  context?: string,
): Promise<number> {
  const list = toUrlList(urls);
  if (list.length === 0) return 0;
  const now = new Date().toISOString();
  let reactivated = 0;
  for (const batch of batchByLength(list)) {
    try {
      // Reactivate the retired ones first so the count is exact…
      const { data, error: reErr } = await supabase
        .from('jobs')
        .update({ is_active: true, last_seen_at: now })
        .in('apply_url', batch)
        .eq('is_active', false)
        .select('id');
      if (reErr) {
        logWarn({
          event: 'jobs.mark_seen_reactivate_failed',
          context: context ?? null,
          batch: batch.length,
          error: reErr.message,
        });
      } else {
        reactivated += data?.length ?? 0;
      }
      // …then keep the already-active ones fresh.
      const { error: freshErr } = await supabase
        .from('jobs')
        .update({ last_seen_at: now })
        .in('apply_url', batch)
        .eq('is_active', true);
      if (freshErr) {
        logWarn({
          event: 'jobs.mark_seen_touch_failed',
          context: context ?? null,
          batch: batch.length,
          error: freshErr.message,
        });
      }
    } catch (err: any) {
      logWarn({
        event: 'jobs.mark_seen_threw',
        context: context ?? null,
        batch: batch.length,
        error: err?.message ?? String(err),
      });
    }
  }
  return reactivated;
}
