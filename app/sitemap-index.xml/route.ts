// app/sitemap-index.xml/route.ts — the sitemap INDEX.
//
// app/sitemap.ts uses generateSitemaps(), which makes Next.js serve the
// per-shard <urlset> files at /sitemap/<id>.xml — but Next does NOT emit a
// parent index for a root sitemap, and it reserves /sitemap.xml itself (so a
// route handler can't live there). This handler serves the index one path
// over, at /sitemap-index.xml (the same convention Yoast et al. use), and
// robots.ts points crawlers here. Shard count comes from the same
// lib/sitemap-shards helper the shards use, so the index can never reference a
// shard that doesn't exist (or omit one that does).
import { BASE, jobShardCount } from '@/lib/sitemap-shards';

// Built once per deploy, NOT revalidated. This must list exactly the shards
// that generateSitemaps() prerendered in app/sitemap.ts — and that id set is
// frozen at build time. If this route recomputed the count at request time, a
// post-deploy crossing of a 20k boundary would make it advertise a /sitemap/
// <N>.xml that was never generated (→ 404 in the index). Pinning it to the
// build keeps the index and the shard set in lock-step; both refresh together
// on the next deploy.
export const dynamic = 'force-static';

export async function GET() {
  const jobShards = await jobShardCount();
  const ids = Array.from({ length: jobShards + 1 }, (_, i) => i);
  const lastmod = new Date().toISOString();

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ids
      .map(
        id =>
          `  <sitemap>\n` +
          `    <loc>${BASE}/sitemap/${id}.xml</loc>\n` +
          `    <lastmod>${lastmod}</lastmod>\n` +
          `  </sitemap>`,
      )
      .join('\n') +
    `\n</sitemapindex>\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
