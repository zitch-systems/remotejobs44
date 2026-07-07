import { describe, it, expect, vi, afterEach } from 'vitest';
import { discoverFeedCandidates, looksLikeHtml, tryDiscoveredFeeds } from './feed-discovery';

// tryDiscoveredFeeds now resolves candidate hosts through the DNS-aware SSRF
// guard. Reserved `.example` test hosts never resolve (NXDOMAIN → blocked), so
// stub the DNS-aware validator to reuse the real string-only guard: literal
// internal hosts (localhost, private IPs) are still rejected, but resolvable
// public test hosts pass without a real lookup.
vi.mock('@/lib/ssrf-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ssrf-guard')>();
  return { ...actual, validateExternalUrlAndResolve: async (raw: string) => actual.validateExternalUrl(raw) };
});

const PAGE = 'https://www.club.example/jobs/';

// Minimal WP Job Manager listing page: WP asset paths + the plugin's
// job_listings markup, plus the blog-posts feed WP advertises in <head>
// (which must NOT be picked up — its items are articles, not jobs).
const WPJM_HTML = `<!doctype html>
<html><head>
<link rel="alternate" type="application/rss+xml" title="Club » Feed" href="https://www.club.example/feed/" />
<link rel="alternate" type="application/rss+xml" title="Club » Comments Feed" href="https://www.club.example/comments/feed/" />
<link rel="stylesheet" href="/wp-content/plugins/wp-job-manager/assets/dist/css/frontend.css" />
</head><body>
<ul class="job_listings"><li class="job_listing"><a href="/job/x/">X</a></li></ul>
</body></html>`;

const NON_WP_HTML = `<!DOCTYPE HTML>
<html><head>
<link rel="alternate" type="application/rss+xml" title="Jobs" href="/jobs.rss">
<link rel="alternate" type="application/feed+json" href="https://board.example/feed.json">
<link rel="alternate" type="application/rss+xml" title="Comments on stuff" href="/comments.rss">
<link rel="stylesheet" href="/styles.css">
<link rel="alternate" type="text/html" href="/mobile">
</head><body>jobs here</body></html>`;

const FEED_XML = `<rss><channel>
<item><title>Social Media Manager</title><link>https://www.club.example/job/smm/</link>
<job_listing:company>Acme</job_listing:company></item>
</channel></rss>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('looksLikeHtml', () => {
  it('detects via content-type and via markup', () => {
    expect(looksLikeHtml('whatever', 'text/html; charset=utf-8')).toBe(true);
    expect(looksLikeHtml('<!doctype html><html>', '')).toBe(true);
    expect(looksLikeHtml('<HTML lang="en">', '')).toBe(true);
    expect(looksLikeHtml('<rss><channel></channel></rss>', 'application/rss+xml')).toBe(false);
    expect(looksLikeHtml('{"jobs":[]}', 'application/json')).toBe(false);
  });
});

describe('discoverFeedCandidates', () => {
  it('returns WP Job Manager job_feed candidates, pretty form first', () => {
    expect(discoverFeedCandidates(WPJM_HTML, PAGE)).toEqual([
      'https://www.club.example/feed/job_feed/?posts_per_page=50',
      'https://www.club.example/?feed=job_feed&posts_per_page=50',
    ]);
  });

  it('never returns the WP blog/comments feeds for WordPress pages', () => {
    const wpNoJobs = WPJM_HTML.replace(/job_listings?|wp-job-manager/g, 'content');
    expect(discoverFeedCandidates(wpNoJobs, PAGE)).toEqual([]);
  });

  it('resolves advertised feeds on non-WP pages, skipping comments and non-feed links', () => {
    expect(discoverFeedCandidates(NON_WP_HTML, 'https://board.example/jobs')).toEqual([
      'https://board.example/jobs.rss',
      'https://board.example/feed.json',
    ]);
  });

  it('returns nothing for an unparsable page URL', () => {
    expect(discoverFeedCandidates(WPJM_HTML, 'not a url')).toEqual([]);
  });
});

describe('tryDiscoveredFeeds', () => {
  it('returns the first candidate that yields jobs', async () => {
    const fetchMock = vi.fn()
      // pretty permalink form 404s on this hypothetical site…
      .mockResolvedValueOnce(new Response('nope', { status: 404 }))
      // …query form serves the feed
      .mockResolvedValueOnce(new Response(FEED_XML, {
        status: 200,
        headers: { 'content-type': 'application/rss+xml' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const found = await tryDiscoveredFeeds(WPJM_HTML, PAGE);
    expect(found).not.toBeNull();
    expect(found!.feedUrl).toBe('https://www.club.example/?feed=job_feed&posts_per_page=50');
    expect(found!.parsed.method).toBe('rss');
    expect(found!.parsed.jobs[0].company).toBe('Acme');
    // jobs keep the page the admin registered as their source
    expect(found!.parsed.jobs[0].sourceUrl).toBe(PAGE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when every candidate fails or parses empty', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(new Response('<rss><channel></channel></rss>', {
        status: 200,
        headers: { 'content-type': 'application/rss+xml' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await tryDiscoveredFeeds(WPJM_HTML, PAGE)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never fetches SSRF-blocked candidates', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // page on localhost → candidates resolve to localhost → all blocked
    expect(await tryDiscoveredFeeds(WPJM_HTML, 'http://localhost/jobs/')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
