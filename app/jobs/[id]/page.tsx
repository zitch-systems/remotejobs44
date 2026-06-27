// app/jobs/[id]/page.tsx — Job detail page (Server Component).
//
// Previously this entire page was `'use client'`, which meant AI crawlers
// (Bing, Perplexity, ClaudeBot, GPTBot) and Google's freshness reads saw
// only the skeleton — the JSON-LD, the description, and the metadata were
// all hydrated client-side after the data fetch. Now the page is a Server
// Component: the job is fetched server-side, the JobPosting structured
// data + description + requirements + benefits ship in the initial HTML,
// and only the auth-dependent interactive bits (apply / save / share /
// admin / CV helper) plus the free-user company-name visual blur are
// client islands.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Clock, ArrowLeft, Flag, ChevronRight, Check } from 'lucide-react';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequesterPlan, canSeePaidFields } from '@/lib/auth/requester-plan';
import { getJobDetailRow } from '@/lib/jobs/job-detail';
import { cn, formatRelativeDate, formatSalary, CATEGORY_META } from '@/lib/utils';
import { normalizeJobDescription, jobDescriptionToHtml } from '@/lib/job-description';
import { skillSlug } from '@/lib/seo-slices';
import { JobActionsCard } from '@/components/jobs/JobActionsCard';
import { CompanyMask } from '@/components/jobs/CompanyMask';
import { SourceTrustBadge } from '@/components/jobs/SourceTrustBadge';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import { companySlug } from '@/lib/company-slug';
import type { Job } from '@/lib/types';

// NOTE: this route renders dynamically (the plan check reads cookies), so a
// page-level `revalidate` export has no effect here. The 5-minute caching
// lives in lib/jobs/job-detail.ts via unstable_cache — that's what stops the
// job row from being re-fetched per request / per crawler hit.

async function fetchJob(id: string): Promise<Job | null> {
  if (!id) return null;
  try {
    // Row + plan resolve concurrently:
    //   * row — the SAME cached fetch generateMetadata used this request
    //     (React cache() dedupe), so this usually costs nothing; across
    //     requests it's served from the 5-min unstable_cache.
    //   * plan — getRequesterPlan short-circuits to 'anon' without touching
    //     the Auth server when the request carries no Supabase auth cookie
    //     (the overwhelming majority of job-detail traffic + every crawler).
    const [data, requesterPlan] = await Promise.all([
      getJobDetailRow(id),
      createServerSupabaseClient().then(getRequesterPlan),
    ]);
    if (!data) return null;
    const seePaid = canSeePaidFields(requesterPlan);

    // Paywall: apply_url/apply_email are NEVER in the shared cache (it
    // stores SAFE_JOB_COLUMNS only — see the invariant note in
    // lib/jobs/job-detail.ts). Entitled sessions merge them in with one
    // per-request single-row read as service-role; anon/free skip it and
    // the fields stay undefined, exactly as before.
    let applyUrl: string | undefined;
    let applyEmail: string | undefined;
    if (seePaid) {
      const { data: paid } = await createAdminSupabaseClient()
        .from('jobs')
        .select('apply_url, apply_email')
        .eq('id', id)
        .maybeSingle();
      applyUrl   = paid?.apply_url   ?? undefined;
      applyEmail = paid?.apply_email ?? undefined;
    }
    // Map snake_case DB row → camelCase Job. Mirrors transformJob in
    // /api/jobs/route.ts but maps `posted_at → posted` (the field name the
    // Job type and downstream components actually use; the API route's
    // `postedAt` aliasing was a latent bug producing Invalid Date strings).
    return {
      id:            data.id,
      title:         data.title,
      company:       data.company,
      companyId:     data.company_id ?? undefined,
      logo:          data.logo ?? (data.company?.[0]?.toUpperCase() ?? '?'),
      category:      data.category ?? 'other',
      type:          data.type ?? 'full-time',
      level:         data.level ?? 'mid',
      salaryMin:     data.salary_min ?? undefined,
      salaryMax:     data.salary_max ?? undefined,
      currency:      data.currency ?? 'USD',
      location:      data.location ?? 'Worldwide',
      timezone:      data.timezone ?? undefined,
      description:   data.description ?? '',
      requirements:  data.requirements ?? undefined,
      skills:        data.skills ?? [],
      benefits:      data.benefits ?? undefined,
      applyUrl,
      applyEmail,
      posted:        data.posted_at ?? data.created_at ?? new Date().toISOString(),
      expires:       data.expires_at ?? undefined,
      featured:      data.featured ?? false,
      isNew:         data.is_new ?? false,
      source:        data.source ?? 'manual',
      sourceUrl:     data.source_url ?? undefined,
      remote:        data.remote ?? true,
    };
  } catch {
    return null;
  }
}

// applicantLocationRequirements — Google's JobPosting spec REQUIRES that
// each entry be a `Country` with a real country name; multi-country regions
// like "Europe", "Africa" or the catch-all "Worldwide" are NOT valid Country
// values and make Google drop the structured data ("Invalid value in field
// applicantLocationRequirements"). So we only emit genuine countries here,
// and when a role is open globally (or we can't resolve a specific country)
// we OMIT the property entirely — with jobLocationType: TELECOMMUTE that
// already signals "remote, no location restriction", which is the correct,
// penalty-free way to express a worldwide-remote role.
const KNOWN_COUNTRIES: Array<readonly [string, string]> = [
  ['united states', 'United States'], ['us only', 'United States'], ['usa', 'United States'],
  ['canada', 'Canada'], ['uk', 'United Kingdom'], ['united kingdom', 'United Kingdom'],
  ['germany', 'Germany'], ['france', 'France'], ['spain', 'Spain'],
  ['netherlands', 'Netherlands'], ['poland', 'Poland'], ['portugal', 'Portugal'],
  ['nigeria', 'Nigeria'], ['kenya', 'Kenya'], ['south africa', 'South Africa'],
  ['ghana', 'Ghana'], ['egypt', 'Egypt'], ['india', 'India'],
  ['australia', 'Australia'], ['brazil', 'Brazil'], ['mexico', 'Mexico'],
];
/**
 * Returns an array of valid `Country` entries, or `null` when the role is
 * effectively global / unresolved (caller omits applicantLocationRequirements).
 */
function inferApplicantLocations(location: string | undefined): Array<{ '@type': string; name: string }> | null {
  if (!location) return null;
  const l = location.toLowerCase();
  const seen = new Set<string>();
  const hits: Array<{ '@type': string; name: string }> = [];
  for (const [needle, name] of KNOWN_COUNTRIES) {
    if (l.includes(needle) && !seen.has(name)) { seen.add(name); hits.push({ '@type': 'Country', name }); }
  }
  // No specific country recognised (incl. "remote"/"worldwide"/"anywhere"
  // and multi-country regions like EMEA/LATAM/APAC) → omit the field.
  return hits.length > 0 ? hits : null;
}

// Render a scraped job description as structured blocks. ATS feeds give us
// plaintext (sometimes HTML — normalizeJobDescription handles that) with
// line breaks; we infer paragraphs / bullet lists / section headers from
// punctuation patterns so the preview reads cleanly without requiring a
// markdown parser dep.
function renderJobDescription(raw: string): React.ReactNode {
  const lines = normalizeJobDescription(raw).split('\n').map(l => l.trimEnd());
  const blocks: React.ReactNode[] = [];
  let bulletBuf: string[] = [];
  let paraBuf: string[] = [];

  const flushBullets = () => {
    if (bulletBuf.length === 0) return;
    blocks.push(
      <ul key={`u-${blocks.length}`} className="list-disc pl-5 mb-4 space-y-1.5 text-stone-600 dark:text-stone-300">
        {bulletBuf.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    );
    bulletBuf = [];
  };
  const flushPara = () => {
    if (paraBuf.length === 0) return;
    const text = paraBuf.join(' ').trim();
    if (text) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="mb-4 text-stone-600 dark:text-stone-300 leading-relaxed">{text}</p>
      );
    }
    paraBuf = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushBullets();
      flushPara();
      continue;
    }
    const bulletMatch = line.match(/^[-*•·●]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
    if (bulletMatch) {
      flushPara();
      bulletBuf.push(bulletMatch[1]);
      continue;
    }
    const isHeading = line.length <= 60 && (
      /[:：]$/.test(line) ||
      (line === line.toUpperCase() && /[A-Z]/.test(line) && line.split(' ').length <= 6)
    );
    if (isHeading) {
      flushBullets();
      flushPara();
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="font-bold text-base text-stone-900 dark:text-stone-100 mt-5 mb-2">
          {line.replace(/[:：]$/, '')}
        </h3>
      );
      continue;
    }
    flushBullets();
    paraBuf.push(line);
  }
  flushBullets();
  flushPara();
  return <>{blocks}</>;
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const job = await fetchJob((await params).id);
  if (!job) notFound();

  const catMeta = CATEGORY_META[job.category] ?? CATEGORY_META.other;
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency);

  // JSON-LD structured data — server-rendered so AI/non-JS crawlers (Bing,
  // Perplexity, ClaudeBot, GPTBot) actually receive it. Schema reference:
  // https://developers.google.com/search/docs/appearance/structured-data/job-posting
  //
  // validThrough: prefer the upstream's real expires_at when present
  // (Google rewards accurate expiry signals with better crawl
  // prioritisation). Fall back to posted+30d when the ATS feed didn't
  // ship one — most don't. The staleness pass in /api/cron/daily hides
  // jobs older than 60 days from listing pages, so a 30-day fallback
  // here is conservative and matches Google Jobs' expectation that
  // postings expire within a reasonable window.
  // validThrough MUST be in the future. Google Jobs silently DROPS any
  // posting whose validThrough has already passed ("expired"), so a naive
  // posted+30d fallback would de-list every job older than 30 days even
  // though our own staleness gate keeps them visible for 60. We therefore
  // take the LATEST of {upstream expires_at, posted+TTL} and, if that's
  // still in the past (or for any reason absent), clamp it forward to
  // now + a short window so the listing stays eligible while it's live on
  // the site. When the staleness pass finally hides the job, the detail
  // page 404s and the posting drops out cleanly.
  const POSTING_TTL_DAYS = 45;
  const MIN_FUTURE_DAYS  = 14;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const postedMs = job.posted ? new Date(job.posted).getTime() : nowMs;
  const expiresMs = job.expires ? new Date(job.expires).getTime() : 0;
  const validThroughMs = Math.max(
    expiresMs,
    postedMs + POSTING_TTL_DAYS * DAY_MS,
    nowMs + MIN_FUTURE_DAYS * DAY_MS,
  );
  const validThrough = new Date(validThroughMs).toISOString();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.com';

  // Google recommends an HTML-formatted description; fall back to plaintext
  // if the scraped body had no recoverable structure.
  const descriptionHtml = jobDescriptionToHtml(job.description ?? '')
    || normalizeJobDescription(job.description ?? '');
  const applicantLocations = inferApplicantLocations(job.location);

  const jsonLd: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: descriptionHtml,
    datePosted: job.posted,
    validThrough,
    identifier: {
      '@type': 'PropertyValue',
      name: job.company,
      value: job.id,
    },
    employmentType: job.type === 'full-time' ? 'FULL_TIME'
                  : job.type === 'part-time' ? 'PART_TIME'
                  : job.type === 'contract'  ? 'CONTRACTOR'
                  : job.type === 'freelance' ? 'TEMPORARY'
                  : 'OTHER',
    jobLocationType: 'TELECOMMUTE',
    // Only emit when we resolved real Country values; omitting it for a
    // global-remote role is the correct, penalty-free signal (see
    // inferApplicantLocations).
    ...(applicantLocations ? { applicantLocationRequirements: applicantLocations } : {}),
    directApply: false,
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company,
      // Point at our own canonical company hub so Google can tie the
      // posting to the employer entity (we don't have the employer's real
      // homepage in the feed, but the hub is a stable same-as target).
      sameAs: `${baseUrl}/companies/${companySlug(job.company)}`,
      url: `${baseUrl}/companies/${companySlug(job.company)}`,
    },
    skills: job.skills?.join(', ') ?? undefined,
    url: `${baseUrl}/jobs/${job.id}`,
  };
  // Structured data mirrors the on-page rule: only emit baseSalary for
  // US-dollar postings, so crawlers (Google Jobs) don't surface a pay figure
  // we deliberately hide for non-USD currencies.
  if ((job.currency ?? 'USD') === 'USD' && job.salaryMin) {
    jsonLd.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: job.currency ?? 'USD',
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.salaryMin,
        maxValue: job.salaryMax ?? job.salaryMin,
        unitText: 'YEAR',
      },
    };
  }

  return (
    <div className="deep-ocean">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      {/* Breadcrumb: Home › Jobs › <Company> › <Title>. Lets Google
          render sitelinks under the result in SERPs. */}
      <BreadcrumbJsonLd
        items={[
          { name: 'Home',     href: '/'                                 },
          { name: 'Jobs',     href: '/jobs'                             },
          { name: job.company, href: `/companies/${companySlug(job.company)}` },
          { name: job.title,  href: `/jobs/${job.id}`                   },
        ]}
      />

      {/* Dark photo hero band — Deep Ocean. Breadcrumb + logo tile + title +
          meta chips. The apply/save/share CTAs stay in the JobActionsCard
          client island (aside) so the paywall gating is preserved exactly. */}
      <section className="photoband" style={{ '--pb-img': 'url(/redesign/ig-focused-desk.jpg)' } as React.CSSProperties}>
        <div className="wrap">
          <div className="crumb">
            <Link href="/">Home</Link>
            <ChevronRight aria-hidden />
            <Link href="/jobs">Jobs</Link>
            <ChevronRight aria-hidden />
            <span>{job.title}</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 shrink-0 rounded-xl bg-white flex items-center justify-center text-2xl font-black text-brand-700">
              {job.logo}
            </div>
            <div className="flex-1 min-w-0">
              <h1>{job.title}</h1>
              {/* Real company name is always in the HTML (good for SEO + AI
                  indexers); CompanyMask client island applies a CSS blur
                  on hydration when the auth state is free / unrevealed-daily. */}
              <p className="text-sm font-semibold mt-1 text-white/80">
                <CompanyMask company={job.company} />
                <span className="mx-2 opacity-50">·</span>
                <span>{job.location}{job.remote ? ' · Remote' : ''}</span>
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="metachip"><MapPin className="w-3.5 h-3.5" />{job.location}</span>
                {job.timezone && <span className="metachip"><Clock className="w-3.5 h-3.5" />{job.timezone}</span>}
                <span className="metachip capitalize">{job.type}</span>
                {job.level && <span className="metachip capitalize">{job.level}</span>}
                <span className="metachip">{catMeta.label}</span>
                {job.featured && <span className="metachip job-flag">Featured</span>}
                <span className="metachip">{formatRelativeDate(job.posted)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <div className="detail-grid">
          {/* Main content (server-rendered) */}
          <main className="do-prose">
            <Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 mb-6 transition-colors no-underline">
              <ArrowLeft className="w-4 h-4" /> Back to Jobs
            </Link>

            {salary && (
              <div className="mb-6 pb-5 border-b border-stone-100 dark:border-[#1e3a5f]">
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-0.5">Salary</p>
                <p className="font-display font-extrabold text-xl text-brand-700 dark:text-brand-400">{salary}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-6">
              {job.isNew && <span className="badge bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">New</span>}
              <span className={cn('badge', catMeta.color)}>{catMeta.label}</span>
              <span className="badge bg-stone-100 dark:bg-stone-800 text-stone-500 capitalize">{job.type}</span>
              {job.level && <span className="badge bg-stone-100 dark:bg-stone-800 text-stone-500 capitalize">{job.level}</span>}
              <SourceTrustBadge source={job.source} />
            </div>

            <h2>About the role</h2>
            {job.description && job.description.trim().length > 40 ? (
              renderJobDescription(job.description)
            ) : (
              <div className="rounded-lg border border-stone-200 dark:border-[#1e3a5f] bg-stone-50 dark:bg-[#162033] p-4 text-sm text-stone-500 dark:text-stone-400">
                <p>
                  Full description is on the company&rsquo;s site. Click <strong>Apply Now</strong> on the right to view and apply.
                </p>
              </div>
            )}

            {job.requirements && job.requirements.length > 0 && (
              <>
                <h2>Requirements</h2>
                <ul>
                  {job.requirements.map((r, i) => (
                    <li key={i}>
                      <Check className="w-[19px] h-[19px]" />
                      {r}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {job.skills && job.skills.length > 0 && (
              <>
                <h2>Skills</h2>
                {/* Plain anchors that feed PageRank into the /jobs/skill/[slug]
                    landing pages when the skill is in our SEO catalogue; unknown
                    skills fall back to /jobs?q=. */}
                <div className="tagrow">
                  {job.skills.map(s => {
                    const slug = skillSlug(s);
                    const href = slug ? `/jobs/skill/${slug}` : `/jobs?q=${encodeURIComponent(s)}`;
                    return (
                      <Link key={s} href={href} className="skill no-underline">{s}</Link>
                    );
                  })}
                </div>
              </>
            )}

            {job.benefits && job.benefits.length > 0 && (
              <>
                <h2>Benefits</h2>
                <div className="flex flex-wrap gap-2">
                  {job.benefits.map((b, i) => (
                    <span key={i} className="px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-semibold">
                      ✓ {b}
                    </span>
                  ))}
                </div>
              </>
            )}
          </main>

          {/* Sidebar */}
          <aside>
            {/* Apply / save / share / admin / CV helper — all interactive, one
                client island. Paywall gating + apply behaviour preserved. */}
            <JobActionsCard job={job} />

            {/* "Report this job" — user-driven trust signal. Pre-filling the
                subject + body with the job id keeps the friction near zero. */}
            <div className="aside-card">
              <h4 className="flex items-center gap-1.5">
                <Flag className="w-3.5 h-3.5" /> See something off?
              </h4>
              <p className="co-blurb">
                Spam, scam, fake employer, broken apply link — let us know and we&rsquo;ll review within 24h.
              </p>
              <a
                href={`mailto:hello@remotejobs44.com?subject=${encodeURIComponent(`Report job: ${job.title} at ${job.company}`)}&body=${encodeURIComponent(`Job ID: ${job.id}\nURL: ${baseUrl}/jobs/${job.id}\n\nWhat's wrong with this listing?\n`)}`}
                className="btn btn-ghost btn-sm mt-3 no-underline"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Flag className="w-3 h-3" /> Report this listing
              </a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
