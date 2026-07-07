// app/jobs/page.tsx — Jobs listing (Server Component).
//
// Previously the entire page was `'use client'`, which meant AI/non-JS
// crawlers (Bing, Perplexity, ClaudeBot, GPTBot) and Google's freshness
// reads saw only the loading skeleton. Now the page renders the first
// page of jobs + a JobPosting ItemList JSON-LD server-side, while the
// filter UI lives in a JobsFiltersBar client island that updates the URL
// (which re-runs this server fetch).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { Zap, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { getRequesterPlan, canSeePaidFields, SAFE_JOB_COLUMNS } from '@/lib/auth/requester-plan';
import { REGION_TERMS } from '@/lib/jobs/region-terms';
import { cn, CATEGORY_META } from '@/lib/utils';
import { JobCard } from '@/components/jobs/JobCard';
import { JobsFiltersBar, ClearAllButton, RemoteToggleLink } from '@/components/jobs/JobsFiltersBar';
import type { Job, JobCategory } from '@/lib/types';

// This page renders dynamically (the plan check reads cookies, and
// searchParams force request-time rendering anyway), so a page-level
// `revalidate` export never applied here. The 60s caching that comment
// intended now actually exists: queryJobsListing below is wrapped in
// unstable_cache, so the expensive count/list queries run at most once
// per minute per filter combination instead of on every request.
//
// Same reason as /api/jobs/route.ts: count('exact') over 81k rows
// with OR-IS-NULL visibility filters + the remote-on ILIKE chain
// seq-scans in ~6-8 s. Default 10 s Vercel lambda timeout would tip
// cold renders into "0 jobs found" empty state. 30 s gives the
// service-role 60 s timeout room to land (now only paid on cache miss).
export const maxDuration = 30;

// Listing is heavily filterable; the noindex on faceted permutations is
// enforced via robots.ts (Disallow /jobs?*). The canonical surface for
// indexing is /jobs/category|skill|country|...|[slug].
// Single source of metadata for /jobs. (app/jobs/layout.tsx intentionally
// exports none — two metadata exports on the same segment silently
// override each other field-by-field and had drifted out of sync.)
export const metadata: Metadata = {
  title: 'Browse Remote Jobs — Engineering, Design, Marketing & More',
  description: 'Search 70,000+ verified remote jobs across engineering, design, product, marketing, finance and operations. Filter by role, country, timezone and salary. Browse free.',
  keywords: ['remote jobs', 'work from home jobs', 'remote jobs Nigeria', 'remote jobs Africa', 'online jobs', 'telecommute jobs', 'remote engineering jobs', 'remote design jobs'],
  alternates: { canonical: 'https://remotejobs44.com/jobs' },
  openGraph: {
    title: 'Browse Remote Jobs | RemoteJobs44',
    description: 'Filter 70,000+ verified remote roles by category, country, timezone and salary. Updated every 6 hours.',
    url: 'https://remotejobs44.com/jobs',
    images: [{ url: '/api/og', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Browse Remote Jobs | RemoteJobs44',
    description: 'Search 70,000+ verified remote jobs — engineering, design, marketing and more. Filter by country, timezone, salary. Browse free.',
  },
};

const JOBS_PER_PAGE = 50;

interface SearchParams {
  q?:           string;
  category?:    string;
  type?:        string;
  level?:       string;
  salary?:      string;
  timezone?:    string;
  posted?:      string;
  remote?:      string;
  region?:      string;
  country?:     string;
  sort?:        string;
  page?:        string;
}

function transform(j: any, seePaid: boolean): Job {
  return {
    id:           j.id,
    title:        j.title,
    company:      j.company,
    companyId:    j.company_id ?? undefined,
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
    // Off-site apply channel gated by plan — see lib/auth/requester-plan.
    // Free + anon: stripped (the Apply button on JobCard shows the
    // Subscribe paywall instead of redirecting).
    applyUrl:     seePaid ? (j.apply_url   ?? undefined) : undefined,
    applyEmail:   seePaid ? (j.apply_email ?? undefined) : undefined,
    posted:       j.posted_at ?? j.created_at ?? new Date().toISOString(),
    expires:      j.expires_at ?? undefined,
    featured:     j.featured ?? false,
    isNew:        j.is_new ?? false,
    source:       j.source ?? 'manual',
    sourceUrl:    j.source_url ?? undefined,
    remote:       j.remote ?? true,
  };
}

interface FetchJobsResult {
  jobs:  Job[];
  total: number;
  page:  number;
  pages: number;
  fuzzy?: boolean;
  error?: boolean;
}

// Every input that influences the listing query, defaults applied. Built
// with a fixed literal key order so the object JSON-serialises stably —
// it doubles as the unstable_cache key for queryJobsListing.
interface ListingParams {
  q: string; category: string; type: string; level: string;
  salary: string; timezone: string; posted: string;
  remoteOnly: boolean; region: string; country: string;
  sort: string; page: number;
}

function normalizeParams(sp: SearchParams): ListingParams {
  return {
    q:          sp.q        ?? '',
    category:   sp.category ?? '',
    type:       sp.type     ?? '',
    level:      sp.level    ?? '',
    salary:     sp.salary   ?? '',
    timezone:   sp.timezone ?? '',
    posted:     sp.posted   ?? '',
    remoteOnly: (sp.remote  ?? 'true') !== 'false',
    region:     sp.region   ?? '',
    country:    sp.country  ?? '',
    sort:       sp.sort     ?? 'newest',
    page:       Math.max(1, parseInt(sp.page ?? '1', 10) || 1),
  };
}

// Carries a degraded-but-renderable result out of queryJobsListing via
// throw: unstable_cache only memoises clean returns, so a transient DB
// failure renders its error state once instead of being cached as "0 jobs
// found" for a full minute of traffic.
class ListingQueryError extends Error {
  constructor(public readonly result: FetchJobsResult) {
    super('jobs listing query failed');
  }
}

// The actual Supabase work. MUST stay free of cookies()/headers() — it runs
// inside unstable_cache. Reads exclusively via the admin (service-role)
// client: anon's 3s / authenticated's 8s statement_timeout was hitting for
// FTS over 60k rows; service_role gets 60s. Paywall is enforced at the
// SELECT-column list: anon/free get SAFE_JOB_COLUMNS (no apply_url/
// apply_email), paid get '*' — `seePaid` is part of the cache key, so the
// two variants never cross.
async function queryJobsListing(p: ListingParams, seePaid: boolean): Promise<FetchJobsResult> {
  const { q, category, type, level, salary, timezone, posted, remoteOnly, region, country, sort, page } = p;
  const supabase = createAdminSupabaseClient();
  const cols     = seePaid ? '*' : SAFE_JOB_COLUMNS;

  // Q-PRESENT PATH: relevance-ranked FTS via the search_jobs() RPC
  // (migration v17). Returns SETOF jobs ordered by ts_rank desc, so the
  // FIRST hit is the best match — not the newest job mentioning the
  // term. Mirrors the /api/jobs route path; see that file for details.
  const safeQ = q.replace(/[\\"]/g, ' ').trim().slice(0, 200);
  if (safeQ) {
    const locTerm = (() => {
      if (country && REGION_TERMS[country]) return REGION_TERMS[country][0];
      if (region  && REGION_TERMS[region])  return REGION_TERMS[region][0];
      return country || region || null;
    })();
    const postedDays = (posted && /^\d+$/.test(posted)) ? Math.min(365, parseInt(posted, 10)) : null;
    let salMin: number | null = null;
    let salMax: number | null = null;
    if (salary && /^\d+-\d+$/.test(salary)) {
      const [lo, hi] = salary.split('-').map(n => parseInt(n, 10) * 1000);
      if (Number.isFinite(lo) && Number.isFinite(hi)) { salMin = lo; salMax = hi; }
    }
    // search_jobs RPC interpolates these into ilike '%' || param || '%'.
    // Parameter binding stops SQL injection but doesn't escape LIKE
    // wildcards — a crafted `?timezone=_` would otherwise match every
    // row. Mirror the escape from /api/jobs.
    const escapeLike = (s: string | null): string | null =>
      s == null ? null : s.replace(/[\\%_]/g, '\\$&').slice(0, 100);
    const offset = (page - 1) * JOBS_PER_PAGE;
    const args = {
      q:             safeQ,
      v_category:    (category && category !== 'all') ? category : null,
      v_type:        type     || null,
      v_level:       level    || null,
      v_remote_only: remoteOnly,
      v_location:    escapeLike(locTerm),
      v_timezone:    escapeLike(timezone || null),
      v_salary_min:  salMin,
      v_salary_max:  salMax,
      v_posted_days: postedDays,
    };
    const [rowsRes, countRes] = await Promise.all([
      supabase.rpc('search_jobs', { ...args, v_offset: offset, v_limit: JOBS_PER_PAGE }),
      supabase.rpc('search_jobs_count', args),
    ]);
    // Same "0 looks identical to error" footgun as the no-q branch —
    // if the FTS RPC bombs (statement_timeout, schema cache drift,
    // etc.) we'd render "No jobs found" and pretend nothing was wrong.
    // Log so Vercel can surface it, set rpcError so the page can show
    // a real error UI instead.
    const rpcError = !!(rowsRes.error || countRes.error);
    if (rpcError) {
      // eslint-disable-next-line no-console
      console.error('[fetchJobs] search_jobs RPC failed:', rowsRes.error?.message ?? countRes.error?.message);
    }
    let total = Number(countRes.data ?? 0);
    let jobs  = (rowsRes.data ?? []).map((j: any) => transform(j, seePaid));
    let fuzzy = false;

    // Trigram typo fallback (search_jobs_trgm) — fires only when strict
    // FTS returns nothing. Catches "reactt" → React, "pythn" → Python
    // etc. The flag bubbles up so the listing header can show a
    // "Showing results for…" hint.
    if (total === 0 && safeQ.length >= 3) {
      const [fRowsRes, fCountRes] = await Promise.all([
        supabase.rpc('search_jobs_trgm',       { ...args, v_offset: offset, v_limit: JOBS_PER_PAGE }),
        supabase.rpc('search_jobs_trgm_count', args),
      ]);
      if (!fRowsRes.error) {
        total = Number(fCountRes.data ?? 0);
        jobs  = (fRowsRes.data ?? []).map((j: any) => transform(j, seePaid));
        fuzzy = total > 0;
      }
    }

    const result: FetchJobsResult = {
      jobs,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / JOBS_PER_PAGE)),
      fuzzy,
      error: rpcError,
    };
    // Render the same degraded result as before, but keep it out of the
    // cache (see ListingQueryError).
    if (rpcError) throw new ListingQueryError(result);
    return result;
  }

  // NO-Q PATH: filter-only browsing.
  //
  // count: 'exact' on the same query that fetches rows. The earlier
  // split-count version traded correctness for speed — counting only
  // `is_active = true` meant the "X jobs found" header didn't change
  // when the user toggled the Remote pill or any other filter (the
  // filtered listing changed but the count stayed at 81k). With
  // maxDuration = 30 on the API route and admin_client's 60s
  // statement_timeout, the visibility-OR seq-scan fits in budget.
  let query = supabase
    .from('jobs')
    .select(cols, { count: 'exact' })
    .eq('is_active', true)
    .or(notExpired())
    .or(NOT_FLAGGED);
  if (category && category !== 'all') query = query.eq('category', category);
  if (type)  query = query.eq('type', type);
  if (level) query = query.eq('level', level);
  if (remoteOnly) {
    // is_remote_compat is a STORED GENERATED column in prod:
    //   COALESCE(remote, false) OR location ~* '(remote|worldwide|anywhere|global|distributed|wfh)'
    // i.e. exactly the `remote.eq.true,location.imatch.…` OR chain this
    // used to send — Postgres keeps it in sync on every write, and the
    // partial index jobs_is_remote_compat_idx serves it. EXPLAIN ANALYZE
    // on prod (84k rows, identical 16,435-row result set): regex chain
    // 203ms / 57,967 buffers for the LIMIT-50 page and 189ms for the
    // count; generated column 36ms / 15,151 buffers and 34ms. The win is
    // bigger cold — 4× fewer pages to fault in. Recorded in
    // supabase/migration_v32.sql; mirrors the /api/jobs route.
    query = query.eq('is_remote_compat', true);
  }
  const locFilter = country || region;
  if (locFilter && REGION_TERMS[locFilter]) {
    query = query.or(REGION_TERMS[locFilter].map(t => `location.ilike.%${t}%`).join(','));
  } else if (locFilter) {
    const safe = locFilter.replace(/[\\%_]/g, '\\$&').slice(0, 100);
    query = query.ilike('location', `%${safe}%`);
  }
  if (salary && /^\d+-\d+$/.test(salary)) {
    const [lo, hi] = salary.split('-').map(n => parseInt(n, 10) * 1000);
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      query = query.or([
        `and(salary_max.gte.${lo},salary_max.lte.${hi})`,
        `and(salary_min.gte.${lo},salary_min.lte.${hi})`,
        `and(salary_min.lte.${lo},salary_max.gte.${hi})`,
      ].join(','));
    }
  }
  if (timezone) {
    const safe = timezone.replace(/[\\%_]/g, '\\$&').slice(0, 50);
    query = query.ilike('timezone', `%${safe}%`);
  }
  if (posted && /^\d+$/.test(posted)) {
    const days = parseInt(posted, 10);
    if (days > 0 && days <= 365) {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      query = query.gte('posted_at', since);
    }
  }
  if (sort === 'salary') query = query.order('salary_max', { ascending: false, nullsFirst: false });
  else query = query.order('featured', { ascending: false }).order('posted_at', { ascending: false });

  const from = (page - 1) * JOBS_PER_PAGE;
  query = query.range(from, from + JOBS_PER_PAGE - 1);

  const { data, count, error } = await query;
  // Earlier versions of this branch returned total=0, jobs=[] when the
  // SDK call failed — which rendered as "No jobs found" in the UI and
  // looked indistinguishable from a real empty result. The user saw
  // that flash whenever the no-q query timed out at the lambda level.
  // Log loudly so the failure shows up in Vercel runtime logs, and
  // surface a small `error: true` flag so the page can render an
  // actual "Couldn't load — refresh" state instead of a fake zero.
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[fetchJobs] no-q SELECT failed:', error.message);
  }
  const jobs = (data ?? []).map((j: any) => transform(j, seePaid));
  const total = count ?? jobs.length;
  const result: FetchJobsResult = {
    jobs,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / JOBS_PER_PAGE)),
    error: !!error,
  };
  if (error) throw new ListingQueryError(result);
  return result;
}

// 60s shared cache over the listing queries — the count('exact') +
// filtered SELECT (or FTS RPC pair) run at most once per minute per
// distinct filter combination + column variant, instead of on every
// request. Tagged so /api/jobs admin mutations can flush instantly.
const queryJobsListingCached = unstable_cache(
  queryJobsListing,
  ['jobs-listing-v1'],
  { revalidate: 60, tags: ['jobs', 'jobs-listing'] },
);

async function fetchJobs(sp: SearchParams): Promise<FetchJobsResult> {
  const params = normalizeParams(sp);
  // Plan resolution stays per-request (it reads the session cookie); for
  // anonymous traffic getRequesterPlan short-circuits without hitting the
  // Auth server. Only the heavy data work below is cached.
  const requesterPlan = await getRequesterPlan(await createServerSupabaseClient());
  const seePaid = canSeePaidFields(requesterPlan);
  try {
    return await queryJobsListingCached(params, seePaid);
  } catch (err) {
    if (err instanceof ListingQueryError) return err.result;
    // eslint-disable-next-line no-console
    console.error('[fetchJobs] listing query threw:', err instanceof Error ? err.message : String(err));
    return { jobs: [], total: 0, page: params.page, pages: 1, error: true };
  }
}

// Build the page-number window for the pagination control. Mirrors the
// hand-rolled logic from the previous client version: pins first + last,
// fills with a sliding window centred on `page`, dedupes overlaps.
function pageWindow(page: number, pages: number): number[] {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
  const numbers = [1];
  let start = page - 2;
  if (start < 2) start = 2;
  if (start + 2 > pages - 1) start = pages - 1 - 2;
  if (start < 2) start = 2;
  for (let i = 0; i < 3; i++) numbers.push(start + i);
  numbers.push(pages);
  const seen = new Set<number>();
  return numbers.filter(n => {
    if (seen.has(n) || n < 1 || n > pages) return false;
    seen.add(n); return true;
  });
}

function paginationHref(sp: SearchParams, targetPage: number): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== 'page') p.set(k, v);
  if (targetPage > 1) p.set('page', String(targetPage));
  const qs = p.toString();
  return qs ? `/jobs?${qs}` : '/jobs';
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Next 15+ made searchParams async — must be awaited once at the top
  // and then read off the resolved object. Rename to `sp` to avoid
  // shadowing the closure-captured prop in the helper calls below
  // (`paginationHref(sp, …)` is functionally identical to passing the
  // raw object that previously came in synchronously).
  const sp = await searchParams;
  const { jobs, total, page, pages, fuzzy, error: fetchError } = await fetchJobs(sp);

  // A stale/hand-entered ?page=N past the last page would otherwise render the
  // generic "No jobs found" empty state even though the result set is large.
  // Bounce to the last real page instead. Only when we genuinely have results
  // and aren't in an error state (an errored fetch reports pages=1 and owns its
  // own error UI).
  if (!fetchError && total > 0 && page > pages) {
    redirect(paginationHref(sp, pages));
  }

  const category   = (sp.category ?? 'all') as JobCategory | 'all';
  const q          = sp.q ?? '';
  const remoteOnly = (sp.remote ?? 'true') !== 'false';
  const salary     = sp.salary ?? '';
  const activeFilterCount = ['type','level','salary','timezone','posted','region','country']
    .filter(k => sp[k as keyof SearchParams]).length;
  const hasActive = !!(q || (category && category !== 'all') || activeFilterCount > 0);
  const catMeta = CATEGORY_META[category as keyof typeof CATEGORY_META] ?? CATEGORY_META['all'];

  // JSON-LD ItemList of JobPostings — gives Google + AI engines a clean
  // structured signal that this page is a real, fresh job feed worth
  // citing. We emit lightweight stubs (no full description in the list)
  // and let crawlers follow to /jobs/[id] for the detailed JobPosting.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.com';
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Remote Jobs on RemoteJobs44',
    // The full size of the live result set for this view, not just the
    // current page slice — previously this reported `jobs.length` (≤ one
    // page), understating the feed and undercutting the "fresh, large job
    // board" signal. The itemListElement below is a 25-item sample.
    numberOfItems: total,
    itemListElement: jobs.slice(0, 25).map((j, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${baseUrl}/jobs/${j.id}`,
      name: `${j.title} at ${j.company}`,
    })),
  };

  return (
    <div className="deep-ocean">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, '\\u003c') }}
      />

      {/* Dark photo hero band — Deep Ocean look. Copy preserved from the
          prototype; the live search/filter UI lives in JobsFiltersBar below. */}
      <section className="photoband" style={{ '--pb-img': 'url(/redesign/ig-duo-laptops.jpg)' } as React.CSSProperties}>
        <div className="wrap wrap--wide">
          <div className="crumb">
            <Link href="/">Home</Link>
            <ChevronRight aria-hidden />
            <span>Browse jobs</span>
          </div>
          <h1>Search 70,000+ remote roles</h1>
          <p className="sub">Every role verified remote — filter by category, region and type.</p>
          <div className="bandstats">
            <span><span className="pulse" />{total.toLocaleString()} live roles</span>
            <span>150+ countries hiring</span>
            <span>Updated daily</span>
          </div>
        </div>
      </section>

      <div className="wrap wrap--wide" style={{ padding: '32px 28px 72px' }}>
        {/* Filter UI — client island. URL changes re-run the server fetch above. */}
        <JobsFiltersBar />

        {/* Results header / toolbar */}
        <div className="toolbar">
          <div>
            <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100">
              {q ? `Results for "${q}"` : category === 'all' ? 'All Remote Jobs' : `${catMeta.label} Jobs`}
            </h2>
            {fuzzy && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                No exact matches — showing similar results
              </p>
            )}
            <div className="count mt-0.5">
              <span className="pulse" />Showing <b>{total.toLocaleString()}</b> of 70,000+ jobs
              {total > 0 && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-brand-700 dark:text-brand-400">
                  <Zap className="w-3 h-3" />
                  {remoteOnly ? 'Remote only' : 'All locations'}
                </span>
              )}
              <RemoteToggleLink />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasActive && <ClearAllButton />}
            <div className="flex items-center gap-0.5 p-1 rounded-lg border border-stone-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0a1628]">
              <span aria-label="Grid view" className="p-1.5 rounded-md bg-brand-700 text-white">
                <LayoutGrid className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>

      {/* Grid */}
      {jobs.length === 0 ? (
        fetchError ? (
          // Distinguish a DB error from an honest empty result so users
          // don't see "No jobs found" when the actual cause was a query
          // timeout. Refresh works because the next request retries the
          // same SDK call (cold-lambda was the most common cause).
          <div className="bg-white dark:bg-[#0a1628] border border-amber-300 dark:border-amber-700 rounded-2xl p-12 text-center">
            <div className="text-5xl mb-3">⚠️</div>
            <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-2">Couldn&rsquo;t load jobs</h2>
            <p className="text-stone-400 dark:text-stone-500 mb-5 max-w-sm mx-auto text-sm">
              We hit a hiccup talking to the database. Refresh the page to try again.
            </p>
            <Link href="/jobs" className="px-6 py-2.5 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-800 transition-colors inline-block">
              Try again
            </Link>
          </div>
        ) : (
        <div className="bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-2xl p-16 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-2">No jobs found</h2>
          {salary ? (
            <p className="text-stone-400 dark:text-stone-500 mb-5 max-w-md mx-auto text-sm">
              Most jobs on the site don&rsquo;t publish a salary range, so the salary filter
              excludes them. <Link href={paginationHref({ ...sp, salary: '' }, 1)} className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">Clear the salary filter</Link> to see all matching jobs.
            </p>
          ) : (
            <p className="text-stone-400 dark:text-stone-500 mb-5 max-w-sm mx-auto text-sm">Try different keywords or remove some filters.</p>
          )}
          <Link href="/jobs" className="px-6 py-2.5 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-800 transition-colors inline-block">
            Show all jobs
          </Link>
        </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {jobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>

          {/* Pagination — plain <Link>s so it works without JS. Deep Ocean .pager skin. */}
          {pages > 1 && (
            <div className="pager">
              {page > 1 ? (
                <Link href={paginationHref(sp, page - 1)} aria-label="Previous page">
                  <ChevronLeft className="w-4 h-4" />
                </Link>
              ) : (
                <span className="disabled" aria-hidden>
                  <ChevronLeft className="w-4 h-4" />
                </span>
              )}
              {pageWindow(page, pages).map(p => (
                <Link key={p} href={paginationHref(sp, p)} className={cn(p === page && 'on')}>
                  {p}
                </Link>
              ))}
              {page < pages ? (
                <Link href={paginationHref(sp, page + 1)} aria-label="Next page">
                  <ChevronRight className="w-4 h-4" />
                </Link>
              ) : (
                <span className="disabled" aria-hidden>
                  <ChevronRight className="w-4 h-4" />
                </span>
              )}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
