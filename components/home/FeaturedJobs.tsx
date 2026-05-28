// Server component — fetches the 6 most recent jobs directly from
// Supabase so the homepage HTML carries real job cards (good for AI
// crawlers + first paint). Was a `'use client'` component that ran a
// useEffect → fetch /api/jobs → setState round-trip on every load,
// showing a skeleton until hydration.
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { JobCard } from '@/components/jobs/JobCard';
import type { Job } from '@/lib/types';

// Re-fetch hourly. Featured-job rotation doesn't need to be live.
export const revalidate = 3600;

function transform(j: any): Job {
  return {
    id:           j.id,
    title:        j.title,
    company:      j.company,
    logo:         j.logo ?? (j.company?.[0]?.toUpperCase() ?? '?'),
    category:     j.category ?? 'other',
    type:         j.type ?? 'full-time',
    level:        j.level ?? 'mid',
    salaryMin:    j.salary_min ?? undefined,
    salaryMax:    j.salary_max ?? undefined,
    currency:     j.currency ?? 'USD',
    location:     j.location ?? 'Worldwide',
    timezone:     j.timezone ?? undefined,
    description:  j.description ?? '',
    requirements: j.requirements ?? undefined,
    skills:       j.skills ?? [],
    benefits:     j.benefits ?? undefined,
    applyUrl:     j.apply_url ?? undefined,
    applyEmail:   j.apply_email ?? undefined,
    posted:       j.posted_at ?? j.created_at ?? new Date().toISOString(),
    expires:      j.expires_at ?? undefined,
    featured:     j.featured ?? false,
    isNew:        j.is_new ?? false,
    source:       j.source ?? 'manual',
    sourceUrl:    j.source_url ?? undefined,
    remote:       j.remote ?? true,
  };
}

async function fetchFeatured(): Promise<Job[]> {
  try {
    const supabase = createAdminSupabaseClient();
    // Featured first, fall back to newest. 12 rows then filter down to 6
    // so if no featured rows exist we still have content.
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('is_active', true)
      .or(notExpired())
      .or(NOT_FLAGGED)
      .order('featured', { ascending: false })
      .order('posted_at', { ascending: false })
      .limit(12);
    const rows = data ?? [];
    const featured = rows.filter((r: any) => r.featured);
    const chosen = featured.length >= 3 ? featured.slice(0, 6) : rows.slice(0, 6);
    return chosen.map(transform);
  } catch {
    return [];
  }
}

export async function FeaturedJobs() {
  const jobs = await fetchFeatured();
  if (jobs.length === 0) return null;

  return (
    <section className="py-16 bg-white dark:bg-[#0f1e38]">
      <div className="max-w-[1440px] mx-auto px-5">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-accent" />
              <span className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
                Featured Opportunities
              </span>
            </div>
            <h2 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">
              Top Remote Jobs Right Now
            </h2>
            <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">
              Hand-picked roles from companies actively hiring
            </p>
          </div>
          <Link href="/jobs"
            className="flex items-center gap-1.5 text-sm font-semibold text-brand-700 dark:text-brand-400 hover:underline shrink-0">
            View all jobs <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {jobs.map(job => <JobCard key={job.id} job={job} />)}
        </div>
      </div>
    </section>
  );
}
