// app/api/cron/ats-refresh/route.ts
// Recurring refresh of the ATS company boards already in the jobs table.
//
// The daily cron (app/api/cron/daily) ingests the free aggregator feeds and
// then runs the 60-day staleness sweep — but nothing was ever re-affirming the
// ~34k ATS jobs (source='api'), so they aged out 60 days after insertion even
// while the company still listed them. This route walks the least-recently-
// refreshed boards within a time budget, keeps still-listed postings alive,
// recovers any the sweep had retired, and pulls in new vacancies.
// See lib/ats-refresh.ts. Runs on its own schedule so it never competes with
// the daily cron's expiry/email budget.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { refreshStaleATSBoards } from '@/lib/ats-refresh';
import { requireCronSecret } from '@/lib/cron-auth';
import { logError, logWarn } from '@/lib/log';

export async function GET(req: NextRequest) {
  const auth = requireCronSecret(req, 'cron.ats_refresh');
  if (!auth.ok) return auth.res;

  try {
    const supabase = createAdminSupabaseClient();
    const result = await refreshStaleATSBoards(supabase, { budgetMs: 50_000, maxBoards: 300 });

    // Flush the public listings only when something actually changed, so a
    // no-op run leaves the warm cache alone.
    if (result.added > 0 || result.reactivated > 0) {
      try {
        const { revalidatePath } = await import('next/cache');
        revalidatePath('/jobs');
        revalidatePath('/');
      } catch (err: any) {
        logWarn({ event: 'cron.ats_refresh.revalidate_failed', error: err?.message ?? String(err) });
      }
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    logError({ event: 'cron.ats_refresh.failed', error: err?.message ?? String(err) });
    return NextResponse.json({ success: false, error: 'ats refresh failed' }, { status: 500 });
  }
}
