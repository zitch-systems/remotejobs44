// app/jobs/timezone/[slug]/page.tsx — Per-timezone SEO landing page.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TIMEZONES, REGIONS, CATEGORIES, findTimezone } from '@/lib/seo-slices';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { buildSliceFaqs } from '@/lib/seo-faqs';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { SliceListing } from '@/components/jobs/SliceListing';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';
export const revalidate = 3600;

export function generateStaticParams() {
  return TIMEZONES.map(t => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tz = findTimezone((await params).slug);
  if (!tz) return {};
  const title = `Remote Jobs — ${tz.label} | RemoteJobs44`;
  const description = `${tz.blurb} Updated every few hours.`;
  const url = `${BASE}/jobs/timezone/${tz.slug}`;
  const ogImage = `${BASE}/api/og?title=${encodeURIComponent(`Remote jobs — ${tz.label.split(' (')[0]}`)}&subtitle=${encodeURIComponent('Timezone-friendly roles on RemoteJobs44')}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

export default async function TimezonePage({ params }: { params: Promise<{ slug: string }> }) {
  const tz = findTimezone((await params).slug);
  if (!tz) notFound();

  let jobs: any[] = [];
  let total = 0;
  try {
    const supabase = createAdminSupabaseClient();
    // Tag-based filter where we have it, otherwise fall back to title ilike.
    const tag = tz.slug.toUpperCase();
    const { data, count } = await supabase
      .from('jobs')
      .select('id, title, company, location, posted_at', { count: 'exact' })
      .eq('is_active', true)
      .or(notExpired())
      .or(NOT_FLAGGED)
      .or(`timezone.ilike.%${tag}%,location.ilike.%${tag}%,location.ilike.%worldwide%,location.ilike.%anywhere%`)
      .order('posted_at', { ascending: false })
      .limit(30);
    jobs = data ?? [];
    total = count ?? jobs.length;
  } catch {}

  const siblings = TIMEZONES.filter(t => t.slug !== tz.slug).slice(0, 5);
  const topRegions = REGIONS.slice(0, 3);
  const topCategories = CATEGORIES.slice(0, 3);
  const relatedLinks = [
    ...siblings.map(t => ({ label: t.label.split(' (')[0], href: `/jobs/timezone/${t.slug}` })),
    ...topRegions.map(r => ({ label: `Jobs in ${r.label}`, href: `/jobs/region/${r.slug}` })),
    ...topCategories.map(c => ({ label: `Remote ${c.label}`, href: `/jobs/category/${c.slug}` })),
  ];

  return (
    <SliceListing
      title={`Remote Jobs — ${tz.label}`}
      blurb={tz.blurb}
      jobs={jobs}
      total={total}
      browseHref={`/jobs?q=${encodeURIComponent(tz.label.split(' (')[0])}`}
      breadcrumbs={[
        { name: 'Home',                          href: '/'     },
        { name: 'Jobs',                          href: '/jobs' },
        { name: tz.label.split(' (')[0],         href: `/jobs/timezone/${tz.slug}` },
      ]}
      faqs={buildSliceFaqs('timezone', tz.label.split(' (')[0])}
      relatedLinks={relatedLinks}
    />
  );
}
