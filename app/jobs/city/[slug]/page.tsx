// app/jobs/city/[slug]/page.tsx
// City-level landing pages — "Remote Jobs in Lagos / Nairobi / Cape Town /..."
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CITIES } from '@/lib/seo-extra';
import { COUNTRIES, CATEGORIES } from '@/lib/seo-slices';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { buildSliceFaqs } from '@/lib/seo-faqs';
import { SliceListing } from '@/components/jobs/SliceListing';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';
export const revalidate = 3600;

export function generateStaticParams() {
  return CITIES.map(c => ({ slug: c.slug }));
}

function find(slug: string) {
  return CITIES.find(c => c.slug === slug.toLowerCase());
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = find(params.slug);
  if (!c) return {};
  const title = `Remote Jobs in ${c.label} | Work from Home for Global Companies`;
  const description = `${c.blurb} Remote roles open to ${c.label}-based talent on RemoteJobs44 — paid in USD, GBP, EUR.`;
  const url = `${BASE}/jobs/city/${c.slug}`;
  const ogImage = `${BASE}/api/og?title=${encodeURIComponent(`Remote Jobs in ${c.label}`)}&subtitle=${encodeURIComponent('Work for global companies · RemoteJobs44')}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

export default async function CityPage({ params }: { params: { slug: string } }) {
  const c = find(params.slug);
  if (!c) notFound();

  // Most "remote" jobs are not city-specific. We surface a mix of:
  // (a) jobs whose location field mentions the city, and
  // (b) general remote / worldwide listings the candidate would still qualify for.
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
      .or(`location.ilike.%${c.label}%,location.ilike.%remote%,location.ilike.%worldwide%`)
      .order('posted_at', { ascending: false })
      .limit(30);
    jobs = data ?? [];
    total = count ?? jobs.length;
  } catch {}

  const siblings = CITIES.filter(x => x.slug !== c.slug).slice(0, 5);
  const topCountries = COUNTRIES.slice(0, 4);
  const topCategories = CATEGORIES.slice(0, 3);
  const relatedLinks = [
    ...siblings.map(x => ({ label: `Jobs in ${x.label}`, href: `/jobs/city/${x.slug}` })),
    ...topCountries.map(co => ({ label: `Jobs in ${co.label}`, href: `/jobs/country/${co.slug}` })),
    ...topCategories.map(cat => ({ label: `Remote ${cat.label}`, href: `/jobs/category/${cat.slug}` })),
  ];

  return (
    <SliceListing
      title={`Remote Jobs in ${c.label}`}
      blurb={c.blurb}
      jobs={jobs}
      total={total}
      browseHref={`/jobs?q=${encodeURIComponent(c.label)}`}
      breadcrumbs={[
        { name: 'Home',    href: '/'     },
        { name: 'Jobs',    href: '/jobs' },
        { name: c.label,   href: `/jobs/city/${c.slug}` },
      ]}
      faqs={buildSliceFaqs('city', c.label)}
      relatedLinks={relatedLinks}
    />
  );
}
