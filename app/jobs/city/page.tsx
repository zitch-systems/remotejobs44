// app/jobs/city/page.tsx — City hub index.
//
// Parent index for the per-city landing pages (/jobs/city/[slug]). Gives the
// city tree a single crawlable hub with descriptive internal links + an
// ItemList so each city page gets a sitewide anchor instead of living only in
// the sitemap.
import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, ArrowRight } from 'lucide-react';
import { CITIES } from '@/lib/seo-extra';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Remote Jobs by City — Lagos, Nairobi, Accra, Cairo & More | RemoteJobs44',
  description: `Remote jobs open to candidates in ${CITIES.length} African cities — Lagos, Abuja, Nairobi, Accra, Cairo, Cape Town and more. Work from home for global companies.`,
  alternates: { canonical: `${BASE}/jobs/city` },
  openGraph: {
    title: 'Remote Jobs by City | RemoteJobs44',
    description: 'Find remote roles open to your city — Lagos, Nairobi, Accra, Cairo, Cape Town, Kigali and more.',
    url: `${BASE}/jobs/city`,
    type: 'website',
  },
};

const ITEMLIST_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Remote Jobs by City',
  numberOfItems: CITIES.length,
  itemListElement: CITIES.map((c, idx) => ({
    '@type': 'ListItem',
    position: idx + 1,
    url: `${BASE}/jobs/city/${c.slug}`,
    name: `Remote Jobs in ${c.label}`,
  })),
};

export default function CityHub() {
  return (
    <div className="max-w-[1000px] mx-auto px-5 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ITEMLIST_JSONLD).replace(/</g, '\\u003c') }}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', href: '/'          },
          { name: 'Jobs', href: '/jobs'      },
          { name: 'City', href: '/jobs/city' },
        ]}
      />

      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold uppercase tracking-wider mb-3">
          <MapPin className="w-3.5 h-3.5" /> By City
        </div>
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">
          Remote Jobs by City
        </h1>
        <p className="text-stone-500 dark:text-stone-400 mt-3 max-w-2xl mx-auto leading-relaxed">
          Remote roles open to candidates in {CITIES.length} major African cities. Each page surfaces live openings from global remote-first companies, with timezone overlap notes for your location.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CITIES.map(c => (
          <Link key={c.slug} href={`/jobs/city/${c.slug}`} className="card p-5 hover:border-brand-600 dark:hover:border-brand-500 hover:-translate-y-0.5 transition-all group">
            <h2 className="font-display font-bold text-base text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors mb-2">
              Remote Jobs in {c.label}
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 line-clamp-2 mb-3">{c.blurb}</p>
            <span className="inline-flex items-center gap-1 text-xs text-brand-700 dark:text-brand-400 font-bold">
              Browse {c.label} roles <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
