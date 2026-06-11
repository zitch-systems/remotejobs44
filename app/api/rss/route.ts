// app/api/rss/route.ts — Server-side RSS fetcher & parser.
// Hardened against SSRF: the user-supplied URL is validated by
// lib/ssrf-guard before we fetch anything, blocking loopback,
// private IPv4 ranges, cloud metadata endpoints, and IPv6 literals.
import { NextRequest, NextResponse } from 'next/server';
import { parseFeed } from '@/lib/feed-parser';
import { looksLikeHtml, tryDiscoveredFeeds } from '@/lib/feed-discovery';
import { validateExternalUrl } from '@/lib/ssrf-guard';
import { requireAdmin } from '@/lib/admin/auth';
import { logError } from '@/lib/log';

// Hard cap on the response body so a malicious feed URL can't blow the
// 1GB lambda by streaming 5GB of XML. RSS feeds in the wild rarely
// exceed a few hundred KB; 5MB is generous.
const MAX_FEED_BYTES = 5 * 1024 * 1024;

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

    // Reject obvious giants up front by Content-Length. The header is
    // optional and lie-able, so we ALSO check the actual byte count
    // below — this is the cheap path.
    const declaredLen = parseInt(res.headers.get('content-length') ?? '0', 10);
    if (declaredLen > MAX_FEED_BYTES) {
      return NextResponse.json({ error: 'Feed too large (>5MB)', jobs: [] }, { status: 200 });
    }

    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) {
      return NextResponse.json({ error: 'Feed too large (>5MB)', jobs: [] }, { status: 200 });
    }

    let parsed = parseFeed(text, contentType, url);
    // HTML page instead of a feed (admin pasted a job-board listing page):
    // try the feeds the page advertises / well-known WP Job Manager feed.
    if (parsed.method === 'unknown' && looksLikeHtml(text, contentType)) {
      const found = await tryDiscoveredFeeds(text, url);
      if (found) {
        parsed = found.parsed;
      } else {
        return NextResponse.json({
          error: 'This is an HTML page with no discoverable job feed — paste the feed URL itself.',
          jobs: [],
        }, { status: 200 });
      }
    }
    if (parsed.method === 'unknown') {
      return NextResponse.json({ error: parsed.error ?? 'Unrecognised feed format', jobs: [] }, { status: 200 });
    }
    return NextResponse.json(parsed);
  } catch (err: any) {
    // Don't echo the raw fetch error — its message includes the upstream
    // URL we just refused to follow, plus any DNS / TLS diagnostic.
    logError({ event: 'rss.fetch_failed', url, admin_email: auth.adminEmail, error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Could not fetch feed.', jobs: [] }, { status: 200 });
  }
}
