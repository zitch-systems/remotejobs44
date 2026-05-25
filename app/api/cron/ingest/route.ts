// app/api/cron/ingest/route.ts — Vercel Cron entry point, runs every 6 hours.
// Pipeline lives in lib/ingest-pipeline.ts so the admin "run now" endpoint
// can call it without exporting non-handler symbols from this route file.
import { NextRequest, NextResponse } from 'next/server';
import { runIngest } from '@/lib/ingest-pipeline';

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const CRON_MIN_LEN = 16;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!CRON_SECRET || CRON_SECRET.length < CRON_MIN_LEN) {
    console.error('[cron/ingest] CRON_SECRET not set or too short');
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 });
  }
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runIngest();
}
