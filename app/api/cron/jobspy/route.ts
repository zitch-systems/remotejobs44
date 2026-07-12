// app/api/cron/jobspy/route.ts
//
// Dedicated daily JobSpy scrape — runs at 12:00 UTC via vercel.json, on its
// own schedule and lock so it doesn't compete with the 06:00 feed ingest.
//
// JobSpy (LinkedIn / Indeed / ZipRecruiter / Google Jobs, via the self-hosted
// JobSpy API) is a slow scraper that used to get starved at the tail of the
// daily cron's shared 60s budget. Here it gets its own function budget and
// works through the full query set (rotated by day so coverage comes round),
// dropping any posting already on the platform from another source before it
// inserts — the whole flow lives in runJobSpyIngest (lib/ingest-pipeline.ts).
//
// A no-op when JOBSPY_API_URL is unset: runJobSpyIngest returns skipped=true
// and this route 200s without touching the DB.
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { runJobSpyIngest } from '@/lib/ingest-pipeline';
import { requireCronSecret } from '@/lib/cron-auth';
import { logWarn } from '@/lib/log';

export async function GET(req: NextRequest) {
  const auth = requireCronSecret(req, 'cron.jobspy');
  if (!auth.ok) return auth.res;

  // Leave a little headroom under the route's maxDuration (120s) so the
  // in-flight query can finish and the lock releases cleanly.
  const result = await runJobSpyIngest({ budgetMs: 100_000 });

  // Flush /jobs only when we actually added rows, so a no-op run doesn't
  // drop a warm cache.
  if (result.totalAdded > 0) {
    try { revalidatePath('/jobs'); }
    catch (err: any) { logWarn({ event: 'cron.jobspy.revalidate_failed', error: err?.message ?? String(err) }); }
  }
  return NextResponse.json(result);
}
