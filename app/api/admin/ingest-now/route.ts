// app/api/admin/ingest-now/route.ts
// Lets an admin trigger the full job ingestion pipeline from the admin UI
// without needing to wait for the next cron tick or expose CRON_SECRET.
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';
import { runIngest } from '@/lib/ingest-pipeline';
import { refreshStaleATSBoards } from '@/lib/ats-refresh';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { logError, logWarn } from '@/lib/log';

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const result = await runIngest();

    // Also walk a batch of the least-recently-refreshed ATS company boards.
    // The bulk of the catalogue lives here (~34k ATS jobs vs a few hundred
    // from the aggregator feeds): this keeps still-listed postings from ageing
    // out of the 60-day staleness sweep and recovers any it had already
    // retired. maxDuration is 120s for this route, so give it a real budget —
    // clicking "Run now" a few times cycles the whole board set.
    const ats = await refreshStaleATSBoards(createAdminSupabaseClient(), { budgetMs: 60_000, maxBoards: 300 });

    // Flush the public listings when either path changed something.
    if (result.totalAdded > 0 || ats.added > 0 || ats.reactivated > 0) {
      try { revalidatePath('/jobs'); revalidatePath('/'); }
      catch (err: any) { logWarn({ event: 'admin.ingest_now.revalidate_failed', error: err?.message ?? String(err) }); }
    }
    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'ingest.run_now', targetType: null, targetId: null,
      metadata: { totalAdded: result.totalAdded, paused: result.paused, skipped: result.skipped, ats },
    });
    return NextResponse.json({ ...result, ats });
  } catch (err: any) {
    // Pipeline failures often include feed-source hostnames + parser
    // diagnostics — useful in logs, not on a public response shape.
    logError({ event: 'admin.ingest_now.failed', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Ingest failed. Check the server logs.' }, { status: 500 });
  }
}
