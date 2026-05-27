import type { MetadataRoute } from 'next';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { CATEGORIES, COUNTRIES, SKILLS, TIMEZONES, REGIONS } from '@/lib/seo-slices';
import { INDUSTRIES, CITIES, SALARY_ROLES, COMPETITORS } from '@/lib/seo-extra';
import { ARTICLES } from '@/lib/resources';

const BASE = 'https://remotejobs44.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

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

  // Real active job postings (capped to 5000 to keep the sitemap under Google's
  // 50k-URL / 50MB limit even at scale).
  let jobRoutes: MetadataRoute.Sitemap = [];
  try {
    const admin = createAdminSupabaseClient();
    const { data: jobs } = await admin
      .from('jobs')
      .select('id')
      .eq('is_active', true)
      .limit(5000);
    if (jobs) {
      jobRoutes = jobs.map((job: { id: string }) => ({
        url: `${BASE}/jobs/${job.id}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.65,
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
    ...jobRoutes,
  ];
}
