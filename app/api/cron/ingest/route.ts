// app/api/cron/ingest/route.ts — manual ingest re-trigger.
// Pipeline lives in lib/ingest-pipeline.ts so the admin "run now" endpoint
// can call it without exporting non-handler symbols from this route file.
import { NextRequest, NextResponse } from 'next/server';
import { runIngest } from '@/lib/ingest-pipeline';
import { requireCronSecret } from '@/lib/cron-auth';

export async function GET(req: NextRequest) {
  const auth = requireCronSecret(req, 'cron.ingest');
  if (!auth.ok) return auth.res;
  const result = await runIngest();
  return NextResponse.json(result);
}
