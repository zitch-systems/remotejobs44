// Server-side data fetching for the Deep Ocean landing.
//
// PAYWALL INVARIANT (mirrors FeaturedJobs.tsx): this module runs on the
// server and feeds client islands whose props serialize into the public
// RSC/Flight payload. We therefore SELECT only "safe" columns and never
// surface apply_url / apply_email. Every consumer links to /jobs/[id],
// where the gated detail page re-adds apply links for paid users.
//
// Pure/client-safe helpers + the LandingJob type live in ./helpers and are
// re-exported here so server components can import everything from one place;
// the client island Listings.tsx imports them from ./helpers directly to keep
// this server-only module out of the browser bundle.
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import type { LandingJob } from './helpers';

export * from './helpers';

// Columns that are safe to ship to the public payload. Deliberately
// excludes apply_url / apply_email / description.
const SAFE_COLUMNS =
  'id,title,company,location,category,type,salary_min,salary_max,currency,posted_at,created_at,featured';

function toLandingJob(j: any): LandingJob {
  const company = j.company ?? 'Company';
  return {
    id:        j.id,
    title:     j.title ?? 'Remote role',
    company,
    logo:      company?.[0]?.toUpperCase() ?? '?',
    category:  j.category ?? 'other',
    type:      j.type ?? 'full-time',
    location:  j.location ?? 'Worldwide',
    salaryMin: j.salary_min ?? undefined,
    salaryMax: j.salary_max ?? undefined,
    currency:  j.currency ?? 'USD',
    posted:    j.posted_at ?? j.created_at ?? new Date().toISOString(),
    featured:  j.featured ?? false,
  };
}

// Fetch the freshest visible jobs once; all landing sections share the result.
export async function fetchLandingJobs(limit = 40): Promise<LandingJob[]> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data } = await supabase
      .from('jobs')
      .select(SAFE_COLUMNS)
      .eq('is_active', true)
      .or(notExpired())
      .or(NOT_FLAGGED)
      .order('featured', { ascending: false })
      .order('posted_at', { ascending: false })
      .limit(limit);
    return (data ?? []).map(toLandingJob);
  } catch {
    return [];
  }
}
