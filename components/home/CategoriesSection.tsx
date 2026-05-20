'use client';
// components/home/CategoriesSection.tsx
import Link from 'next/link';
import { CATEGORY_META } from '@/lib/utils';
import type { JobCategory } from '@/lib/types';

const CATS: (JobCategory)[] = ['engineering','design','marketing','finance','sales','data','hr','product','operations','legal'];
const JOB_COUNTS: Record<string, number> = {engineering:3420,design:1180,marketing:890,finance:640,sales:720,data:980,hr:430,product:560,operations:380,legal:210};

export function CategoriesSection() {
  return (
    <section className="py-16 bg-white dark:bg-[#0D1F18]">
      <div className="max-w-[1240px] mx-auto px-5">
        <div className="text-center mb-10">
          <h2 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight mb-3">
            Browse by Category
          </h2>
          <p className="text-stone-400 dark:text-stone-500 text-base max-w-md mx-auto">
            From engineering to finance, find remote opportunities across every field.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {CATS.map((cat) => {
            const meta = CATEGORY_META[cat];
            return (
              <Link
                key={cat}
                href={`/jobs?category=${cat}`}
                className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-stone-200 dark:border-[#234533] bg-white dark:bg-[#152B20] hover:border-brand-600 dark:hover:border-brand-500 hover:-translate-y-0.5 hover:shadow-md-brand transition-all duration-200"
              >
                <span className="text-2xl">{meta.icon}</span>
                <span className="font-semibold text-sm text-stone-700 dark:text-stone-300 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">{meta.label}</span>
                <span className="text-xs text-stone-400 dark:text-stone-500">{(JOB_COUNTS[cat] ?? 0).toLocaleString()} jobs</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
