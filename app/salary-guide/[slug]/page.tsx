// app/salary-guide/[slug]/page.tsx — Per-role salary benchmark page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Banknote, TrendingUp } from 'lucide-react';
import { SALARY_ROLES } from '@/lib/seo-extra';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return SALARY_ROLES.map(r => ({ slug: r.slug }));
}

function find(slug: string) {
  return SALARY_ROLES.find(r => r.slug === slug.toLowerCase());
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = find((await params).slug);
  if (!r) return {};
  const lo = r.bands[0].usdLow;
  const hi = r.bands[r.bands.length-1].usdHigh;
  const title = `Remote ${r.role} Salary 2026 — $${(lo/1000).toFixed(0)}k to $${(hi/1000).toFixed(0)}k USD`;
  const description = `${r.role} salary benchmarks for fully-remote roles in 2026. ${r.blurb} USD and Naira (₦) ranges by experience level on RemoteJobs44.`;
  const url = `${BASE}/salary-guide/${r.slug}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

const fmtUSD = (n: number) => `$${(n/1000).toFixed(0)}k`;
const fmtNGN = (n: number) => `₦${(n/1000000).toFixed(0)}M`;

export default async function SalaryRolePage({ params }: { params: Promise<{ slug: string }> }) {
  const r = find((await params).slug);
  if (!r) notFound();

  // JSON-LD for Google rich result
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Occupation',
    name: r.role,
    description: r.blurb,
    estimatedSalary: r.bands.map(b => ({
      '@type': 'MonetaryAmountDistribution',
      name: `${r.role} — ${b.level}`,
      currency: 'USD',
      duration: 'P1Y',
      minValue: b.usdLow,
      maxValue: b.usdHigh,
    })),
    occupationLocation: { '@type': 'Country', name: 'Worldwide' },
    skills: r.skills.join(', '),
  };

  return (
    <div className="max-w-[860px] mx-auto px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <Link href="/salary-guide" className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-brand-700 dark:hover:text-brand-400 transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to salary guide
      </Link>

      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold uppercase tracking-wider mb-3">
        <TrendingUp className="w-3.5 h-3.5" /> 2026 Salary Benchmark
      </div>
      <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">
        Remote {r.role} Salary
      </h1>
      <p className="text-stone-500 dark:text-stone-400 mt-3 leading-relaxed">{r.blurb}</p>

      {/* Salary table */}
      <div className="card overflow-hidden mt-6">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 dark:bg-[#0f1e38] border-b border-stone-100 dark:border-[#1e3a5f]">
            <tr>
              <th className="text-left p-4 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Level</th>
              <th className="text-left p-4 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">USD / year</th>
              <th className="text-left p-4 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">NGN / year</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-[#1e3a5f]">
            {r.bands.map(b => (
              <tr key={b.level}>
                <td className="p-4 font-bold text-stone-900 dark:text-stone-100">{b.level}</td>
                <td className="p-4 text-stone-700 dark:text-stone-300">{fmtUSD(b.usdLow)} – {fmtUSD(b.usdHigh)}</td>
                <td className="p-4 text-stone-700 dark:text-stone-300">{fmtNGN(b.nairaLow)} – {fmtNGN(b.nairaHigh)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Skills */}
      <div className="card p-5 mt-5">
        <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
          <Banknote className="w-4 h-4 text-brand-600" /> Skills employers actually pay for
        </h2>
        <div className="flex flex-wrap gap-2">
          {r.skills.map(s => (
            <span key={s} className="px-3 py-1.5 rounded-full bg-stone-100 dark:bg-[#162033] text-stone-700 dark:text-stone-300 text-xs font-semibold">
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Methodology */}
      <div className="card p-5 mt-5">
        <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-2">How we calculate these ranges</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
          USD bands are taken from active fully-remote listings on RemoteJobs44 cross-referenced with public Glassdoor and Levels.fyi data. NGN equivalents use a ~1500 NGN/USD reference rate. Senior bands assume 5+ years experience and fully-remote contracts with US, UK, or EU companies. Local-only roles paid in NGN typically pay 30–60% less.
        </p>
      </div>

      {/* CTA */}
      <div className="card p-6 mt-5 bg-brand-50/40 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800">
        <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">See live {r.role} listings</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
          50,000+ remote jobs on RemoteJobs44 — filter by role, level, and country. Day Pass from ₦500.
        </p>
        <Link href={`/jobs?q=${encodeURIComponent(r.role)}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
          Browse {r.role} jobs
        </Link>
      </div>
    </div>
  );
}
