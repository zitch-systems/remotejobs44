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
    location:  j.location ?? 'Location not specified',
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

// Live open-role count per category slug (same visibility filters as the
// rest of the landing). Used by the categories grid + the listings filter
// rail. Runs hourly behind the page's revalidate, so the per-slug count
// queries are cheap in aggregate. The DB `category` column value equals the
// URL slug (see VALID_CATEGORIES in app/api/jobs/route.ts). Returns {} on
// failure so callers fall back to a generic label.
export async function fetchCategoryCounts(slugs: string[]): Promise<Record<string, number>> {
  try {
    const supabase = createAdminSupabaseClient();
    const entries = await Promise.all(
      slugs.map(async (slug) => {
        const { count } = await supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('category', slug)
          .or(notExpired())
          .or(NOT_FLAGGED);
        return [slug, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}
