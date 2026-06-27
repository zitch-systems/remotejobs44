// app/jobs/industry/page.tsx — Industry hub index.
//
// The per-industry landing pages (/jobs/industry/[slug]) previously had no
// parent index — they were reachable only from the sitemap, which passes no
// internal anchor signal. This page gives the whole industry tree a single
// crawlable hub with descriptive links + an ItemList, so PageRank flows into
// each vertical and users can browse them.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, ArrowRight } from 'lucide-react';
import { INDUSTRIES } from '@/lib/seo-extra';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Remote Jobs by Industry — Fintech, AI, SaaS, Crypto & More | RemoteJobs44',
  description: `Browse 70,000+ remote jobs across ${INDUSTRIES.length} industries — fintech, AI & ML, SaaS, crypto, e-commerce, health tech and more. Apply from Nigeria, Africa & worldwide.`,
  alternates: { canonical: `${BASE}/jobs/industry` },
  openGraph: {
    title: 'Remote Jobs by Industry | RemoteJobs44',
    description: 'Explore remote roles by industry vertical — fintech, AI, SaaS, crypto, e-commerce, climate and more.',
    url: `${BASE}/jobs/industry`,
    type: 'website',
  },
};

const ITEMLIST_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Remote Jobs by Industry',
  numberOfItems: INDUSTRIES.length,
  itemListElement: INDUSTRIES.map((i, idx) => ({
    '@type': 'ListItem',
    position: idx + 1,
    url: `${BASE}/jobs/industry/${i.slug}`,
    name: `Remote ${i.label} Jobs`,
  })),
};

export default function IndustryHub() {
  return (
    <div className="max-w-[1000px] mx-auto px-5 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ITEMLIST_JSONLD).replace(/</g, '\\u003c') }}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home',     href: '/'              },
          { name: 'Jobs',     href: '/jobs'          },
          { name: 'Industry', href: '/jobs/industry' },
        ]}
      />

      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold uppercase tracking-wider mb-3">
          <Building2 className="w-3.5 h-3.5" /> By Industry
        </div>
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">
          Remote Jobs by Industry
        </h1>
        <p className="text-stone-500 dark:text-stone-400 mt-3 max-w-2xl mx-auto leading-relaxed">
          Explore remote roles by industry vertical. Each hub aggregates live openings from global companies hiring across {INDUSTRIES.length} sectors — open to candidates in Nigeria, across Africa, and worldwide.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {INDUSTRIES.map(i => (
          <Link key={i.slug} href={`/jobs/industry/${i.slug}`} className="card p-5 hover:border-brand-600 dark:hover:border-brand-500 hover:-translate-y-0.5 transition-all group">
            <h2 className="font-display font-bold text-base text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors mb-2">
              Remote {i.label} Jobs
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 line-clamp-2 mb-3">{i.blurb}</p>
            <span className="inline-flex items-center gap-1 text-xs text-brand-700 dark:text-brand-400 font-bold">
              Browse {i.label} roles <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
