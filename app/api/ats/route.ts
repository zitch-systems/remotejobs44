// app/api/ats/route.ts — Unified ATS fetcher: Greenhouse, Lever, Ashby, Workable, Recruitee
import { NextRequest, NextResponse } from 'next/server';
import { autoFetchFromCareerUrl, fetchATSJobs } from '@/lib/ats-engine';
import { isValidATSPlatform } from '@/lib/ats-detect';
import { requireAdmin } from '@/lib/admin/auth';
import { validateExternalUrlAndResolve } from '@/lib/ssrf-guard';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
// `revalidate` is a no-op on POST/admin-driven routes; removed to stop
// shipping a misleading signal in the bundle.

export async function GET(req: NextRequest) {
  // Admin-only: this route lets the caller fetch arbitrary user-supplied URLs
  // through our infra (including the puppeteer fallback in step-3). Without
  // a guard, anyone could probe internal networks or rate-burn our chromium.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const url         = req.nextUrl.searchParams.get('url');
  const platformRaw = req.nextUrl.searchParams.get('platform');
  const slug        = req.nextUrl.searchParams.get('slug');

  if (!url && !(platformRaw && slug)) {
    return NextResponse.json({ error: 'Provide url OR platform+slug' }, { status: 400 });
  }

  // SSRF guard for the auto-detect path. Without this, the step-2 plain
  // fetch in lib/ats-engine.ts could pivot into 169.254.169.254 et al.
  // (render-js already has its own guard, but step-2 hits fetch directly.)
  if (url) {
    const validation = await validateExternalUrlAndResolve(url);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
  }

  try {
    if (platformRaw && slug) {
      // Validate `platform` against the ATSPlatform allowlist before
      // building the URL. The previous unsafe cast let an admin (or admin-
      // session XSS) pass `platform=internal.example.com/x?#` and coerce
      // an outbound fetch to an attacker-controlled host.
      if (!isValidATSPlatform(platformRaw)) {
        return NextResponse.json({ error: 'Unknown ATS platform' }, { status: 400 });
      }
      // Slug also gets a minimal shape check — letters/numbers/dot/dash/
      // underscore only, so `slug=evil.com?` can't introduce a new host.
      if (!/^[a-z0-9._-]{1,100}$/i.test(slug)) {
        return NextResponse.json({ error: 'Invalid slug shape' }, { status: 400 });
      }
      const result = await fetchATSJobs(platformRaw, slug, `https://${platformRaw}/${slug}`);
      return NextResponse.json(result);
    }
    const result = await autoFetchFromCareerUrl(url!);
    return NextResponse.json(result);
  } catch (err: any) {
    // ATS engine errors include the upstream URL we just fetched —
    // sometimes a puppeteer trace too. Log raw, return generic.
    logError({ event: 'ats.fetch_failed', admin_email: auth.adminEmail, error: err?.message ?? String(err) });
    return NextResponse.json({ jobs: [], total: 0, error: 'ATS fetch failed.' }, { status: 200 });
  }
}
