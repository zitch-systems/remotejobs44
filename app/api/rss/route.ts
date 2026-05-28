// app/api/rss/route.ts — Server-side RSS fetcher & parser.
// Hardened against SSRF: the user-supplied URL is validated by
// lib/ssrf-guard before we fetch anything, blocking loopback,
// private IPv4 ranges, cloud metadata endpoints, and IPv6 literals.
import { NextRequest, NextResponse } from 'next/server';
import { parseFeed } from '@/lib/feed-parser';
import { validateExternalUrl } from '@/lib/ssrf-guard';
import { requireAdmin } from '@/lib/admin/auth';

// Note: this route is admin-gated, so the Node runtime (default) is required
// — requireAdmin reads cookies + makes a Supabase query. Drop the previous
// `runtime = 'edge'` since edge can't host the admin client.
export const revalidate = 300; // 5 minutes

export async function GET(req: NextRequest) {
  // Admin-only. The SSRF guard below already blocks internal IPs, but the
  // route is still a generic outbound fetcher — gating prevents anonymous
  // abuse as a relay against third-party sites.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) return NextResponse.json({ error: 'url required' }, { status: 400 });

  const v = validateExternalUrl(raw);
  if (!v.ok) {
    return NextResponse.json({ error: v.error, jobs: [] }, { status: 400 });
  }
  const url = v.url.toString();

  try {
    // Fetch the RSS/XML with a browser-like UA
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RemoteJobs44/1.0; +https://remotejobs44.com)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
      },
      signal: AbortSignal.timeout(10000),
      // Prevent the fetch from following redirects into a previously-blocked
      // private host. (Next.js edge fetch defaults to follow; manual gives us
      // a chance to re-validate — but the simplest fix is to reject 3xx.)
      redirect: 'error',
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Upstream error: ${res.status}`, jobs: [] }, { status: 200 });
    }

    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.text();

    const parsed = parseFeed(text, contentType, url);
    if (parsed.method === 'unknown') {
      return NextResponse.json({ error: parsed.error ?? 'Unrecognised feed format', jobs: [] }, { status: 200 });
    }
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: err.message, jobs: [] }, { status: 200 });
  }
}
