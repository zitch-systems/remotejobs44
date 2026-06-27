// app/jobs/industry/[slug]/page.tsx
// Programmatic SEO landing page per industry vertical (fintech, ai, saas, etc).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { INDUSTRIES } from '@/lib/seo-extra';
import { CATEGORIES, SKILLS } from '@/lib/seo-slices';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { buildSliceFaqs } from '@/lib/seo-faqs';
import { SliceListing } from '@/components/jobs/SliceListing';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';
export const revalidate = 3600;

export function generateStaticParams() {
  return INDUSTRIES.map(i => ({ slug: i.slug }));
}

function find(slug: string) {
  return INDUSTRIES.find(i => i.slug === slug.toLowerCase());
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const i = find((await params).slug);
  if (!i) return {};
  const title = `Remote ${i.label} Jobs | RemoteJobs44`;
  const description = `${i.blurb} Apply from Nigeria, Kenya, South Africa, and anywhere globally — 70,000+ remote jobs on RemoteJobs44.`;
  const url = `${BASE}/jobs/industry/${i.slug}`;
  const ogImage = `${BASE}/api/og?title=${encodeURIComponent(`Remote ${i.label} Jobs`)}&subtitle=${encodeURIComponent('Industry-specific roles on RemoteJobs44')}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

// Heuristic industry filter: match on job title / company / description keywords.
//
// These tokens feed `ilike '%token%'`, which is a SUBSTRING match, not a
// word match — so a two-letter token like 'ai' or 'ml' silently matches
// "av(ai)lable", "e(ma)il", "ht(ml)", "ret(ai)l", "m(ai)ntain" and floods
// the /jobs/industry/ai page with irrelevant roles (thin, off-topic content
// that hurts the page's relevance signal). Every token below is therefore
// ≥4 chars or a distinctive multi-word phrase that can't collide with a
// common English substring. Bare 'ai'/'ml' were replaced with explicit
// phrases ('artificial intelligence', 'ai engineer', 'ai/ml', 'ml engineer'),
// and 'game' with 'gaming'/'video game' to avoid 'engagement'/'management'.
const KEYWORDS: Record<string, string[]> = {
  fintech:    ['fintech','banking','payment','lending','neobank','wealthtech','trading'],
  crypto:     ['crypto','blockchain','web3','defi','nft','token','digital asset'],
  ai:         ['artificial intelligence','ai engineer','ai/ml','machine learning','ml engineer','llm','genai','deep learning'],
  saas:       ['saas','b2b software','platform engineer','enterprise software','workflow automation'],
  ecommerce:  ['ecommerce','e-commerce','marketplace','retail','shopify','commerce'],
  healthtech: ['healthtech','telemedicine','clinical','pharma','medical','wellness','therapy'],
  edtech:     ['edtech','education','tutoring','learning','school','course'],
  climate:    ['climate','carbon','renewable','sustainability','cleantech','solar'],
  gaming:     ['gaming','video game','esports','game studio','unity','unreal'],
  agency:     ['agency','consulting','consultancy','dev shop','creative studio'],
};

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const i = find((await params).slug);
  if (!i) notFound();

  let jobs: any[] = [];
  let total = 0;
  try {
    const supabase = createAdminSupabaseClient();
    const kws = KEYWORDS[i.slug] ?? [i.slug];
    // OR a series of ilike filters on title + description
    const ors = kws.flatMap(k => [`title.ilike.%${k}%`, `description.ilike.%${k}%`, `company.ilike.%${k}%`]).join(',');
    const { data, count } = await supabase
      .from('jobs')
      .select('id, title, company, location, posted_at', { count: 'exact' })
      .eq('is_active', true)
      .or(notExpired())
      .or(NOT_FLAGGED)
      .or(ors)
      .order('posted_at', { ascending: false })
      .limit(30);
    jobs = data ?? [];
    total = count ?? jobs.length;
  } catch {}

  const siblings = INDUSTRIES.filter(x => x.slug !== i.slug).slice(0, 5);
  const topCategories = CATEGORIES.slice(0, 3);
  const topSkills = SKILLS.slice(0, 3);
  const relatedLinks = [
    ...siblings.map(x => ({ label: `Remote ${x.label}`, href: `/jobs/industry/${x.slug}` })),
    ...topCategories.map(c => ({ label: `Remote ${c.label}`, href: `/jobs/category/${c.slug}` })),
    ...topSkills.map(s => ({ label: s.label, href: `/jobs/skill/${s.slug}` })),
  ];

  return (
    <SliceListing
      title={`Remote ${i.label} Jobs`}
      blurb={i.blurb}
      jobs={jobs}
      total={total}
      browseHref={`/jobs?q=${encodeURIComponent(i.label.toLowerCase())}`}
      breadcrumbs={[
        { name: 'Home',     href: '/'     },
        { name: 'Jobs',     href: '/jobs' },
        { name: i.label,    href: `/jobs/industry/${i.slug}` },
      ]}
      faqs={buildSliceFaqs('industry', i.label)}
      relatedLinks={relatedLinks}
    />
  );
}
