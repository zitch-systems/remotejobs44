import type { MetadataRoute } from 'next';

// Mirror sitemap.ts — use the deploy URL so preview deploys aren't
// pointing search engines at prod.
const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.com').replace(/\/$/, '');

// Explicitly allow /api/og: every page's og:image / twitter:image
// resolves to /api/og?..., and social crawlers (Twitter/X, LinkedIn)
// honour robots.txt when fetching card images. Under longest-match
// precedence this /api/og allow beats the /api/ disallow below, so
// link previews render an image while the rest of /api/ stays blocked.
const ALLOW = ['/', '/api/og'];
// /jobs is a CSR'd search UI; the *canonical* surface for crawlers
// is the programmatic landing tree at /jobs/category|skill|country|
// region|city|industry|timezone/[slug]. Blocking the faceted
// /jobs?...&page=N permutations keeps the crawl budget on the
// pages we actually want indexed.
const DISALLOW = ['/admin', '/api/', '/dashboard', '/applications', '/saved', '/profile', '/auth/', '/jobs?'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ALLOW,
        disallow: DISALLOW,
      },
      // AI crawlers are explicitly welcomed — but a robots group is matched
      // exclusively (a bot uses ITS group, not merged with '*'), so each one
      // must repeat the disallow list or it would be free to crawl /admin,
      // /api/, /dashboard etc. that the '*' group blocks.
      { userAgent: 'GPTBot',        allow: ALLOW, disallow: DISALLOW },
      { userAgent: 'ClaudeBot',     allow: ALLOW, disallow: DISALLOW },
      { userAgent: 'PerplexityBot', allow: ALLOW, disallow: DISALLOW },
    ],
    // The sitemap is sharded (generateSitemaps → /sitemap/<id>.xml). Point
    // crawlers at the index that lists every shard. Next reserves /sitemap.xml
    // for the root-metadata route (which 404s under sharding), so the index
    // lives at /sitemap-index.xml — see app/sitemap-index.xml/route.ts.
    sitemap: `${BASE}/sitemap-index.xml`,
    host: BASE,
  };
}
