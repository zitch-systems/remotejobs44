// app/companies/page.tsx — Companies directory (Server Component).
//
// Previously a 'use client' page that fetched /api/companies in a useEffect,
// so crawlers and AI indexers saw only a loading skeleton — the entire
// directory (hundreds of internal links to /companies/[slug]) was invisible
// to search. Now the aggregation runs server-side and the full list ships in
// the initial HTML; the search box is a thin client island over that data.
import type { Metadata } from 'next';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequesterPlan, canSeeCompanyName } from '@/lib/auth/requester-plan';
import Link from 'next/link';
import { CompaniesDirectory, type Company } from '@/components/companies/CompaniesDirectory';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';

const BASE = 'https://remotejobs44.com';

// Re-aggregate every 5 minutes (matches the old /api/companies revalidate) so
// fresh ingests surface without rebuilding on every request.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Remote Companies Hiring Worldwide',
  description: 'Browse remote-first companies hiring worldwide on RemoteJobs44 and explore their open roles — filter by name and see live role counts.',
  alternates: { canonical: `${BASE}/companies` },
  openGraph: {
    title: 'Remote Companies Hiring | RemoteJobs44',
    description: 'Explore remote-first companies actively hiring and their open roles.',
    url: `${BASE}/companies`,
    type: 'website',
  },
};

async function fetchCompanies(): Promise<Company[]> {
  try {
    const supabase = createAdminSupabaseClient();
    // Server-side GROUP BY via the companies_aggregate() RPC — returns the
    // complete, sorted employer list (PostgREST's 1000-row cap would otherwise
    // truncate a raw select to ~75 of the ~950 companies).
    const { data, error } = await supabase.rpc('companies_aggregate');
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      name:       r.name,
      logo:       r.logo ?? r.name?.[0]?.toUpperCase() ?? '?',
      jobCount:   Number(r.job_count ?? 0),
      categories: r.categories ?? [],
      featured:   !!r.featured,
    }));
  } catch {
    return [];
  }
}

export default async function CompaniesPage() {
  const plan = await getRequesterPlan(await createServerSupabaseClient());
  if (!canSeeCompanyName(plan)) {
    return (
      <div className="max-w-[680px] mx-auto px-5 py-20 text-center">
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 mb-3">Employer directory</h1>
        <p className="text-stone-500 dark:text-stone-400 mb-7">Employer names and company profiles are available with Pro monthly and annual plans.</p>
        <Link href="/pricing" className="btn btn-primary">View Pro plans</Link>
      </div>
    );
  }
  const companies = await fetchCompanies();

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Companies Hiring Remotely',
    url: `${BASE}/companies`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: companies.length,
      itemListElement: companies.slice(0, 50).map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
      })),
    },
  };

  return (
    <div className="max-w-[1440px] mx-auto px-5 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, '\\u003c') }}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home',      href: '/'          },
          { name: 'Companies', href: '/companies' },
        ]}
      />

      <div className="mb-8">
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight mb-2">
          Companies Hiring Remotely
        </h1>
        <p className="text-stone-400 dark:text-stone-500">
          {companies.length > 0
            ? `${companies.length} companies actively posting remote jobs`
            : 'Explore companies actively posting remote jobs'}
        </p>
      </div>

      <CompaniesDirectory companies={companies} />
    </div>
  );
}
