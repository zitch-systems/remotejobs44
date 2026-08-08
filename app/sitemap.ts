import type { MetadataRoute } from 'next';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { CATEGORIES, COUNTRIES, SKILLS, TIMEZONES, REGIONS } from '@/lib/seo-slices';
import { INDUSTRIES, CITIES, SALARY_ROLES, COMPETITORS } from '@/lib/seo-extra';
import { ARTICLES } from '@/lib/resources';
import { companySlug } from '@/lib/company-slug';
import { BASE, JOB_SHARD_SIZE, jobShardCount } from '@/lib/sitemap-shards';

// ── Sharding ────────────────────────────────────────────────────────────
// There are ~58k publicly-visible job postings — past Google's 50k-URL /
// 50MB-per-file limit, so a single sitemap would be truncated and silently
// drop tens of thousands of URLs (the old code hard-capped at 40k for
// exactly this reason). generateSitemaps() splits the output into shards:
//
//   shard 0           → static shell + blog + resources + programmatic
//                       slices + the top company landing pages
//   shard 1 .. N      → job-detail URLs, JOB_SHARD_SIZE per shard
//
// Next.js serves each shard at /sitemap/<id>.xml; the <sitemapindex> that
// links them is emitted by app/sitemap.xml/route.ts (Next does NOT generate
// that index for a root sitemap), and that index is what robots.ts points
// crawlers at. Shard sizing lives in lib/sitemap-shards.ts so the index and
// the shards can't disagree on the shard count.

// Daily granularity for lastModified. A per-day value (vs a fresh `new
// Date()` instant on every build) is a stable freshness signal Google can
// actually diff, rather than noise it ignores.
function today() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function generateSitemaps(): Promise<{ id: number }[]> {
  const jobShards = await jobShardCount();
  // id 0 is always present (the static/slice/company shard); job shards are
  // ids 1..jobShards.
  return Array.from({ length: jobShards + 1 }, (_, i) => ({ id: i }));
}

// ── Shard 0: static shell + slices + companies ──────────────────────────
function staticAndSliceRoutes(now: Date): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,                lastModified: now, changeFrequency: 'daily',   priority: 1.0  },
    { url: `${BASE}/jobs`,            lastModified: now, changeFrequency: 'hourly',  priority: 0.95 },
    { url: `${BASE}/jobs/industry`,   lastModified: now, changeFrequency: 'weekly',  priority: 0.85 },
    { url: `${BASE}/jobs/city`,       lastModified: now, changeFrequency: 'weekly',  priority: 0.85 },
    { url: `${BASE}/resources`,       lastModified: now, changeFrequency: 'weekly',  priority: 0.9  },
    { url: `${BASE}/salary-guide`,    lastModified: now, changeFrequency: 'monthly', priority: 0.9  },
    { url: `${BASE}/interview-prep`,  lastModified: now, changeFrequency: 'weekly',  priority: 0.85 },
    { url: `${BASE}/pricing`,         lastModified: now, changeFrequency: 'weekly',  priority: 0.85 },
    { url: `${BASE}/how-it-works`,    lastModified: now, changeFrequency: 'monthly', priority: 0.8  },
    { url: `${BASE}/for-employers`,   lastModified: now, changeFrequency: 'monthly', priority: 0.8  },
    { url: `${BASE}/faq`,             lastModified: now, changeFrequency: 'monthly', priority: 0.75 },
    { url: `${BASE}/compare`,         lastModified: now, changeFrequency: 'monthly', priority: 0.7  },
    { url: `${BASE}/companies`,       lastModified: now, changeFrequency: 'weekly',  priority: 0.65 },
    { url: `${BASE}/about`,           lastModified: now, changeFrequency: 'monthly', priority: 0.7  },
    { url: `${BASE}/blog`,            lastModified: now, changeFrequency: 'daily',   priority: 0.8  },
    { url: `${BASE}/contact`,         lastModified: now, changeFrequency: 'monthly', priority: 0.5  },
    { url: `${BASE}/privacy`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.3  },
    { url: `${BASE}/terms`,           lastModified: now, changeFrequency: 'yearly',  priority: 0.3  },
    { url: `${BASE}/cookies`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.3  },
    // NOTE: /login, /register, /forgot-password are intentionally NOT listed —
    // they're auth/utility pages (noindex), and submitting noindexed URLs in
    // the sitemap triggers Search Console "Submitted URL marked noindex".
  ];

  const blogRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/blog/remote-job-interview-tips`,          lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/blog/how-to-find-remote-jobs-in-nigeria`, lastModified: now, changeFrequency: 'monthly', priority: 0.75 },
    { url: `${BASE}/blog/best-remote-jobs-for-beginners`,     lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ];

  const resourceRoutes: MetadataRoute.Sitemap = ARTICLES.map(a => ({
    url: `${BASE}/resources/${a.slug}`,
    lastModified: new Date(a.updated),
    changeFrequency: 'monthly' as const,
    priority: 0.75,
  }));

  const sliceRoutes: MetadataRoute.Sitemap = [
    ...CATEGORIES.map(c => ({ url: `${BASE}/jobs/category/${c.slug}`,  lastModified: now, changeFrequency: 'daily'   as const, priority: 0.8  })),
    ...COUNTRIES .map(c => ({ url: `${BASE}/jobs/country/${c.slug}`,   lastModified: now, changeFrequency: 'daily'   as const, priority: 0.8  })),
    ...SKILLS    .map(c => ({ url: `${BASE}/jobs/skill/${c.slug}`,     lastModified: now, changeFrequency: 'daily'   as const, priority: 0.8  })),
    ...TIMEZONES .map(c => ({ url: `${BASE}/jobs/timezone/${c.slug}`,  lastModified: now, changeFrequency: 'daily'   as const, priority: 0.75 })),
    ...REGIONS   .map(c => ({ url: `${BASE}/jobs/region/${c.slug}`,    lastModified: now, changeFrequency: 'daily'   as const, priority: 0.75 })),
    ...INDUSTRIES.map(c => ({ url: `${BASE}/jobs/industry/${c.slug}`,  lastModified: now, changeFrequency: 'daily'   as const, priority: 0.75 })),
    ...CITIES    .map(c => ({ url: `${BASE}/jobs/city/${c.slug}`,      lastModified: now, changeFrequency: 'daily'   as const, priority: 0.75 })),
    ...SALARY_ROLES.map(r => ({ url: `${BASE}/salary-guide/${r.slug}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.8  })),
    ...COMPETITORS .map(c => ({ url: `${BASE}/compare/${c.slug}`,      lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7  })),
  ];

  return [...staticRoutes, ...blogRoutes, ...resourceRoutes, ...sliceRoutes];
}

// Top company landing pages, aggregated from recent hiring activity. Scans
// the most-recent slice of jobs (one query) and emits one URL per employer,
// capped to the 1000 most-active so crawl budget stays on real hiring.
async function companyRoutes(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const admin = createAdminSupabaseClient();
    const { data: jobs } = await admin
      .from('jobs')
      .select('company, posted_at')
      .eq('is_active', true)
      .or(notExpired())
      .or(NOT_FLAGGED)
      .order('posted_at', { ascending: false })
      .limit(40000);
    if (!jobs) return [];

    const companyMap = new Map<string, { latest: Date; count: number }>();
    for (const j of jobs as Array<{ company: string | null; posted_at: string | null }>) {
      const name = (j.company ?? '').trim();
      if (!name) continue;
      const slug = companySlug(name);
      if (!slug) continue;
      const posted = j.posted_at ? new Date(j.posted_at) : now;
      const existing = companyMap.get(slug);
      if (!existing) companyMap.set(slug, { latest: posted, count: 1 });
      else { existing.count++; if (posted > existing.latest) existing.latest = posted; }
    }
    return Array.from(companyMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 1000)
      .map(([slug, info]) => ({
        url:             `${BASE}/companies/${slug}`,
        lastModified:    info.latest,
        changeFrequency: 'weekly' as const,
        priority:        0.7,
      }));
  } catch {
    return [];
  }
}

// ── Job shards ──────────────────────────────────────────────────────────
// One stable ordering (posted_at desc, id asc) sliced by range() so a given
// job lands in exactly one shard. Mirrors the read-time visibility gate so
// we never list a URL whose detail page is hidden (soft-404 generator).
async function jobShard(shardIndex: number, now: Date): Promise<MetadataRoute.Sitemap> {
  const from = shardIndex * JOB_SHARD_SIZE;
  const to = from + JOB_SHARD_SIZE - 1;
  try {
    const admin = createAdminSupabaseClient();
    const { data: jobs } = await admin
      .from('jobs')
      .select('id, posted_at, updated_at')
      .eq('is_active', true)
      .or(notExpired())
      .or(NOT_FLAGGED)
      .order('posted_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to);
    if (!jobs) return [];
    return jobs.map((job: { id: string; posted_at: string | null; updated_at?: string | null }) => ({
      url: `${BASE}/jobs/${job.id}`,
      lastModified: new Date(job.updated_at ?? job.posted_at ?? now),
      changeFrequency: 'weekly' as const,
      priority: 0.65,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const now = today();

  // Next.js supplies dynamic metadata route params as strings at runtime even
  // though MetadataRoute's generated type declares a number. Normalise once:
  // strict `id === 0` otherwise fails for "0", falls into jobShard(-1), and
  // every shard silently renders an empty <urlset> because jobShard catches
  // the invalid negative range.
  const shardId = Number(id);
  if (!Number.isInteger(shardId) || shardId < 0) return [];

  // id 0 → the static/slice/company shard.
  if (shardId === 0) {
    const [companies] = await Promise.all([companyRoutes(now)]);
    return [...staticAndSliceRoutes(now), ...companies];
  }

  // id ≥ 1 → job-URL shard (zero-based slice index = id - 1).
  return jobShard(shardId - 1, now);
}
