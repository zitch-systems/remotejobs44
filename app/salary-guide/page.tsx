// app/salary-guide/page.tsx — Hub for per-role salary benchmarks.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Banknote, ArrowRight, TrendingUp } from 'lucide-react';
import { SALARY_ROLES } from '@/lib/seo-extra';

const BASE = 'https://remotejobs44.com';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Remote Salary Guide 2026 — Engineering, Design, PM, Marketing',
  description: 'Benchmark salaries for remote engineering, design, product, marketing, and sales roles in 2026. USD + Naira ranges by experience level. Updated quarterly.',
  alternates: { canonical: `${BASE}/salary-guide` },
  openGraph: {
    title: '2026 Remote Salary Guide — by Role and Level',
    description: 'Honest USD + Naira salary ranges for 15+ remote roles across engineering, design, product, marketing, sales, and ops.',
    url: `${BASE}/salary-guide`,
    type: 'website',
  },
};

const CAT_LABEL: Record<string, string> = {
  engineering: 'Engineering', design: 'Design', product: 'Product',
  data: 'Data & Analytics', marketing: 'Marketing', sales: 'Sales', ops: 'Operations & Success',
};

export default function SalaryGuideHub() {
  const grouped: Record<string, typeof SALARY_ROLES[number][]> = {};
  for (const r of SALARY_ROLES) (grouped[r.category] ||= []).push(r);

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-10">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold uppercase tracking-wider mb-3">
          <TrendingUp className="w-3.5 h-3.5" /> 2026 Salary Guide
        </div>
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">
          Remote Salary Benchmarks
        </h1>
        <p className="text-stone-500 dark:text-stone-400 mt-3 max-w-2xl mx-auto leading-relaxed">
          Honest USD + Naira salary ranges for {SALARY_ROLES.length} remote roles, by experience level. Built from active RemoteJobs44 listings plus reputable public salary datasets.
        </p>
      </div>

      {Object.entries(grouped).map(([cat, roles]) => (
        <section key={cat} className="mb-10">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400 mb-4">
            <Banknote className="w-4 h-4" /> {CAT_LABEL[cat] ?? cat}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {roles.map(r => (
              <Link key={r.slug} href={`/salary-guide/${r.slug}`} className="card p-5 hover:border-brand-600 dark:hover:border-brand-500 hover:-translate-y-0.5 transition-all group">
                <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors mb-2">{r.role}</h3>
                <p className="text-sm text-stone-500 dark:text-stone-400 line-clamp-2 mb-3">{r.blurb}</p>
                <p className="text-xs text-stone-400 mb-3">
                  ${(r.bands[0].usdLow/1000).toFixed(0)}k – ${(r.bands[r.bands.length-1].usdHigh/1000).toFixed(0)}k USD
                </p>
                <span className="inline-flex items-center gap-1 text-xs text-brand-700 dark:text-brand-400 font-bold">
                  See salary bands <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
