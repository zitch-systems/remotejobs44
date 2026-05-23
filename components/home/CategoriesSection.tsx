'use client';
import Link from 'next/link';
import {
  Code2, Palette, TrendingUp, DollarSign, Handshake,
  BarChart2, Users, Package, Scale, Settings2,
} from 'lucide-react';
import type { JobCategory } from '@/lib/types';

interface CatMeta {
  label: string;
  icon: React.ReactNode;
  bg: string;
  text: string;
}

const CAT_META: Partial<Record<JobCategory, CatMeta>> = {
  engineering: { label: 'Engineering',  icon: <Code2 className="w-5 h-5" />,       bg: 'bg-blue-50 dark:bg-blue-950/40',    text: 'text-blue-600 dark:text-blue-400' },
  design:      { label: 'Design',       icon: <Palette className="w-5 h-5" />,      bg: 'bg-purple-50 dark:bg-purple-950/40',text: 'text-purple-600 dark:text-purple-400' },
  marketing:   { label: 'Marketing',    icon: <TrendingUp className="w-5 h-5" />,   bg: 'bg-pink-50 dark:bg-pink-950/40',    text: 'text-pink-600 dark:text-pink-400' },
  finance:     { label: 'Finance',      icon: <DollarSign className="w-5 h-5" />,   bg: 'bg-yellow-50 dark:bg-yellow-950/40',text: 'text-yellow-600 dark:text-yellow-400' },
  sales:       { label: 'Sales',        icon: <Handshake className="w-5 h-5" />,    bg: 'bg-orange-50 dark:bg-orange-950/40',text: 'text-orange-600 dark:text-orange-400' },
  data:        { label: 'Data & AI',    icon: <BarChart2 className="w-5 h-5" />,    bg: 'bg-cyan-50 dark:bg-cyan-950/40',    text: 'text-cyan-600 dark:text-cyan-400' },
  hr:          { label: 'HR & People',  icon: <Users className="w-5 h-5" />,        bg: 'bg-rose-50 dark:bg-rose-950/40',    text: 'text-rose-600 dark:text-rose-400' },
  product:     { label: 'Product',      icon: <Package className="w-5 h-5" />,      bg: 'bg-indigo-50 dark:bg-indigo-950/40',text: 'text-indigo-600 dark:text-indigo-400' },
  legal:       { label: 'Legal',        icon: <Scale className="w-5 h-5" />,        bg: 'bg-slate-50 dark:bg-slate-800/60',  text: 'text-slate-600 dark:text-slate-300' },
  operations:  { label: 'Operations',   icon: <Settings2 className="w-5 h-5" />,    bg: 'bg-zinc-50 dark:bg-zinc-800/60',    text: 'text-zinc-600 dark:text-zinc-300' },
};

const JOB_COUNTS: Partial<Record<JobCategory, number>> = {
  engineering: 18420, design: 4180, marketing: 3890, finance: 2640,
  sales: 2720, data: 3980, hr: 1430, product: 2560, legal: 1210, operations: 1380,
};

const SHOW_CATS: JobCategory[] = [
  'engineering','design','marketing','finance','sales','data','hr','product','legal','operations'
];

export function CategoriesSection() {
  return (
    <section className="py-14 bg-stone-50 dark:bg-[#0f1e38]">
      <div className="max-w-[1440px] mx-auto px-5">
        <div className="text-center mb-10">
          <h2 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-2">
            Browse by Category
          </h2>
          <p className="text-stone-400 dark:text-stone-500 text-sm">
            From engineering to finance, find remote opportunities across every field
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {SHOW_CATS.map(cat => {
            const meta  = CAT_META[cat];
            const count = JOB_COUNTS[cat] ?? 0;
            if (!meta) return null;
            return (
              <Link
                key={cat}
                href={`/jobs?category=${cat}`}
                className="group flex flex-col items-center gap-3 p-4 rounded-xl border border-stone-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0a1628] hover:border-brand-500 dark:hover:border-brand-600 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.bg} ${meta.text} group-hover:scale-110 transition-transform duration-200`}>
                  {meta.icon}
                </div>
                <div className="text-center">
                  <p className="font-semibold text-sm text-stone-700 dark:text-stone-300 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors leading-snug">
                    {meta.label}
                  </p>
                  <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                    {count.toLocaleString()} jobs
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="text-center mt-6">
          <Link href="/jobs"
            className="inline-flex items-center gap-2 px-6 py-2.5 border border-stone-200 dark:border-[#1e3a5f] rounded-xl text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#0a1628] hover:border-brand-500 transition-all">
            View all categories →
          </Link>
        </div>
      </div>
    </section>
  );
}
