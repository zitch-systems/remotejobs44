// lib/feed-discovery.ts — Resolve an HTML page to its job feed.
//
// Admins paste job-board listing pages (e.g. a WordPress board's /jobs/
// page) into /admin/sources expecting them to "just work". The page is
// HTML, which lib/feed-parser can't parse — but most boards expose a
// machine-readable feed the page links to, or (for WP Job Manager) a
// well-known endpoint. This module finds those candidate feed URLs so
// the ingest pipeline and the /api/rss preview can retry against the
// real feed instead of erroring with "Unrecognised feed format".
import { parseFeed, type ParsedFeed } from '@/lib/feed-parser';
import { validateExternalUrlAndResolve } from '@/lib/ssrf-guard';

// <link rel="alternate"> types that denote a syndication feed.
const FEED_LINK_TYPES = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
  'application/json',
]);

// Candidates are guesses; cap how many we'll fetch per source so a
// pathological page can't turn one ingest slot into a crawl.
const MAX_CANDIDATES = 4;
const CANDIDATE_TIMEOUT_MS = 10_000;
// Same cap as /api/rss — a feed bigger than this is not a feed.
const MAX_FEED_BYTES = 5 * 1024 * 1024;

export function looksLikeHtml(body: string, contentType: string): boolean {
  if (contentType.toLowerCase().includes('text/html')) return true;
  return /<!doctype\s+html|<html[\s>]/i.test(body.slice(0, 2000));
}

// Ordered, deduped, absolute candidate feed URLs for an HTML page.
export function discoverFeedCandidates(html: string, pageUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }

  // Feed <link>s live in <head>; don't regex-scan a multi-MB body.
  const head = html.slice(0, 200_000);
  const candidates: string[] = [];

  const isWordPress =
    /\/wp-content\/|\/wp-includes\//i.test(html) ||
    /name=["']generator["'][^>]*WordPress/i.test(head);
  const hasWpJobManager =
    /wp-job-manager/i.test(html) ||
    /class=["'][^"']*\bjob_listings?\b/i.test(html);

  // WP Job Manager stores jobs as a custom post type, so they're absent
  // from the site's main /feed/. The plugin always registers a jobs-only
  // feed at ?feed=job_feed. Pretty form first: with pretty permalinks on,
  // WP 301s the query form to it, and our redirect:'error' fetches die on
  // the hop. posts_per_page is honoured by the plugin (default is 10).
  if (hasWpJobManager) {
    candidates.push(
      `${origin}/feed/job_feed/?posts_per_page=50`,
      `${origin}/?feed=job_feed&posts_per_page=50`,
    );
  }

  // Feeds advertised in <head> via <link rel="alternate">. Skipped for
  // WordPress pages: WP advertises the blog-posts feed there, and
  // ingesting articles as jobs is worse than failing loudly.
  if (!isWordPress) {
    for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
      const attrs = parseAttrs(tag);
      const rel = (attrs.rel ?? '').toLowerCase();
      const type = (attrs.type ?? '').toLowerCase();
      const href = attrs.href ?? '';
      const title = (attrs.title ?? '').toLowerCase();
      if (!rel.split(/\s+/).includes('alternate')) continue;
      if (!FEED_LINK_TYPES.has(type)) continue;
      // Comment feeds parse as valid RSS but their items are comments,
      // which would land in the jobs table as garbage rows.
      if (!href || title.includes('comment') || /comments/i.test(href)) continue;
      try {
        const abs = new URL(href, pageUrl);
        if (abs.protocol === 'http:' || abs.protocol === 'https:') {
          candidates.push(abs.toString());
        }
      } catch {
        // unresolvable href — skip
      }
    }
  }

  return [...new Set(candidates)].slice(0, MAX_CANDIDATES);
}

export interface DiscoveredFeed {
  parsed: ParsedFeed;
  feedUrl: string;
}

// Fetch each candidate (SSRF-validated, redirects refused — same policy
// as the pipeline's primary fetch) and return the first that parses into
// a non-empty feed. Individual candidate failures are expected (guessed
// URLs 404 on many sites) and swallowed; `null` means the page has no
// usable feed.
export async function tryDiscoveredFeeds(html: string, pageUrl: string): Promise<DiscoveredFeed | null> {
  for (const candidate of discoverFeedCandidates(html, pageUrl)) {
    // DNS-aware guard: a discovered <link rel="alternate"> href is third-party
    // content, so a public hostname that resolves to an internal/metadata IP
    // must be rejected — the string-only validator can't see the A record.
    const v = await validateExternalUrlAndResolve(candidate);
    if (!v.ok) continue;
    try {
      const res = await fetch(v.url.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RemoteJobs44/1.0; +https://remotejobs44.com)',
          'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, application/json, */*',
        },
        signal: AbortSignal.timeout(CANDIDATE_TIMEOUT_MS),
        redirect: 'error',
      });
      if (!res.ok) continue;
      // Reject giants by declared Content-Length before buffering (header is
      // lie-able, so the post-buffer check stays as the real cap).
      if (parseInt(res.headers.get('content-length') ?? '0', 10) > MAX_FEED_BYTES) continue;
      const body = await res.text();
      if (body.length > MAX_FEED_BYTES) continue;
      // sourceUrl stays the page the admin registered, so ingested jobs
      // trace back to the job_sources row, not the resolved feed.
      const parsed = parseFeed(body, res.headers.get('content-type') ?? '', pageUrl);
      if (parsed.method !== 'unknown' && parsed.jobs.length > 0) {
        return { parsed, feedUrl: v.url.toString() };
      }
    } catch {
      // network error / timeout / redirect — try the next candidate
    }
  }
  return null;
}

function parseAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
  }
  return out;
}
