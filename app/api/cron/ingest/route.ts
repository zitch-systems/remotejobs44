// app/api/cron/ingest/route.ts — manual ingest re-trigger.
// Pipeline lives in lib/ingest-pipeline.ts so the admin "run now" endpoint
// can call it without exporting non-handler symbols from this route file.
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { runIngest } from '@/lib/ingest-pipeline';
import { requireCronSecret } from '@/lib/cron-auth';
import { logWarn } from '@/lib/log';

export async function GET(req: NextRequest) {
  const auth = requireCronSecret(req, 'cron.ingest');
  if (!auth.ok) return auth.res;
  const result = await runIngest();
  // Flush /jobs cache when the ingest actually added rows so the freshly
  // imported jobs appear on the next public request instead of waiting
  // for the 60s ISR tick. No flush when totalAdded=0 — avoids dropping
  // a warm cache for a no-op run.
  if (result.totalAdded > 0) {
    try { revalidatePath('/jobs'); }
    catch (err: any) { logWarn({ event: 'cron.ingest.revalidate_failed', error: err?.message ?? String(err) }); }
  }
  return NextResponse.json(result);
}
