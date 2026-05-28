// app/jobs/region/[slug]/page.tsx — Per-region SEO landing page.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { REGIONS, COUNTRIES, CATEGORIES, findRegion } from '@/lib/seo-slices';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { SliceListing } from '@/components/jobs/SliceListing';

const BASE = 'https://remotejobs44.com';

const REGION_KEYWORDS: Record<string, string[]> = {
  africa:       ['africa', 'nigeria', 'kenya', 'south africa', 'ghana', 'egypt', 'morocco', 'rwanda', 'uganda'],
  europe:       ['europe', 'uk', 'germany', 'france', 'spain', 'netherlands', 'sweden', 'poland'],
  americas:     ['united states', 'us', 'usa', 'canada', 'mexico', 'brazil', 'argentina', 'latam'],
  asia:         ['asia', 'india', 'philippines', 'singapore', 'japan', 'pakistan', 'vietnam', 'indonesia'],
  'middle-east':['middle east', 'uae', 'dubai', 'saudi', 'qatar', 'israel', 'turkey'],
  worldwide:    ['worldwide', 'anywhere', 'global', 'remote'],
};

export const dynamic = 'force-static';
export const revalidate = 3600;

export function generateStaticParams() {
  return REGIONS.map(r => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const region = findRegion(params.slug);
  if (!region) return {};
  const title = `Remote Jobs in ${region.label} | RemoteJobs44`;
  const description = `${region.blurb} Browse and apply — updated daily.`;
  const url = `${BASE}/jobs/region/${region.slug}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
  };
}

export default async function RegionPage({ params }: { params: { slug: string } }) {
  const region = findRegion(params.slug);
  if (!region) notFound();

  let jobs: any[] = [];
  let total = 0;
  try {
    const supabase = createAdminSupabaseClient();
    const keywords = REGION_KEYWORDS[region.slug] ?? [region.slug];
    const orClause = keywords.map(k => `location.ilike.%${k.replace(/[(),]/g,'')}%`).join(',');
    const { data, count } = await supabase
      .from('jobs')
      .select('id, title, company, location, posted_at', { count: 'exact' })
      .eq('is_active', true)
      .or(notExpired())
      .or(NOT_FLAGGED)
      .or(orClause)
      .order('posted_at', { ascending: false })
      .limit(30);
    jobs = data ?? [];
    total = count ?? jobs.length;
  } catch {}

  const siblings = REGIONS.filter(r => r.slug !== region.slug).slice(0, 5);
  const topCountries = COUNTRIES.slice(0, 4);
  const topCategories = CATEGORIES.slice(0, 3);
  const relatedLinks = [
    ...siblings.map(r => ({ label: `Jobs in ${r.label}`, href: `/jobs/region/${r.slug}` })),
    ...topCountries.map(c => ({ label: `Jobs in ${c.label}`, href: `/jobs/country/${c.slug}` })),
    ...topCategories.map(c => ({ label: `Remote ${c.label}`, href: `/jobs/category/${c.slug}` })),
  ];

  return (
    <SliceListing
      title={`Remote Jobs in ${region.label}`}
      blurb={region.blurb}
      jobs={jobs}
      total={total}
      browseHref={`/jobs?q=${encodeURIComponent(region.label)}`}
      relatedLinks={relatedLinks}
    />
  );
}
