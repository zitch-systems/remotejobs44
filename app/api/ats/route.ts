// app/api/ats/route.ts — Unified ATS fetcher: Greenhouse, Lever, Ashby, Workable, Recruitee
import { NextRequest, NextResponse } from 'next/server';
import { autoFetchFromCareerUrl, fetchATSJobs, detectATSFromUrl, type ATSPlatform } from '@/lib/ats-engine';

export const runtime = 'nodejs';
export const revalidate = 300;

export async function GET(req: NextRequest) {
  const url      = req.nextUrl.searchParams.get('url');
  const platform = req.nextUrl.searchParams.get('platform') as ATSPlatform | null;
  const slug     = req.nextUrl.searchParams.get('slug');

  if (!url && !(platform && slug)) {
    return NextResponse.json({ error: 'Provide url OR platform+slug' }, { status: 400 });
  }

  try {
    // Direct slug+platform mode (fastest)
    if (platform && slug) {
      const result = await fetchATSJobs(platform, slug, `https://${platform}/${slug}`);
      return NextResponse.json(result);
    }

    // Auto-detect mode from URL
    const result = await autoFetchFromCareerUrl(url!);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ jobs: [], total: 0, error: err.message }, { status: 200 });
  }
}
