// app/api/admin/jobspy/route.ts
// Admin-only: returns whether JobSpy is configured and the default board /
// query set, so the /admin/jobspy console can render a setup hint instead of
// silently failing when JOBSPY_API_URL isn't set. Never exposes the API key.
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { getJobSpyConfig } from '@/lib/jobspy';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  return NextResponse.json(getJobSpyConfig());
}
