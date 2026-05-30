// app/api/yc/route.ts — YC companies API via yc-oss community project
// FREE — no key, no auth — returns 1400+ hiring YC companies
// Each company has website, batch, isHiring, Greenhouse/Lever links etc.
// We then cross-reference each company's ATS board to get actual job listings
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getIP } from '@/lib/rate-limit';

const YC_API = 'https://yc-oss.github.io/api/companies/hiring.json';

export const revalidate = 3600; // re-fetch hourly

export async function GET(req: NextRequest) {
  // Per-IP rate limit. The route was unauthenticated and served a 1400-
  // company list per request — a scraper could mirror our endpoint
  // without ever touching the upstream YC mirror (which we cache for an
  // hour). 60/min is well above any UI-driven pagination.
  const ip = getIP(req);
  const rl = rateLimit(`yc:${ip}`, 60, 60_000);
  if (!rl.success) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'Too many requests.', sources: [], total: 0 },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const q      = req.nextUrl.searchParams.get('q') ?? '';
  const remote = req.nextUrl.searchParams.get('remote') === 'true';
  // Clamp limit / offset so `?limit=99999999` doesn't ship a giant
  // payload and `?limit=-5` (slice's negative-from-end semantic) can't
  // produce a confusing response.
  const rawLimit  = parseInt(req.nextUrl.searchParams.get('limit')  ?? '50', 10);
  const rawOffset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0',  10);
  const limit  = Number.isFinite(rawLimit)  && rawLimit  > 0 ? Math.min(rawLimit,  100)    : 50;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.min(rawOffset, 10000) : 0;

  try {
    const res = await fetch(YC_API, {
      headers: { 'User-Agent': 'RemoteJobs44/1.0' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`YC API error: ${res.status}`);

    let companies: any[] = await res.json();

    // Filter
    if (q) {
      const ql = q.toLowerCase();
      companies = companies.filter(c =>
        c.name?.toLowerCase().includes(ql) ||
        c.one_liner?.toLowerCase().includes(ql) ||
        c.industry?.toLowerCase().includes(ql) ||
        (c.tags ?? []).some((t: string) => t.toLowerCase().includes(ql))
      );
    }

    if (remote) {
      companies = companies.filter(c =>
        (c.regions ?? []).some((r: string) => r.toLowerCase().includes('remote'))
      );
    }

    const total = companies.length;
    const page = companies.slice(offset, offset + limit);

    // Convert to our job source format
    const sources = page.map(normalizeYCCompany);

    return NextResponse.json({
      sources,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
      method: 'yc-public-api',
      apiInfo: 'Free — yc-oss.github.io community project, updated daily',
    });
  } catch (err: any) {
    // YC mirror failures (network, JSON parse, etc.) — log raw, return
    // generic. err.message can include the upstream YC API URL.
    // eslint-disable-next-line no-console
    console.error('[yc.fetch] failed:', err?.message ?? String(err));
    return NextResponse.json({ sources: [], total: 0, error: 'Could not load YC companies.' }, { status: 200 });
  }
}

function normalizeYCCompany(c: any) {
  return {
    id: `yc_${c.slug}`,
    name: c.name,
    slug: c.slug,
    website: c.website,
    logo: c.small_logo_thumb_url,
    description: c.one_liner,
    industry: c.industry,
    batch: c.batch,
    stage: c.stage,
    status: c.status,
    teamSize: c.team_size,
    isHiring: c.isHiring,
    remote: (c.regions ?? []).some((r: string) => r.toLowerCase().includes('remote')),
    regions: c.regions ?? [],
    tags: c.tags ?? [],
    ycUrl: c.url,
    // The yc-oss API doesn't have direct ATS links, but each company
    // page at ycombinator.com/companies/slug has them. We link to workatastartup.
    jobsUrl: `https://www.workatastartup.com/companies/${c.slug}`,
    source: 'yc',
  };
}
