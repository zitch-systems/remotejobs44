// app/api/admin/jobspy/search/route.ts
// Admin-only: runs a live JobSpy search and returns the normalised jobs for
// preview ("list all jobs available"). This is read-only — it does NOT write
// to the jobs table. The admin reviews the results, then persists the ones
// they want via /api/ats/save (same path the AI-discovery console uses). The
// daily cron ingests JobSpy automatically; this route is the on-demand,
// look-before-you-import surface.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';
import { isJobSpyConfigured, fetchJobSpyJobs } from '@/lib/jobspy';
import { logError } from '@/lib/log';

// Scrapers are slower than plain feeds — give the lambda room to finish a
// multi-board search before Vercel cuts it off.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  if (!isJobSpyConfigured()) {
    return NextResponse.json(
      { error: 'JobSpy is not configured. Set JOBSPY_API_URL (and optionally JOBSPY_API_KEY) and redeploy.' },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const searchTerm = String(body.searchTerm ?? body.query ?? '').trim();
  if (!searchTerm) {
    return NextResponse.json({ error: 'searchTerm is required' }, { status: 400 });
  }

  // Clamp / sanitise the caller-supplied knobs so a fat-fingered value can't
  // push the upstream scrape into an unbounded or degenerate request.
  const sites = Array.isArray(body.sites)
    ? body.sites.map((s: unknown) => String(s)).slice(0, 6)
    : undefined;
  const resultsWanted = Number.isFinite(Number(body.resultsWanted))
    ? Math.min(200, Math.max(1, Math.round(Number(body.resultsWanted))))
    : 40;
  const hoursOld = Number.isFinite(Number(body.hoursOld)) && Number(body.hoursOld) > 0
    ? Math.min(24 * 30, Math.round(Number(body.hoursOld)))
    : undefined;
  const location = body.location ? String(body.location).trim().slice(0, 120) : undefined;
  const jobType  = body.jobType ? String(body.jobType).trim().slice(0, 40) : undefined;
  const isRemote = body.isRemote === false ? false : true;

  try {
    const jobs = await fetchJobSpyJobs({ searchTerm, location, sites, resultsWanted, hoursOld, isRemote, jobType });

    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'jobspy.search', targetType: null, targetId: null,
      metadata: { searchTerm, sites: sites ?? 'default', resultsWanted, found: jobs.length },
    });

    return NextResponse.json({ jobs, count: jobs.length });
  } catch (err: any) {
    // Upstream errors can carry the JobSpy host + scrape diagnostics — keep
    // those in the logs, return a generic message to the browser.
    logError({ event: 'admin.jobspy.search_failed', searchTerm, error: err?.message ?? String(err) });
    return NextResponse.json(
      { error: 'JobSpy search failed. Check the JobSpy API service and server logs.' },
      { status: 502 },
    );
  }
}
