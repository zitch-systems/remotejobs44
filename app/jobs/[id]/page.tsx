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
import { MapPin, Clock, ArrowLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { getRequesterPlan, canSeePaidFields } from '@/lib/auth/requester-plan';
import { cn, formatRelativeDate, formatSalary, CATEGORY_META } from '@/lib/utils';
import { normalizeJobDescription } from '@/lib/job-description';
import { skillSlug } from '@/lib/seo-slices';
import { JobActionsCard } from '@/components/jobs/JobActionsCard';
import { CompanyMask } from '@/components/jobs/CompanyMask';
import { SourceTrustBadge } from '@/components/jobs/SourceTrustBadge';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import { companySlug } from '@/lib/company-slug';
import type { Job } from '@/lib/types';

// Cache job detail pages at the edge for 5 minutes — long enough that the
// JSON-LD doesn't re-render on every crawler hit, short enough that
// description edits / role removals propagate quickly.
export const revalidate = 300;

async function fetchJob(id: string): Promise<Job | null> {
  if (!id) return null;
  try {
    const supabase = createServerSupabaseClient();
    // Resolve plan in parallel with the row fetch — the apply links are
    // gated behind a paid plan, so anon + free callers get the off-site
    // apply URL stripped from the data shipped into the client island.
    // This is what makes the paywall enforceable: previously the URL was
    // serialised into the React tree and readable via DevTools regardless
    // of the displayed CTA.
    const [{ data }, requesterPlan] = await Promise.all([
      supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .or(notExpired())
        .or(NOT_FLAGGED)
        .maybeSingle(),
      getRequesterPlan(supabase),
    ]);
    if (!data) return null;
    const seePaid = canSeePaidFields(requesterPlan);
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
      applyUrl:      seePaid ? (data.apply_url   ?? undefined) : undefined,
      applyEmail:    seePaid ? (data.apply_email ?? undefined) : undefined,
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

// applicantLocationRequirements — Google penalises generic "Worldwide" when
// the role is actually region-locked. Express the eligible applicant
// countries honestly from `job.location` when we can recognise them.
const KNOWN_REGIONS: Array<readonly [string, string]> = [
  ['united states', 'United States'], ['us only', 'United States'], ['usa', 'United States'],
  ['canada', 'Canada'], ['uk', 'United Kingdom'], ['united kingdom', 'United Kingdom'],
  ['germany', 'Germany'], ['france', 'France'], ['spain', 'Spain'],
  ['netherlands', 'Netherlands'], ['poland', 'Poland'], ['portugal', 'Portugal'],
  ['nigeria', 'Nigeria'], ['kenya', 'Kenya'], ['south africa', 'South Africa'],
  ['ghana', 'Ghana'], ['egypt', 'Egypt'], ['india', 'India'],
  ['australia', 'Australia'], ['brazil', 'Brazil'], ['mexico', 'Mexico'],
  ['europe', 'Europe'], ['emea', 'Europe'], ['latam', 'Latin America'],
  ['apac', 'Asia-Pacific'], ['africa', 'Africa'],
];
function inferApplicantLocations(location: string | undefined) {
  if (!location) return [{ '@type': 'Country', name: 'Worldwide' }];
  const l = location.toLowerCase();
  const hits: Array<{ '@type': string; name: string }> = [];
  for (const [needle, name] of KNOWN_REGIONS) if (l.includes(needle)) hits.push({ '@type': 'Country', name });
  if (hits.length === 0 && (l.includes('remote') || l.includes('worldwide') || l.includes('anywhere'))) {
    hits.push({ '@type': 'Country', name: 'Worldwide' });
  }
  return hits.length > 0 ? hits : [{ '@type': 'Country', name: 'Worldwide' }];
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

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const job = await fetchJob(params.id);
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
  const POSTING_TTL_DAYS = 30;
  const postedMs = job.posted ? new Date(job.posted).getTime() : Date.now();
  const validThrough = job.expires
    ? new Date(job.expires).toISOString()
    : new Date(postedMs + POSTING_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.com';

  const jsonLd: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: normalizeJobDescription(job.description ?? ''),
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
    applicantLocationRequirements: inferApplicantLocations(job.location),
    directApply: false,
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company,
    },
    skills: job.skills?.join(', ') ?? undefined,
    url: `${baseUrl}/jobs/${job.id}`,
  };
  if (job.salaryMin) {
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
    <div className="max-w-[900px] mx-auto px-5 py-8">
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
      <Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content (server-rendered) */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            {/* Long titles wrap to 2+ lines; items-center pushed the icon
                halfway down and stranded the company name below it. Anchor
                the icon to the top so title flows naturally beside it. */}
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 shrink-0 rounded-xl bg-stone-100 dark:bg-[#162033] border border-stone-200 dark:border-[#1e3a5f] flex items-center justify-center text-2xl font-black text-brand-700 dark:text-brand-400">
                {job.logo}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight leading-tight mb-1">{job.title}</h1>
                {/* Real company name is always in the HTML (good for SEO + AI
                    indexers); CompanyMask client island applies a CSS blur
                    on hydration when the auth state is free / unrevealed-daily. */}
                <p className="text-sm text-stone-500 dark:text-stone-400 font-semibold truncate">
                  <CompanyMask company={job.company} />
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-stone-500 dark:text-stone-400 mb-4">
              <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{job.location}</span>
              {job.timezone && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{job.timezone}</span>}
              <span className="text-stone-400">{formatRelativeDate(job.posted)}</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {job.isNew && <span className="badge bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">New</span>}
              {job.featured && <span className="badge bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">Featured</span>}
              <span className={cn('badge', catMeta.color)}>{catMeta.label}</span>
              <span className="badge bg-stone-100 dark:bg-stone-800 text-stone-500 capitalize">{job.type}</span>
              {job.level && <span className="badge bg-stone-100 dark:bg-stone-800 text-stone-500 capitalize">{job.level}</span>}
              <SourceTrustBadge source={job.source} />
            </div>

            {salary && (
              <div className="mb-5 pb-5 border-b border-stone-100 dark:border-[#1e3a5f]">
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-0.5">Salary</p>
                <p className="font-display font-extrabold text-xl text-brand-700 dark:text-brand-400">{salary}</p>
              </div>
            )}

            <div className="job-prose">
              {job.description && job.description.trim().length > 40 ? (
                renderJobDescription(job.description)
              ) : (
                <div className="rounded-lg border border-stone-200 dark:border-[#1e3a5f] bg-stone-50 dark:bg-[#162033] p-4 text-sm text-stone-500 dark:text-stone-400">
                  <p>
                    Full description is on the company&rsquo;s site. Click <strong>Apply Now</strong> on the right to view and apply.
                  </p>
                </div>
              )}
            </div>
          </div>

          {job.requirements && job.requirements.length > 0 && (
            <div className="card p-6">
              <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-4">Requirements</h2>
              <ul className="space-y-2">
                {job.requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-stone-600 dark:text-stone-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-600 dark:bg-brand-400 mt-2 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {job.benefits && job.benefits.length > 0 && (
            <div className="card p-6">
              <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-4">Benefits</h2>
              <div className="flex flex-wrap gap-2">
                {job.benefits.map((b, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-semibold">
                    ✓ {b}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Apply / save / share / admin / CV helper — all interactive, one client island */}
          <JobActionsCard job={job} />

          {/* Skills (server-rendered — plain anchors that feed PageRank into
              the /jobs/skill/[slug] landing pages when the skill is in our
              SEO catalogue; unknown skills fall back to /jobs?q=). */}
          {job.skills && job.skills.length > 0 && (
            <div className="card p-5">
              <h3 className="font-bold text-sm text-stone-700 dark:text-stone-300 mb-3">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {job.skills.map(s => {
                  const slug = skillSlug(s);
                  const href = slug ? `/jobs/skill/${slug}` : `/jobs?q=${encodeURIComponent(s)}`;
                  return (
                    <Link key={s} href={href}
                      className="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-[#162033] text-stone-600 dark:text-stone-300 text-xs font-semibold hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">
                      {s}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
