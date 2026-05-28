import type { MetadataRoute } from 'next';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { CATEGORIES, COUNTRIES, SKILLS, TIMEZONES, REGIONS } from '@/lib/seo-slices';
import { INDUSTRIES, CITIES, SALARY_ROLES, COMPETITORS } from '@/lib/seo-extra';
import { ARTICLES } from '@/lib/resources';
import { companySlug } from '@/lib/company-slug';

const BASE = 'https://remotejobs44.com';

// Daily granularity for lastModified. Previously every URL shared the
// exact `new Date()` instant, which Google treats as "no real freshness
// signal" and ignores entirely. Rounding to today's date gives a stable
// per-day value that Google can use to detect when a section actually
// changed — particularly useful for the static-shell pages.
function today() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = today();

  // Static "shell" routes — includes new SEO landing pages
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,                lastModified: now, changeFrequency: 'daily',   priority: 1.0  },
    { url: `${BASE}/jobs`,            lastModified: now, changeFrequency: 'hourly',  priority: 0.95 },
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
    { url: `${BASE}/login`,           lastModified: now, changeFrequency: 'yearly',  priority: 0.4  },
    { url: `${BASE}/register`,        lastModified: now, changeFrequency: 'yearly',  priority: 0.5  },
    { url: `${BASE}/forgot-password`, lastModified: now, changeFrequency: 'yearly',  priority: 0.2  },
  ];

  // Existing curated blog posts
  const blogRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/blog/remote-job-interview-tips`,          lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/blog/how-to-find-remote-jobs-in-nigeria`, lastModified: now, changeFrequency: 'monthly', priority: 0.75 },
    { url: `${BASE}/blog/best-remote-jobs-for-beginners`,     lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ];

  // Resource articles (30)
  const resourceRoutes: MetadataRoute.Sitemap = ARTICLES.map(a => ({
    url: `${BASE}/resources/${a.slug}`,
    lastModified: new Date(a.updated),
    changeFrequency: 'monthly' as const,
    priority: 0.75,
  }));

  // Programmatic SEO landing pages — existing + new (industries, cities,
  // salary guides, comparisons).
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

  // Real active job postings (capped to 5000 to keep the sitemap under
  // Google's 50k-URL / 50MB limit even at scale). lastModified is derived
  // from posted_at so freshness signals don't all collapse into "today".
  let jobRoutes: MetadataRoute.Sitemap = [];
  // Per-company landing pages (derived from jobs.company). One sitemap
  // entry per unique slug; capped to 1000 employers by total job count.
  let companyRoutes: MetadataRoute.Sitemap = [];
  try {
    const admin = createAdminSupabaseClient();
    const { data: jobs } = await admin
      .from('jobs')
      .select('id, company, posted_at')
      .eq('is_active', true)
      .order('posted_at', { ascending: false })
      .limit(5000);

    if (jobs) {
      jobRoutes = jobs.map((job: { id: string; posted_at: string | null }) => ({
        url: `${BASE}/jobs/${job.id}`,
        lastModified: job.posted_at ? new Date(job.posted_at) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.65,
      }));

      // Aggregate companies — pick the most recent posted_at per slug as
      // the company page's lastModified so the sitemap reflects the
      // freshest hiring activity at that employer.
      const companyMap = new Map<string, { name: string; latest: Date; count: number }>();
      for (const j of jobs as Array<{ company: string | null; posted_at: string | null }>) {
        const name = (j.company ?? '').trim();
        if (!name) continue;
        const slug = companySlug(name);
        if (!slug) continue;
        const posted = j.posted_at ? new Date(j.posted_at) : now;
        const existing = companyMap.get(slug);
        if (!existing) {
          companyMap.set(slug, { name, latest: posted, count: 1 });
        } else {
          existing.count++;
          if (posted > existing.latest) existing.latest = posted;
        }
      }
      // Cap to 1000 most-active employers — keeps the sitemap small and
      // focuses crawler attention on companies with real ongoing hiring.
      companyRoutes = Array.from(companyMap.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 1000)
        .map(([slug, info]) => ({
          url:             `${BASE}/companies/${slug}`,
          lastModified:    info.latest,
          changeFrequency: 'weekly' as const,
          priority:        0.7,
        }));
    }
  } catch {
    // Non-fatal — DB down at build time
  }

  return [
    ...staticRoutes,
    ...blogRoutes,
    ...resourceRoutes,
    ...sliceRoutes,
    ...companyRoutes,
    ...jobRoutes,
  ];
}
