import type { createAdminSupabaseClient } from '@/lib/supabase/server';
import { markSeenAndReactivate } from '@/lib/jobs-last-seen';
import { logWarn } from '@/lib/log';

type AdminSupabase = ReturnType<typeof createAdminSupabaseClient>;

const METADATA_CHUNK = 500;

export interface ATSSnapshotResult {
  updated: number;
  reactivated: number;
  removed: number;
  errors: number;
}

/**
 * Reconcile postings fetched from one public ATS board with rows already in
 * RemoteJobs44. This keeps salary, workplace, description and logo metadata
 * current instead of treating every apply URL as an immutable duplicate.
 *
 * Missing postings are retired only when the adapter explicitly guarantees a
 * complete snapshot. Paginated/partial providers pass complete=false, so a
 * truncated response can never remove valid jobs.
 */
export async function syncATSSnapshot(
  supabase: AdminSupabase,
  sourceUrl: string,
  rows: Array<Record<string, any>>,
  complete: boolean,
  context?: string,
): Promise<ATSSnapshotResult> {
  const result: ATSSnapshotResult = { updated: 0, reactivated: 0, removed: 0, errors: 0 };
  const urls = Array.from(new Set(rows.map(row => row.apply_url).filter((url): url is string => !!url)));

  for (let i = 0; i < rows.length; i += METADATA_CHUNK) {
    const payload = rows.slice(i, i + METADATA_CHUNK);
    const { data, error } = await supabase.rpc('update_ats_metadata', {
      p_source_url: sourceUrl,
      p_jobs: payload,
    });
    if (error) {
      result.errors++;
      logWarn({ event: 'ats_snapshot.metadata_failed', context: context ?? null, error: error.message });
      // Preserve the pre-migration freshness behavior if the metadata RPC is
      // temporarily unavailable. This fallback also keeps deployment ordering
      // safe while the additive migration reaches PostgREST's schema cache.
      result.reactivated += await markSeenAndReactivate(supabase, payload.map(row => row.apply_url), context);
      continue;
    }
    const summary = (data && typeof data === 'object') ? data as Record<string, unknown> : {};
    result.updated += Number(summary.updated ?? 0);
    result.reactivated += Number(summary.reactivated ?? 0);
  }

  // An empty complete snapshot is meaningful: the employer has no published
  // roles. The SQL function accepts an empty array and retires that board's
  // active rows. Incomplete providers never enter this branch.
  if (complete) {
    const { data, error } = await supabase.rpc('retire_missing_ats_jobs', {
      p_source_url: sourceUrl,
      p_seen_urls: urls,
    });
    if (error) {
      result.errors++;
      logWarn({ event: 'ats_snapshot.retire_failed', context: context ?? null, error: error.message });
    } else {
      result.removed = Number(data ?? 0);
    }
  }

  return result;
}
