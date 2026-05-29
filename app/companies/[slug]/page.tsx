// app/companies/[slug]/page.tsx — Per-company landing page.
//
// Branded search ("Stripe remote jobs", "Notion careers") is one of the
// highest-intent SEO queries on a remote-jobs board. Before this page
// existed those queries hit /jobs?q=Stripe which is robots-disallowed
// (and was client-rendered), so the entire branded-search surface was
// dead. Per-company pages with Organization JSON-LD let Google show
// site-links + Knowledge Panel entries for each employer we list.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Briefcase, ExternalLink, MapPin } from 'lucide-react';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { companySlug } from '@/lib/company-slug';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import { formatRelativeDate, formatSalary } from '@/lib/utils';

const BASE = 'https://remotejobs44.com';
export const revalidate = 3600;
export const dynamicParams = true;

interface JobRow {
  id:           string;
  title:        string;
  company:      string;
  location:     string | null;
  posted_at:    string | null;
  salary_min:   number | null;
  salary_max:   number | null;
  currency:     string | null;
  apply_url:    string | null;
}

async function findCompany(slug: string): Promise<{ name: string; jobs: JobRow[]; total: number } | null> {
  const supabase = createAdminSupabaseClient();
  // Two-step lookup:
  //   1) Pull a manageable window of active jobs whose lowered+slugified
  //      company name might match the URL slug. PostgREST doesn't
  //      support functional indexes via the JS client, so we approximate
  //      with a wide ILIKE then filter precisely in JS.
  //   2) Filter to exact slug match, count, and pick the most common
  //      spelling as the display name.
  //
  // Performance: with the existing jobs(company) index this should be
  // fast even at 50k jobs (the ILIKE is bounded by the slug length).
  const likeStub = slug.replace(/-/g, '%');
  const { data } = await supabase
    .from('jobs')
    .select('id, title, company, location, posted_at, salary_min, salary_max, currency, apply_url')
    .eq('is_active', true)
    .or(notExpired())
    .or(NOT_FLAGGED)
    .ilike('company', `%${likeStub}%`)
    .order('posted_at', { ascending: false })
    .limit(200);

  const rows = (data ?? []) as JobRow[];
  const matches = rows.filter(r => companySlug(r.company ?? '') === slug);
  if (matches.length === 0) return null;

  // Pick the most-frequent spelling of the company name as the canonical
  // display name. ATS feeds sometimes ship the same employer as "Stripe"
  // and "Stripe Inc"; we use whichever appears more often.
  const counts = new Map<string, number>();
  for (const r of matches) counts.set(r.company, (counts.get(r.company) ?? 0) + 1);
  let name = matches[0].company;
  let best = 0;
  for (const [n, c] of counts) if (c > best) { best = c; name = n; }

  return { name, jobs: matches.slice(0, 30), total: matches.length };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const found = await findCompany((await params).slug);
  if (!found) {
    return { title: 'Company not found | RemoteJobs44' };
  }
  const title = `${found.name} Remote Jobs (${found.total} open) | RemoteJobs44`;
  const description = `${found.total} open remote jobs at ${found.name}. Browse active listings and apply directly — RemoteJobs44.`;
  const url = `${BASE}/companies/${(await params).slug}`;
  const ogImage = `${BASE}/api/og?title=${encodeURIComponent(`${found.name} Remote Jobs`)}&company=${encodeURIComponent(found.name)}&subtitle=${encodeURIComponent(`${found.total} open positions`)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const found = await findCompany((await params).slug);
  if (!found) notFound();

  const { name, jobs, total } = found;
  const url = `${BASE}/companies/${(await params).slug}`;

  // Organization schema — lets Google build a Knowledge Panel entry +
  // sitelinks for branded queries. We don't have logo / sameAs / founding
  // year per company, so the schema is the minimum honest set.
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url,
  };

  // ItemList of the open positions, scoped to this company. Google
  // sometimes surfaces a JobPostingCarousel for these.
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Remote jobs at ${name}`,
    numberOfItems: jobs.length,
    itemListElement: jobs.map((j, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE}/jobs/${j.id}`,
      name: j.title,
    })),
  };

  return (
    <div className="max-w-[900px] mx-auto px-5 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd).replace(/</g, '\\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, '\\u003c') }}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home',      href: '/'           },
          { name: 'Companies', href: '/companies'  },
          { name,              href: `/companies/${(await params).slug}` },
        ]}
      />

      <Link href="/companies" className="text-sm text-stone-400 hover:text-brand-700 dark:hover:text-brand-400 transition-colors mb-6 inline-block">
        ← All companies
      </Link>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 shrink-0 rounded-2xl bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 flex items-center justify-center text-2xl font-black">
          {name[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">
            {name}
          </h1>
          <p className="text-stone-500 dark:text-stone-400 text-sm mt-1 inline-flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5" /> {total} open remote {total === 1 ? 'role' : 'roles'}
          </p>
        </div>
      </div>

      {/* Job list */}
      <div className="card divide-y divide-stone-100 dark:divide-[#1e3a5f]">
        {jobs.map(j => {
          const salary = formatSalary(j.salary_min ?? undefined, j.salary_max ?? undefined, j.currency ?? 'USD');
          return (
            <Link key={j.id} href={`/jobs/${j.id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-stone-900 dark:text-stone-100 truncate">{j.title}</p>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 inline-flex items-center gap-2 flex-wrap">
                  {j.location && (
                    <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{j.location}</span>
                  )}
                  {j.posted_at && <span>· {formatRelativeDate(j.posted_at)}</span>}
                </p>
              </div>
              {salary && (
                <span className="hidden md:inline font-bold text-xs text-brand-700 dark:text-brand-400 shrink-0">
                  {salary}
                </span>
              )}
              <ExternalLink className="w-4 h-4 text-stone-300 shrink-0" />
            </Link>
          );
        })}
      </div>

      {/* Footer nav back into the SEO surface */}
      <div className="mt-10 pt-8 border-t border-stone-200 dark:border-[#1e3a5f]">
        <h2 className="font-display font-bold text-sm uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-4">
          Explore more
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/companies" className="px-3 py-1.5 rounded-lg bg-stone-50 dark:bg-[#162033] text-stone-600 dark:text-stone-300 text-sm font-semibold hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">
            All companies
          </Link>
          <Link href="/jobs/category/engineering" className="px-3 py-1.5 rounded-lg bg-stone-50 dark:bg-[#162033] text-stone-600 dark:text-stone-300 text-sm font-semibold hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">
            Remote Engineering Jobs
          </Link>
          <Link href="/jobs/category/design" className="px-3 py-1.5 rounded-lg bg-stone-50 dark:bg-[#162033] text-stone-600 dark:text-stone-300 text-sm font-semibold hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">
            Remote Design Jobs
          </Link>
          <Link href="/jobs" className="px-3 py-1.5 rounded-lg bg-stone-50 dark:bg-[#162033] text-stone-600 dark:text-stone-300 text-sm font-semibold hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">
            Browse all jobs →
          </Link>
        </div>
      </div>
    </div>
  );
}
