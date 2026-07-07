// End-to-end test of the WP Job Manager source flow against a virtual
// board, exercising the exact chain the ingest pipeline runs for a
// pasted listing-page URL:
//
//   page HTML → tryDiscoveredFeeds (finds /feed/job_feed/)
//             → parseFeed (flavor: wp-job-manager)
//             → feedJobToDbRow (jobs-table shape)
//             → enrichDirectApplyLinks (employer's direct apply target)
//
// Only the Supabase writes are out of scope here (covered by the shapes
// these steps emit: snake_case columns, uniform flag keys, no synthetic
// id, unique apply_url for dedupe).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tryDiscoveredFeeds } from './feed-discovery';
import { feedJobToDbRow } from './feed-parser';
import { enrichDirectApplyLinks } from './apply-link';

// The discovery + enrichment paths now resolve hosts through the DNS-aware SSRF
// guard. Stub the DNS-aware validator to reuse the real string-only guard so
// the reserved `.example` virtual-board hosts pass without a real lookup, while
// literal internal hosts stay blocked.
vi.mock('@/lib/ssrf-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ssrf-guard')>();
  return { ...actual, validateExternalUrlAndResolve: async (raw: string) => actual.validateExternalUrl(raw) };
});

const ORIGIN = 'https://www.club.example';
const PAGE = `${ORIGIN}/jobs/`;

const LISTING_PAGE = `<!doctype html><html><head>
<link rel="alternate" type="application/rss+xml" title="Club » Feed" href="${ORIGIN}/feed/" />
<link rel="stylesheet" href="/wp-content/plugins/wp-job-manager/assets/dist/css/frontend.css" />
</head><body>
<ul class="job_listings">
  <li class="job_listing"><a href="${ORIGIN}/job/social-media-manager/">Social Media Manager</a></li>
</ul>
</body></html>`;

const JOB_FEED = `<?xml version="1.0"?>
<rss version="2.0" xmlns:job_listing="https://wpjobmanager.com">
<channel><title>Club » job feed</title>
<item>
  <title>Social Media Manager</title>
  <link>${ORIGIN}/job/social-media-manager/</link>
  <pubDate>Tue, 09 Jun 2026 10:00:00 +0000</pubDate>
  <description><![CDATA[Run our socials.]]></description>
  <job_listing:location>Remote, UK</job_listing:location>
  <job_listing:job_type>Full Time</job_listing:job_type>
  <job_listing:company>Acme Studio</job_listing:company>
</item>
<item>
  <title>Content Creator</title>
  <link>${ORIGIN}/job/content-creator/</link>
  <pubDate>Mon, 08 Jun 2026 09:00:00 +0000</pubDate>
  <description><![CDATA[Make things.]]></description>
  <job_listing:company>Beta GmbH</job_listing:company>
</item>
</channel></rss>`;

const DETAIL_SMM = `<!doctype html><html><body>
<div class="application_details">
  <a href="https://boards.greenhouse.io/acmestudio/jobs/77" rel="nofollow" target="_blank">Apply on Greenhouse</a>
</div></body></html>`;

const DETAIL_CC = `<!doctype html><html><body>
<div class="application_details">
  <a class="job_application_email" href="mailto:jobs@beta.example">jobs@beta.example</a>
</div></body></html>`;

const SITE: Record<string, { body: string; type: string }> = {
  [`${ORIGIN}/feed/job_feed/?posts_per_page=50`]: { body: JOB_FEED, type: 'application/rss+xml' },
  [`${ORIGIN}/job/social-media-manager/`]:        { body: DETAIL_SMM, type: 'text/html' },
  [`${ORIGIN}/job/content-creator/`]:             { body: DETAIL_CC, type: 'text/html' },
};

function virtualFetch(url: string | URL): Promise<Response> {
  const hit = SITE[url.toString()];
  if (!hit) return Promise.resolve(new Response('not found', { status: 404 }));
  return Promise.resolve(new Response(hit.body, { status: 200, headers: { 'content-type': hit.type } }));
}

afterEach(() => vi.unstubAllGlobals());

describe('WP Job Manager source, end to end', () => {
  it('turns a pasted listing page into employer-linked job rows', async () => {
    vi.stubGlobal('fetch', vi.fn(virtualFetch));

    // 1. The pasted URL served HTML — discovery resolves the job feed.
    const found = await tryDiscoveredFeeds(LISTING_PAGE, PAGE);
    expect(found).not.toBeNull();
    expect(found!.feedUrl).toBe(`${ORIGIN}/feed/job_feed/?posts_per_page=50`);
    expect(found!.parsed.flavor).toBe('wp-job-manager');
    expect(found!.parsed.jobs).toHaveLength(2);

    // 2. Convert to jobs-table rows (what the pipeline upserts).
    let rows = found!.parsed.jobs
      .map(j => feedJobToDbRow(j, PAGE))
      .filter((j): j is Record<string, any> => !!j);
    expect(rows).toHaveLength(2);
    expect(rows[0].company).toBe('Acme Studio');
    expect(rows[0].location).toBe('Remote, UK');
    expect(rows[0].flagged).toBe(false);

    // 3. WPJM handling: detail page becomes the per-item source_url,
    //    apply_url becomes the employer's direct target.
    rows = rows.map(r => ({ ...r, source_url: r.apply_url }));
    const enriched = await enrichDirectApplyLinks(rows);

    expect(enriched.fetched).toBe(2);
    expect(enriched.rows[0].apply_url).toBe('https://boards.greenhouse.io/acmestudio/jobs/77');
    expect(enriched.rows[0].source_url).toBe(`${ORIGIN}/job/social-media-manager/`);

    // Email-only application: board link stays, email captured.
    expect(enriched.rows[1].apply_url).toBe(`${ORIGIN}/job/content-creator/`);
    expect(enriched.rows[1].apply_email).toBe('jobs@beta.example');
    expect(enriched.rows[1].source_url).toBe(`${ORIGIN}/job/content-creator/`);

    // Rows are insertable as-is: no synthetic id, uniform flag keys,
    // distinct apply_url for the unique-index dedupe.
    for (const r of enriched.rows) {
      expect(r.id).toBeUndefined();
      expect(r.flagged).toBe(false);
      expect(r.flagged_reason).toBeNull();
    }
    expect(new Set(enriched.rows.map(r => r.apply_url)).size).toBe(2);
  });

  it('degrades to board links when detail pages are unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => {
      const u = url.toString();
      if (u.includes('/job/')) return Promise.resolve(new Response('blocked', { status: 403 }));
      return virtualFetch(url);
    }));

    const found = await tryDiscoveredFeeds(LISTING_PAGE, PAGE);
    const rows = found!.parsed.jobs
      .map(j => feedJobToDbRow(j, PAGE))
      .filter((j): j is Record<string, any> => !!j)
      .map(r => ({ ...r, source_url: r.apply_url }));

    const enriched = await enrichDirectApplyLinks(rows);
    expect(enriched.failed).toBe(2);
    // Jobs still land, linking to the board page — degraded, not dropped.
    expect(enriched.rows[0].apply_url).toBe(`${ORIGIN}/job/social-media-manager/`);
    expect(enriched.rows[1].apply_url).toBe(`${ORIGIN}/job/content-creator/`);
  });
});
