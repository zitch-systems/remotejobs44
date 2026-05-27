// app/compare/page.tsx — Hub for competitor comparisons.
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Scale } from 'lucide-react';
import { COMPETITORS } from '@/lib/seo-extra';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'RemoteJobs44 vs Other Remote Job Boards — Honest Comparisons',
  description: 'Side-by-side comparisons of RemoteJobs44 with Remote.co, FlexJobs, WeWorkRemotely, RemoteOK, and Indeed. Pricing, AI tools, and fit for African talent.',
  alternates: { canonical: `${BASE}/compare` },
};

export default function CompareHub() {
  return (
    <div className="max-w-[900px] mx-auto px-5 py-10">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold uppercase tracking-wider mb-3">
          <Scale className="w-3.5 h-3.5" /> Comparisons
        </div>
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">
          RemoteJobs44 vs Other Job Boards
        </h1>
        <p className="text-stone-500 dark:text-stone-400 mt-3 max-w-2xl mx-auto leading-relaxed">
          Honest side-by-side comparisons. No marketing fluff — pricing, listings, AI tools, and fit for African remote workers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {COMPETITORS.map(c => (
          <Link key={c.slug} href={`/compare/${c.slug}`}
            className="card p-5 hover:border-brand-600 dark:hover:border-brand-500 hover:-translate-y-0.5 transition-all group">
            <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors mb-2">
              vs {c.name}
            </h3>
            <p className="text-sm text-stone-500 dark:text-stone-400 line-clamp-2 mb-3">{c.oneLiner}</p>
            <span className="inline-flex items-center gap-1 text-xs text-brand-700 dark:text-brand-400 font-bold">
              See comparison <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
