// app/jobs/category/[slug]/page.tsx
// Programmatic SEO landing page for each job category. Server-rendered with
// per-slug metadata so Google / Bing / AI search engines can index each one.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATEGORIES, findCategory } from '@/lib/seo-slices';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { SliceListing } from '@/components/jobs/SliceListing';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';
export const revalidate = 3600; // refresh hourly

export function generateStaticParams() {
  return CATEGORIES.map(c => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const cat = findCategory(params.slug);
  if (!cat) return {};
  const title = `Remote ${cat.label} Jobs | RemoteJobs44`;
  const description = `${cat.blurb} Browse open positions and apply from Africa and anywhere in the world.`;
  const url = `${BASE}/jobs/category/${cat.slug}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const cat = findCategory(params.slug);
  if (!cat) notFound();

  let jobs: any[] = [];
  let total = 0;
  try {
    const supabase = createAdminSupabaseClient();
    const { data, count } = await supabase
      .from('jobs')
      .select('id, title, company, location, posted_at', { count: 'exact' })
      .eq('is_active', true)
      .eq('category', cat.slug)
      .order('posted_at', { ascending: false })
      .limit(30);
    jobs = data ?? [];
    total = count ?? jobs.length;
  } catch {}

  return (
    <SliceListing
      title={`Remote ${cat.label} Jobs`}
      blurb={cat.blurb}
      jobs={jobs}
      total={total}
      browseHref={`/jobs?category=${cat.slug}`}
    />
  );
}
