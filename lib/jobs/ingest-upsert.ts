import type { createAdminSupabaseClient } from '@/lib/supabase/server';
import { logWarn } from '@/lib/log';
type AdminSupabase = ReturnType<typeof createAdminSupabaseClient>;
const JOBS_INSERT_CHUNK = 25;

export async function upsertJobsChunked(
  supabase: AdminSupabase,
  rows: Array<Record<string, any>>,
): Promise<{ inserted: number; failed: number; firstError: string | null }> {
  let inserted = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (let i = 0; i < rows.length; i += JOBS_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + JOBS_INSERT_CHUNK);
    const { data, error } = await supabase
      .from('jobs')
      .upsert(chunk, { onConflict: 'apply_url', ignoreDuplicates: true })
      .select('id');
    if (!error) {
      inserted += data?.length ?? 0;
      continue;
    }
    for (const r of chunk) {
      let attempt = await supabase.from('jobs')
        .upsert(r, { onConflict: 'apply_url', ignoreDuplicates: true }).select('id');
      // A statement timeout/serialization conflict can be transient. Retry
      // once after a short delay; idempotent ON CONFLICT prevents duplicates.
      if (attempt.error && ['57014', '40001', '40P01'].includes(attempt.error.code ?? '')) {
        await new Promise(resolve => setTimeout(resolve, 150));
        attempt = await supabase.from('jobs')
          .upsert(r, { onConflict: 'apply_url', ignoreDuplicates: true }).select('id');
      }
      const { data: one, error: rowErr } = attempt;
      if (rowErr) {
        failed++;
        logWarn({ event: 'ingest.row_insert_failed', source: r.source ?? null,
          code: rowErr.code ?? null, error: rowErr.message });
        if (!firstError) firstError = rowErr.message;
      } else {
        inserted += one?.length ?? 0;
      }
    }
  }
  return { inserted, failed, firstError };
}

