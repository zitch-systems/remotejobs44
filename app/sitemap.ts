import type { MetadataRoute } from 'next';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

const BASE = 'https://remotejobs44.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,                                         lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0  },
    { url: `${BASE}/jobs`,                                     lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.95 },
    { url: `${BASE}/pricing`,                                  lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8  },
    { url: `${BASE}/about`,                                    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7  },
    { url: `${BASE}/blog`,                                     lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8  },
    { url: `${BASE}/blog/remote-job-interview-tips`,           lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7  },
    { url: `${BASE}/blog/how-to-find-remote-jobs-in-nigeria`,  lastModified: new Date(), changeFrequency: 'monthly', priority: 0.75 },
    { url: `${BASE}/blog/best-remote-jobs-for-beginners`,      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7  },
    { url: `${BASE}/companies`,                                lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.65 },
    { url: `${BASE}/contact`,                                  lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5  },
    { url: `${BASE}/privacy`,                                  lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3  },
    { url: `${BASE}/terms`,                                    lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3  },
    { url: `${BASE}/cookies`,                                  lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3  },
  ];

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
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));
    }
  } catch {
    // Non-fatal: return static routes only if DB is unavailable
  }

