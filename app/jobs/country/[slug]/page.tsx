// app/jobs/country/[slug]/page.tsx
// Per-country SEO landing page. We can't 100% match jobs to specific
// countries (most postings are "Worldwide"), so we filter to anywhere-friendly
// jobs and frame the page around the candidate's country eligibility.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { COUNTRIES, REGIONS, CATEGORIES, findCountry } from '@/lib/seo-slices';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { SliceListing } from '@/components/jobs/SliceListing';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';
export const revalidate = 3600;

export function generateStaticParams() {
  return COUNTRIES.map(c => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const country = findCountry(params.slug);
  if (!country) return {};
  const title = `Remote Jobs in ${country.label} | RemoteJobs44`;
  const description = `${country.blurb} Updated daily — apply from ${country.label} to global companies.`;
  const url = `${BASE}/jobs/country/${country.slug}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
  };
}

export default async function CountryPage({ params }: { params: { slug: string } }) {
  const country = findCountry(params.slug);
  if (!country) notFound();

  let jobs: any[] = [];
  let total = 0;
  try {
    const supabase = createAdminSupabaseClient();
    const { data, count } = await supabase
      .from('jobs')
      .select('id, title, company, location, posted_at', { count: 'exact' })
      .eq('is_active', true)
      .or(notExpired())
      .or(NOT_FLAGGED)
      .or(`location.ilike.%${country.label}%,location.ilike.%worldwide%,location.ilike.%anywhere%,location.ilike.%global%`)
      .order('posted_at', { ascending: false })
      .limit(30);
    jobs = data ?? [];
    total = count ?? jobs.length;
  } catch {}

  const siblings = COUNTRIES.filter(c => c.slug !== country.slug).slice(0, 5);
  const topRegions = REGIONS.slice(0, 3);
  const topCategories = CATEGORIES.slice(0, 3);
  const relatedLinks = [
    ...siblings.map(c => ({ label: `Jobs in ${c.label}`, href: `/jobs/country/${c.slug}` })),
    ...topRegions.map(r => ({ label: `Jobs in ${r.label}`, href: `/jobs/region/${r.slug}` })),
    ...topCategories.map(c => ({ label: `Remote ${c.label}`, href: `/jobs/category/${c.slug}` })),
  ];

  return (
    <SliceListing
      title={`Remote Jobs in ${country.label}`}
      blurb={country.blurb}
      jobs={jobs}
      total={total}
      browseHref={`/jobs?q=${encodeURIComponent(country.label)}`}
      relatedLinks={relatedLinks}
    />
  );
}
