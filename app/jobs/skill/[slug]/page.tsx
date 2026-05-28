// app/jobs/skill/[slug]/page.tsx — Per-skill SEO landing page.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SKILLS, CATEGORIES, findSkill } from '@/lib/seo-slices';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { SliceListing } from '@/components/jobs/SliceListing';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';
export const revalidate = 3600;

export function generateStaticParams() {
  return SKILLS.map(s => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const skill = findSkill(params.slug);
  if (!skill) return {};
  const title = `Remote ${skill.label} Jobs | RemoteJobs44`;
  const description = `${skill.blurb} Apply from anywhere — updated every few hours.`;
  const url = `${BASE}/jobs/skill/${skill.slug}`;
  const ogImage = `${BASE}/api/og?title=${encodeURIComponent(`Remote ${skill.label} Jobs`)}&subtitle=${encodeURIComponent('Open positions on RemoteJobs44')}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

export default async function SkillPage({ params }: { params: { slug: string } }) {
  const skill = findSkill(params.slug);
  if (!skill) notFound();

  let jobs: any[] = [];
  let total = 0;
  try {
    const supabase = createAdminSupabaseClient();
    // Match against title or skills array. Description is too noisy for an OR.
    const { data, count } = await supabase
      .from('jobs')
      .select('id, title, company, location, posted_at', { count: 'exact' })
      .eq('is_active', true)
      .or(notExpired())
      .or(NOT_FLAGGED)
      .or(`title.ilike.%${skill.label}%,skills.cs.{${skill.label}}`)
      .order('posted_at', { ascending: false })
      .limit(30);
    jobs = data ?? [];
    total = count ?? jobs.length;
  } catch {}

  // Sibling skills + 3 top categories — feed PageRank back into the SEO
  // surface so each skill page isn't an internal-link dead-end.
  const siblings = SKILLS.filter(s => s.slug !== skill.slug).slice(0, 6);
  const topCategories = CATEGORIES.slice(0, 3);
  const relatedLinks = [
    ...siblings.map(s => ({ label: s.label, href: `/jobs/skill/${s.slug}` })),
    ...topCategories.map(c => ({ label: `Remote ${c.label}`, href: `/jobs/category/${c.slug}` })),
  ];

  return (
    <SliceListing
      title={`Remote ${skill.label} Jobs`}
      blurb={skill.blurb}
      jobs={jobs}
      total={total}
      browseHref={`/jobs?q=${encodeURIComponent(skill.label)}`}
      relatedLinks={relatedLinks}
    />
  );
}
