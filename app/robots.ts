import type { MetadataRoute } from 'next';

// Mirror sitemap.ts — use the deploy URL so preview deploys aren't
// pointing search engines at prod.
const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.com').replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /jobs is a CSR'd search UI; the *canonical* surface for crawlers
        // is the programmatic landing tree at /jobs/category|skill|country|
        // region|city|industry|timezone/[slug]. Blocking the faceted
        // /jobs?...&page=N permutations keeps the crawl budget on the
        // pages we actually want indexed.
        disallow: ['/admin', '/api/', '/dashboard', '/applications', '/saved', '/profile', '/auth/', '/jobs?'],
      },
      {
        userAgent: 'GPTBot',
        allow: '/',
      },
      {
        userAgent: 'ClaudeBot',
        allow: '/',
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
      },
    ],
    // The sitemap is sharded (generateSitemaps → /sitemap/<id>.xml). Point
    // crawlers at the index that lists every shard. Next reserves /sitemap.xml
    // for the root-metadata route (which 404s under sharding), so the index
    // lives at /sitemap-index.xml — see app/sitemap-index.xml/route.ts.
    sitemap: `${BASE}/sitemap-index.xml`,
    host: BASE,
  };
}
