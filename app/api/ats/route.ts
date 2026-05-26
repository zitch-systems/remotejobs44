// app/api/ats/route.ts — Unified ATS fetcher: Greenhouse, Lever, Ashby, Workable, Recruitee
import { NextRequest, NextResponse } from 'next/server';
import { autoFetchFromCareerUrl, fetchATSJobs, type ATSPlatform } from '@/lib/ats-engine';
import { requireAdmin } from '@/lib/admin/auth';
import { validateExternalUrl } from '@/lib/ssrf-guard';

export const runtime = 'nodejs';
export const revalidate = 300;

export async function GET(req: NextRequest) {
  // Admin-only: this route lets the caller fetch arbitrary user-supplied URLs
  // through our infra (including the puppeteer fallback in step-3). Without
  // a guard, anyone could probe internal networks or rate-burn our chromium.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const url      = req.nextUrl.searchParams.get('url');
  const platform = req.nextUrl.searchParams.get('platform') as ATSPlatform | null;
  const slug     = req.nextUrl.searchParams.get('slug');

  if (!url && !(platform && slug)) {
    return NextResponse.json({ error: 'Provide url OR platform+slug' }, { status: 400 });
  }

  // SSRF guard for the auto-detect path. Without this, the step-2 plain
  // fetch in lib/ats-engine.ts could pivot into 169.254.169.254 et al.
  // (render-js already has its own guard, but step-2 hits fetch directly.)
  if (url) {
    const validation = validateExternalUrl(url);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
  }

  try {
    if (platform && slug) {
      const result = await fetchATSJobs(platform, slug, `https://${platform}/${slug}`);
      return NextResponse.json(result);
    }
    const result = await autoFetchFromCareerUrl(url!);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ jobs: [], total: 0, error: err.message }, { status: 200 });
  }
}
