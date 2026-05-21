'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CATEGORY_META } from '@/lib/utils';
import type { JobCategory } from '@/lib/types';

const JOB_COUNTS: Partial<Record<JobCategory, number>> = {
  engineering: 18420, design: 4180, marketing: 3890, finance: 2640,
  sales: 2720, data: 3980, hr: 1430, product: 2560, legal: 1210, operations: 1380,
};

const SHOW_CATS: JobCategory[] = [
  'engineering','design','marketing','finance','sales','data','hr','product','legal','operations'
];

export function CategoriesSection() {
  const router = useRouter();

  return (
    <section className="py-14 bg-stone-50 dark:bg-[#0a1f18]">
      <div className="max-w-[1240px] mx-auto px-5">
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
            const meta  = CATEGORY_META[cat as keyof typeof CATEGORY_META];
            const count = JOB_COUNTS[cat] ?? 0;
            return (
              <Link
                key={cat}
                href={`/jobs?category=${cat}`}
                className="group flex flex-col items-center gap-2.5 p-4 rounded-xl border border-stone-200 dark:border-[#1a3d2e] bg-white dark:bg-[#0f2820] hover:border-brand-500 dark:hover:border-brand-600 hover:-translate-y-0.5 hover:shadow-md-brand transition-all duration-200"
              >
                <span className="text-2xl leading-none">{meta.icon}</span>
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
            className="inline-flex items-center gap-2 px-6 py-2.5 border border-stone-200 dark:border-[#1a3d2e] rounded-xl text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#0f2820] hover:border-brand-500 transition-all">
            View all categories →
          </Link>
        </div>
      </div>
    </section>
  );
}
