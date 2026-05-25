// app/jobs/timezone/[slug]/page.tsx — Per-timezone SEO landing page.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TIMEZONES, findTimezone } from '@/lib/seo-slices';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { SliceListing } from '@/components/jobs/SliceListing';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';
export const revalidate = 3600;

export function generateStaticParams() {
  return TIMEZONES.map(t => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const tz = findTimezone(params.slug);
  if (!tz) return {};
  const title = `Remote Jobs — ${tz.label} | RemoteJobs44`;
  const description = `${tz.blurb} Updated every few hours.`;
  const url = `${BASE}/jobs/timezone/${tz.slug}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
  };
}

export default async function TimezonePage({ params }: { params: { slug: string } }) {
  const tz = findTimezone(params.slug);
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
      .or(`timezone.ilike.%${tag}%,location.ilike.%${tag}%,location.ilike.%worldwide%,location.ilike.%anywhere%`)
      .order('posted_at', { ascending: false })
      .limit(30);
    jobs = data ?? [];
    total = count ?? jobs.length;
  } catch {}

  return (
    <SliceListing
      title={`Remote Jobs — ${tz.label}`}
      blurb={tz.blurb}
      jobs={jobs}
      total={total}
      browseHref={`/jobs?q=${encodeURIComponent(tz.label.split(' (')[0])}`}
    />
  );
}
