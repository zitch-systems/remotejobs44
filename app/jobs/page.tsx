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
import { Zap, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { getRequesterPlan, canSeePaidFields, SAFE_JOB_COLUMNS } from '@/lib/auth/requester-plan';
import { cn, CATEGORY_META } from '@/lib/utils';
import { JobCard } from '@/components/jobs/JobCard';
import { JobsFiltersBar, ClearAllButton, RemoteToggleLink } from '@/components/jobs/JobsFiltersBar';
import type { Job, JobCategory } from '@/lib/types';

export const revalidate = 60;
// Same reason as /api/jobs/route.ts: count('exact') over 81k rows
// with OR-IS-NULL visibility filters + the remote-on ILIKE chain
// seq-scans in ~6-8 s. Default 10 s Vercel lambda timeout would tip
// cold renders into "0 jobs found" empty state. 30 s gives the
// service-role 60 s timeout room to land.
export const maxDuration = 30;

// Listing is heavily filterable; the noindex on faceted permutations is
// enforced via robots.ts (Disallow /jobs?*). The canonical surface for
// indexing is /jobs/category|skill|country|...|[slug].
export const metadata: Metadata = {
  title: 'Browse Remote Jobs',
  description: 'Search 50,000+ verified remote jobs from global companies. Filter by category, skill, country, timezone, salary, and more.',
  alternates: { canonical: 'https://remotejobs44.com/jobs' },
};

const JOBS_PER_PAGE = 50;

// Region/country term map mirrors REGION_TERMS in /api/jobs/route.ts.
// Duplicated rather than imported because that file is a route handler
// and importing it pulls in the entire Next handler graph.
const REGION_TERMS: Record<string, string[]> = {
  africa:        ['africa','nigeria','ghana','kenya','south africa','egypt','ethiopia','cameroon','senegal'],
  nigeria:       ['nigeria','lagos','abuja','port harcourt'],
  ghana:         ['ghana','accra'],
  kenya:         ['kenya','nairobi'],
  'south-africa':['south africa','johannesburg','cape town','durban'],
  europe:        ['europe','uk','germany','france','netherlands','spain','italy','sweden','poland'],
  uk:            ['uk','united kingdom','london','england','scotland','wales'],
  us:            ['us','usa','united states','new york','san francisco','los angeles','chicago'],
  canada:        ['canada','toronto','vancouver','montreal'],
  latam:         ['latin america','brazil','mexico','colombia','argentina','chile'],
  asia:          ['asia','india','singapore','japan','china','korea','indonesia','vietnam'],
  worldwide:     ['worldwide','global','remote','anywhere'],
};

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
  companySize?: string;
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
}

async function fetchJobs(sp: SearchParams): Promise<FetchJobsResult> {
  const q           = sp.q          ?? '';
  const category    = sp.category   ?? '';
  const type        = sp.type       ?? '';
  const level       = sp.level      ?? '';
  const salary      = sp.salary     ?? '';
  const timezone    = sp.timezone   ?? '';
  const posted      = sp.posted     ?? '';
  const remoteOnly  = (sp.remote    ?? 'true') !== 'false';
  const region      = sp.region     ?? '';
  const country     = sp.country    ?? '';
  const sort        = sp.sort       ?? 'newest';
  const page        = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  // Always run the actual jobs query against the admin (service-role)
  // client. anon's 3s / authenticated's 8s statement_timeout was hitting
  // for FTS over 60k rows; service_role gets 60s. Paywall is enforced at
  // the SELECT-column list: anon/free get SAFE_JOB_COLUMNS (no
  // apply_url/apply_email), paid get '*'.
  const sessionClient = await createServerSupabaseClient();
  const requesterPlan = await getRequesterPlan(sessionClient);
  const seePaid = canSeePaidFields(requesterPlan);
  const supabase = createAdminSupabaseClient();
  const cols     = seePaid ? '*' : SAFE_JOB_COLUMNS;
  // Touch sessionClient to silence the no-unused-vars lint — we still
  // need it for getRequesterPlan above.
  void sessionClient;

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
    const offset = (page - 1) * JOBS_PER_PAGE;
    const args = {
      q:             safeQ,
      v_category:    (category && category !== 'all') ? category : null,
      v_type:        type     || null,
      v_level:       level    || null,
      v_remote_only: remoteOnly,
      v_location:    locTerm,
      v_timezone:    timezone || null,
      v_salary_min:  salMin,
      v_salary_max:  salMax,
      v_posted_days: postedDays,
    };
    const [rowsRes, countRes] = await Promise.all([
      supabase.rpc('search_jobs', { ...args, v_offset: offset, v_limit: JOBS_PER_PAGE }),
      supabase.rpc('search_jobs_count', args),
    ]);
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

    return {
      jobs,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / JOBS_PER_PAGE)),
      fuzzy,
    };
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
    // Single POSIX regex (`imatch` = `~*`) instead of 7 ILIKE patterns —
    // 5.7× faster on this dataset (EXPLAIN: 6.2s → 1.1s). Mirrors the
    // /api/jobs route change.
    query = query.or(
      'remote.eq.true,location.imatch.remote|worldwide|anywhere|global|distributed|wfh'
    );
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

  const { data, count } = await query;
  const jobs = (data ?? []).map((j: any) => transform(j, seePaid));
  const total = count ?? jobs.length;
  return {
    jobs,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / JOBS_PER_PAGE)),
  };
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
  const { jobs, total, page, pages, fuzzy } = await fetchJobs(sp);

  const category   = (sp.category ?? 'all') as JobCategory | 'all';
  const q          = sp.q ?? '';
  const remoteOnly = (sp.remote ?? 'true') !== 'false';
  const salary     = sp.salary ?? '';
  const activeFilterCount = ['type','level','salary','timezone','posted','companySize','region','country']
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
    numberOfItems: jobs.length,
    itemListElement: jobs.slice(0, 25).map((j, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${baseUrl}/jobs/${j.id}`,
      name: `${j.title} at ${j.company}`,
    })),
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-5 py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, '\\u003c') }}
      />

      {/* Filter UI — client island. URL changes re-run the server fetch above. */}
      <JobsFiltersBar />

      {/* Results header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100">
            {q ? `Results for "${q}"` : category === 'all' ? 'All Remote Jobs' : `${catMeta.label} Jobs`}
          </h1>
          {fuzzy && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              No exact matches — showing similar results
            </p>
          )}
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5">
            {total.toLocaleString()} jobs found
            {total > 0 && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-brand-700 dark:text-brand-400">
                <Zap className="w-3 h-3" />
                {remoteOnly ? 'Remote only' : 'All locations'}
              </span>
            )}
            <RemoteToggleLink />
          </p>
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
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {jobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>

          {/* Pagination — plain <Link>s so it works without JS. */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-1.5">
              {page > 1 ? (
                <Link href={paginationHref(sp, page - 1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 dark:border-[#1e3a5f] text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors">
                  <ChevronLeft className="w-4 h-4" />Previous
                </Link>
              ) : (
                <span className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 dark:border-[#1e3a5f] text-sm font-semibold text-stone-400 opacity-40">
                  <ChevronLeft className="w-4 h-4" />Previous
                </span>
              )}
              {pageWindow(page, pages).map(p => (
                <Link key={p} href={paginationHref(sp, p)}
                  className={cn('w-10 h-10 rounded-xl text-sm font-bold transition-all flex items-center justify-center',
                    p === page ? 'bg-brand-700 dark:bg-brand-600 text-white shadow-md-brand' : 'border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#0a1628]')}>
                  {p}
                </Link>
              ))}
              {page < pages ? (
                <Link href={paginationHref(sp, page + 1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 dark:border-[#1e3a5f] text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors">
                  Next<ChevronRight className="w-4 h-4" />
                </Link>
              ) : (
                <span className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 dark:border-[#1e3a5f] text-sm font-semibold text-stone-400 opacity-40">
                  Next<ChevronRight className="w-4 h-4" />
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
