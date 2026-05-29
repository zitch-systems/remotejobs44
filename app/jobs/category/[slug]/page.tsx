// app/jobs/category/[slug]/page.tsx
// Programmatic SEO landing page for each job category. Server-rendered with
// per-slug metadata so Google / Bing / AI search engines can index each one.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATEGORIES, findCategory, SKILLS } from '@/lib/seo-slices';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { buildSliceFaqs } from '@/lib/seo-faqs';
import { SliceListing } from '@/components/jobs/SliceListing';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';
export const revalidate = 3600; // refresh hourly

export function generateStaticParams() {
  return CATEGORIES.map(c => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const cat = findCategory((await params).slug);
  if (!cat) return {};
  const title = `Remote ${cat.label} Jobs | RemoteJobs44`;
  const description = `${cat.blurb} Browse open positions and apply from Africa and anywhere in the world.`;
  const url = `${BASE}/jobs/category/${cat.slug}`;
  // Dynamic OG so the social card matches the page subject — previously
  // every category/skill/country shared the same generic remotejobs44 OG.
  const ogImage = `${BASE}/api/og?title=${encodeURIComponent(`Remote ${cat.label} Jobs`)}&subtitle=${encodeURIComponent('Browse on RemoteJobs44 — Day Pass from ₦500')}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const cat = findCategory((await params).slug);
  if (!cat) notFound();

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
      .eq('category', cat.slug)
      .order('posted_at', { ascending: false })
      .limit(30);
    jobs = data ?? [];
    total = count ?? jobs.length;
  } catch {}

  // 5 sibling categories + 4 skills, so PageRank flows back into the SEO
  // surface. Skills are sampled from the top of the catalogue (the most
  // searched-for ones); over time we could tailor per category.
  const siblings = CATEGORIES.filter(c => c.slug !== cat.slug).slice(0, 5);
  const topSkills = SKILLS.slice(0, 4);
  const relatedLinks = [
    ...siblings.map(c => ({ label: `Remote ${c.label}`, href: `/jobs/category/${c.slug}` })),
    ...topSkills.map(s => ({ label: s.label, href: `/jobs/skill/${s.slug}` })),
  ];

  return (
    <SliceListing
      title={`Remote ${cat.label} Jobs`}
      blurb={cat.blurb}
      jobs={jobs}
      total={total}
      browseHref={`/jobs?category=${cat.slug}`}
      breadcrumbs={[
        { name: 'Home',     href: '/'     },
        { name: 'Jobs',     href: '/jobs' },
        { name: cat.label,  href: `/jobs/category/${cat.slug}` },
      ]}
      faqs={buildSliceFaqs('category', cat.label)}
      relatedLinks={relatedLinks}
    />
  );
}
