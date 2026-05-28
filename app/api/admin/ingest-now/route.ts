// app/api/admin/ingest-now/route.ts
// Lets an admin trigger the full job ingestion pipeline from the admin UI
// without needing to wait for the next cron tick or expose CRON_SECRET.
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { runIngest } from '@/lib/ingest-pipeline';
import { logError } from '@/lib/log';

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const result = await runIngest();
    return NextResponse.json(result);
  } catch (err: any) {
    logError({ event: 'admin.ingest_now.failed', error: err?.message ?? String(err) });
    return NextResponse.json({ error: err.message ?? 'Failed' }, { status: 500 });
  }
}
