// app/compare/[slug]/page.tsx — RemoteJobs44 vs <competitor>.
// Captures branded-search traffic ("remotejobs44 vs flexjobs") + provides
// genuinely useful comparison content.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, X, ArrowLeft, ArrowRight } from 'lucide-react';
import { COMPETITORS } from '@/lib/seo-extra';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return COMPETITORS.map(c => ({ slug: c.slug }));
}

function find(slug: string) {
  return COMPETITORS.find(c => c.slug === slug.toLowerCase());
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = find((await params).slug);
  if (!c) return {};
  const title = `RemoteJobs44 vs ${c.name} — Honest Comparison 2026`;
  const description = `Comparing RemoteJobs44 and ${c.name} for remote job seekers in Africa. ${c.oneLiner} Pricing, listings, AI tools, and fit for African talent.`;
  const url = `${BASE}/compare/${c.slug}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

const RJ44_ROWS = [
  { feature: 'Total listings', us: '70,000+ aggregated', them: (c: string) => c },
  { feature: 'Free tier', us: 'Browse all 70,000+', them: () => 'Limited / paid' },
  { feature: 'Day Pass pricing', us: '₦500 / 24h, 10 applies', them: () => 'No day pass' },
  { feature: 'Pro Monthly', us: '₦2,999 (~$2 USD)', them: () => '$15–$30 USD' },
  { feature: 'AI CV Review', us: 'Included on Pro', them: () => 'Not offered' },
  { feature: 'AI Interview Prep', us: 'Included on Pro', them: () => 'Not offered' },
  { feature: 'Application tracker', us: 'Yes — Kanban-style', them: () => 'No' },
  { feature: 'African pricing', us: 'Built for NGN/KES/GHS', them: () => 'USD only' },
  { feature: 'Refreshes', us: 'Every 6 hours', them: () => 'Varies' },
];

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const c = find((await params).slug);
  if (!c) notFound();

  return (
    <div className="max-w-[900px] mx-auto px-5 py-10">
      <Link href="/compare" className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-brand-700 dark:hover:text-brand-400 transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" /> All comparisons
      </Link>

      <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">
        RemoteJobs44 vs {c.name}
      </h1>
      <p className="text-stone-500 dark:text-stone-400 mt-3 leading-relaxed max-w-2xl">
        {c.oneLiner} Below: side-by-side on the features that matter most for African remote job seekers.
      </p>

      {/* Comparison table */}
      <div className="card overflow-hidden mt-6">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 dark:bg-[#0f1e38] border-b border-stone-100 dark:border-[#1e3a5f]">
            <tr>
              <th className="text-left p-4 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Feature</th>
              <th className="text-left p-4 text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400">RemoteJobs44</th>
              <th className="text-left p-4 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">{c.name}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-[#1e3a5f]">
            {RJ44_ROWS.map(row => (
              <tr key={row.feature}>
                <td className="p-4 font-bold text-stone-900 dark:text-stone-100">{row.feature}</td>
                <td className="p-4 text-stone-700 dark:text-stone-300">{row.us}</td>
                <td className="p-4 text-stone-500 dark:text-stone-400">{typeof row.them === 'function' ? row.them(c.name) : row.them}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pros / cons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
        <div className="card p-5">
          <h2 className="font-bold text-sm text-brand-700 dark:text-brand-400 mb-3 flex items-center gap-1.5">
            <Check className="w-4 h-4" /> {c.name} — strengths
          </h2>
          <ul className="space-y-2">
            {c.pros.map((p, i) => (
              <li key={i} className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed pl-4 relative">
                <span className="absolute left-0 text-brand-600">·</span>{p}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="font-bold text-sm text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-1.5">
            <X className="w-4 h-4" /> Where RemoteJobs44 fits better
          </h2>
          <ul className="space-y-2">
            {c.cons.map((co, i) => (
              <li key={i} className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed pl-4 relative">
                <span className="absolute left-0 text-amber-600">·</span>{co}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* CTA */}
      <div className="card p-6 mt-6 bg-brand-50/40 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800 text-center">
        <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">Try RemoteJobs44 free</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
          Browse 70,000+ remote jobs free. Day Pass from ₦500 unlocks apply links and AI tools.
        </p>
        <Link href="/jobs"
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
          Browse jobs <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
