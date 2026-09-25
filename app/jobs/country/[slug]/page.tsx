// app/jobs/country/[slug]/page.tsx
// Per-country SEO landing page. We can't 100% match jobs to specific
// countries (most postings are "Worldwide"), so we filter to anywhere-friendly
// jobs and frame the page around the candidate's country eligibility.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { COUNTRIES, REGIONS, CATEGORIES, findCountry } from '@/lib/seo-slices';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { buildSliceFaqs } from '@/lib/seo-faqs';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { SliceListing } from '@/components/jobs/SliceListing';

const BASE = 'https://remotejobs44.com';

function countryBlurb(label: string, worldwide: boolean) {
  return worldwide
    ? 'Remote roles whose listed location mentions worldwide work. The wording may contain exceptions; confirm restrictions with the employer.'
    : `Roles whose listed location mentions ${label} or worldwide work. Confirm hiring eligibility with the employer.`;
}

export const dynamic = 'force-static';
export const revalidate = 3600;

export function generateStaticParams() {
  return COUNTRIES.map(c => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const country = findCountry((await params).slug);
  if (!country) return {};
  const title = `Remote Jobs in ${country.label} | RemoteJobs44`;
  const description = countryBlurb(country.label, country.slug === 'worldwide');
  const url = `${BASE}/jobs/country/${country.slug}`;
  const ogImage = `${BASE}/api/og?title=${encodeURIComponent(`Remote Jobs in ${country.label}`)}&subtitle=${encodeURIComponent('Review location details · RemoteJobs44')}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

export default async function CountryPage({ params }: { params: Promise<{ slug: string }> }) {
  const country = findCountry((await params).slug);
  if (!country) notFound();
  const worldwide = country.slug === 'worldwide';

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
      .or(worldwide
        ? 'location.ilike.%worldwide%,location.ilike.%work from anywhere%'
        : `location.ilike.%${country.label}%,location.ilike.%worldwide%,location.ilike.%work from anywhere%`)
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
      blurb={countryBlurb(country.label, worldwide)}
      jobs={jobs}
      total={total}
      browseHref={`/jobs?country=${encodeURIComponent(country.slug === 'usa' ? 'us' : country.slug)}`}
      breadcrumbs={[
        { name: 'Home',         href: '/'     },
        { name: 'Jobs',         href: '/jobs' },
        { name: country.label,  href: `/jobs/country/${country.slug}` },
      ]}
      faqs={buildSliceFaqs('country', country.label)}
      relatedLinks={relatedLinks}
    />
  );
}
