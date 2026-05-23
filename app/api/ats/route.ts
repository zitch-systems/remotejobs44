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

// POST: bulk-detect many URLs at once
export async function POST(req: NextRequest) {
  try {
    const { urls }: { urls: string[] } = await req.json();
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'urls array required' }, { status: 400 });
    }
    if (urls.length > 500) {
      return NextResponse.json({ error: 'Max 500 URLs per batch' }, { status: 400 });
    }

    // Fast pre-detection (no HTTP requests for direct ATS URLs)
    const preDetected = urls.map(url => {
      const detected = detectATSFromUrl(url.trim());
      return {
        url: url.trim(),
        detected,
        platform: detected?.platform ?? 'unknown',
        slug: detected?.slug ?? '',
        apiEndpoint: detected?.apiEndpoint ?? null,
        confidence: detected?.confidence ?? null,
        status: detected ? 'detected' : 'needs-scraping',
      };
    });

    const stats = {
      total: preDetected.length,
      greenhouse: preDetected.filter(r => r.platform === 'greenhouse').length,
      lever: preDetected.filter(r => r.platform === 'lever').length,
      ashby: preDetected.filter(r => r.platform === 'ashby').length,
      workable: preDetected.filter(r => r.platform === 'workable').length,
      recruitee: preDetected.filter(r => r.platform === 'recruitee').length,
      needsScraping: preDetected.filter(r => r.status === 'needs-scraping').length,
    };

    return NextResponse.json({ results: preDetected, stats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
