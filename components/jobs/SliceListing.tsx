// components/jobs/SliceListing.tsx
// Renders a single "slice" landing page: heading, blurb, then a clean list of
// the first ~30 jobs that match the filter, with a CTA to view all matches.
// Used by /jobs/category/[slug], /jobs/country/[slug], /jobs/skill/[slug],
// /jobs/timezone/[slug], and /jobs/region/[slug].
import Link from 'next/link';
import { ArrowRight, MapPin, Building2 } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import { FaqJsonLd } from '@/components/seo/FaqJsonLd';
import { CompanyMask } from '@/components/jobs/CompanyMask';

interface Job {
  id: string;
  title: string;
  company: string;
  location?: string;
  posted_at?: string;
}

// Same base-URL pattern used in /jobs/[id] + sitemap; preview deploys
// emit ItemList URLs at their own origin instead of leaking to prod.
const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.com').replace(/\/$/, '');

export function SliceListing({
  title,
  blurb,
  jobs,
  total,
  browseHref,
  breadcrumbs,
  faqs,
  relatedLinks,
}: {
  title: string;
  blurb: string;
  jobs: Job[];
  total: number;
  browseHref: string;
  /**
   * Breadcrumb trail for sitelinks. The page passes its own crumbs in
   * (e.g. category page → ['Home', 'Jobs', 'Engineering']); we drop the
   * BreadcrumbList JSON-LD here so Google renders sitelinks in SERPs.
   */
  breadcrumbs?: Array<{ name: string; href: string }>;
  /**
   * Page-relevant Q&A items. Rendered visibly as an accordion-free FAQ
   * block AND emitted as FAQPage JSON-LD (rich-result target). See
   * lib/seo-faqs.ts for the per-slice templates.
   */
  faqs?: Array<{ q: string; a: string }>;
  /**
   * Internal links to sibling landing pages — same category, same skill
   * family, neighbouring region/timezone, etc. Recirculates PageRank
   * across the programmatic SEO surface so the 200+ landing pages stop
   * being orphans of the global nav.
   */
  relatedLinks?: Array<{ label: string; href: string }>;
}) {
  // ItemList JSON-LD — gives Google + AI engines (Perplexity, ChatGPT,
  // ClaudeBot, Gemini) a structured signal that this slice is a curated
  // jobs feed. Pairs with the BreadcrumbList + FAQPage above to make the
  // slice page a citable answer source. Cap at 25 items — long ItemLists
  // are deprioritised in rich-result eligibility.
  const itemList = jobs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    numberOfItems: jobs.length,
    itemListElement: jobs.slice(0, 25).map((j, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE}/jobs/${j.id}`,
      name: `${j.title} at ${j.company}`,
    })),
  } : null;

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-10">
      {breadcrumbs && breadcrumbs.length > 0 && <BreadcrumbJsonLd items={breadcrumbs} />}
      {faqs && faqs.length > 0 && <FaqJsonLd items={faqs} />}
      {itemList && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, '\\u003c') }}
        />
      )}
      <div className="mb-8">
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">{title}</h1>
        <p className="text-stone-500 dark:text-stone-400 mt-2 max-w-2xl leading-relaxed">{blurb}</p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 font-bold">
            {total.toLocaleString()} open roles
          </span>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-stone-400 mb-4">No matching jobs right now. New listings get added every few hours.</p>
          <Link href="/jobs" className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
            Browse all jobs <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="card divide-y divide-stone-100 dark:divide-[#1e3a5f]">
          {jobs.map(j => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 flex items-center justify-center text-sm font-black">
                {j.company[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">{j.title}</p>
                <p className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" /><CompanyMask company={j.company} /></span>
                  {j.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{j.location}</span>}
                  {j.posted_at && <span>· {formatRelativeDate(j.posted_at)}</span>}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-stone-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href={browseHref} className="inline-flex items-center gap-2 px-5 py-2.5 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 text-sm font-bold rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
          See all {total.toLocaleString()} jobs <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Visible FAQ section — same Q&A pairs as the FAQPage JSON-LD
          above. Users get the content directly; Google + Perplexity +
          ChatGPT can extract the rich-result accordion from the schema. */}
      {faqs && faqs.length > 0 && (
        <section className="mt-12 pt-8 border-t border-stone-200 dark:border-[#1e3a5f]">
          <h2 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-5">
            Frequently asked
          </h2>
          <div className="space-y-5">
            {faqs.map((faq, i) => (
              <div key={i}>
                <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100 mb-1.5">
                  {faq.q}
                </h3>
                <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {relatedLinks && relatedLinks.length > 0 && (
        <div className="mt-12 pt-8 border-t border-stone-200 dark:border-[#1e3a5f]">
          <h2 className="font-display font-bold text-sm uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-4">
            Browse related
          </h2>
          <div className="flex flex-wrap gap-2">
            {relatedLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 rounded-lg bg-stone-50 dark:bg-[#162033] text-stone-600 dark:text-stone-300 text-sm font-semibold hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
