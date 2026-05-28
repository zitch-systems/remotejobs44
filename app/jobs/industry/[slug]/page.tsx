// app/jobs/industry/[slug]/page.tsx
// Programmatic SEO landing page per industry vertical (fintech, ai, saas, etc).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { INDUSTRIES } from '@/lib/seo-extra';
import { CATEGORIES, SKILLS } from '@/lib/seo-slices';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
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

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const i = find(params.slug);
  if (!i) return {};
  const title = `Remote ${i.label} Jobs | RemoteJobs44`;
  const description = `${i.blurb} Apply from Nigeria, Kenya, South Africa, and anywhere globally — 50,000+ remote jobs on RemoteJobs44.`;
  const url = `${BASE}/jobs/industry/${i.slug}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

// Heuristic industry filter: match on job title / company / description keywords.
const KEYWORDS: Record<string, string[]> = {
  fintech:    ['fintech','bank','payment','lending','neobank','wealth','trading'],
  crypto:     ['crypto','blockchain','web3','defi','nft','exchange','token','chain'],
  ai:         ['ai','machine learning','ml','llm','genai','model','inference'],
  saas:       ['saas','b2b','platform','enterprise','workflow','automation'],
  ecommerce:  ['ecommerce','e-commerce','marketplace','retail','shopify','dtc','commerce'],
  healthtech: ['health','telemedicine','clinical','pharma','medical','wellness','therapy'],
  edtech:     ['edtech','education','tutoring','learning','lms','school','course'],
  climate:    ['climate','carbon','renewable','energy','sustain','green','solar'],
  gaming:     ['game','gaming','esports','unity','unreal','console'],
  agency:     ['agency','consulting','consultancy','dev shop','studio'],
};

export default async function IndustryPage({ params }: { params: { slug: string } }) {
  const i = find(params.slug);
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
      relatedLinks={relatedLinks}
    />
  );
}
