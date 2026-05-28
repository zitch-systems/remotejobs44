import type { MetadataRoute } from 'next';

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
        disallow: ['/admin', '/api/', '/dashboard', '/applications', '/profile', '/auth/', '/jobs?'],
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
    sitemap: 'https://remotejobs44.com/sitemap.xml',
    host: 'https://remotejobs44.com',
  };
}
