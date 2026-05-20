'use client';
// components/home/HeroSection.tsx
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STATS = [
  { value: '50,000+', label: 'Active Jobs'  },
  { value: '8,000+',  label: 'Companies'    },
  { value: '190+',    label: 'Countries'    },
];

const POPULAR_SEARCHES = ['React', 'Python', 'Design', 'Marketing', 'Finance', 'DevOps'];

export function HeroSection() {
  const router  = useRouter();
  const [q, setQ] = useState('');

  function search(term?: string) {
    const val = (term ?? q).trim();
    router.push(val ? `/jobs?q=${encodeURIComponent(val)}` : '/jobs');
  }

  return (
    <section className="relative overflow-hidden pt-20 pb-16" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(10,92,54,0.09), transparent 70%)' }}>
      <div className="max-w-[1240px] mx-auto px-5 flex flex-col items-center text-center gap-7">

        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-widest"
          style={{ background: 'rgba(10,92,54,0.06)', borderColor: 'rgba(10,92,54,0.2)', color: '#0a5c36' }}>
          🌍 50,000+ remote jobs worldwide
        </div>

        {/* Headline */}
        <h1 className="font-display font-extrabold tracking-tight text-stone-900 dark:text-stone-100"
          style={{ fontSize: 'clamp(2rem, 6.5vw, 3.75rem)', lineHeight: 1.08, maxWidth: '900px' }}>
          Your next remote job<br />
          <span className="relative inline-block text-brand-700 dark:text-brand-400">
            starts here
            <span className="absolute bottom-0 left-0 right-0 rounded-full" style={{ height: 3, background: 'currentColor', opacity: 0.3 }} />
          </span>
        </h1>

        <p className="text-stone-500 dark:text-stone-400 max-w-lg leading-relaxed"
          style={{ fontSize: 'clamp(1rem, 2vw, 1.15rem)' }}>
          Connect with top companies hiring remotely. Apply from anywhere in the world.
          Full access from just{' '}
          <span className="font-semibold text-brand-700 dark:text-brand-400">₦1,000</span>.
        </p>

        {/* Search */}
        <div className="w-full max-w-2xl">
          <div className="flex flex-col gap-2 p-2 bg-white dark:bg-[#152B20] rounded-2xl border border-stone-200 dark:border-[#234533]"
            style={{ boxShadow: '0 4px 16px rgba(10,92,54,0.10)' }}>
            <div className="flex items-center gap-3 px-3">
              <Search className="w-4 h-4 text-stone-400 shrink-0" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="Job title, skill, or company…"
                className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 py-2"
              />
            </div>
            <button
              onClick={() => search()}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-xl hover:bg-brand-600 dark:hover:bg-brand-400 transition-colors"
            >
              <Search className="w-4 h-4" /> Search Jobs
            </button>
          </div>

          {/* Popular */}
          <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
            <span className="text-xs text-stone-400 dark:text-stone-500">Popular:</span>
            {POPULAR_SEARCHES.map((term) => (
              <button
                key={term}
                onClick={() => search(term)}
                className="text-xs px-2.5 py-1 rounded-full bg-stone-100 dark:bg-[#1C3829] text-stone-500 dark:text-stone-400 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        </div>

        {/* CTA row */}
        <div className="flex gap-3 flex-wrap justify-center">
          <Link href="/jobs"
            className="px-8 py-4 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-xl hover:bg-brand-600 dark:hover:bg-brand-400 transition-colors text-base">
            Browse Jobs
          </Link>
          <Link href="/pricing"
            className="px-8 py-4 border border-stone-200 dark:border-[#234533] text-stone-600 dark:text-stone-300 font-bold rounded-xl hover:bg-stone-50 dark:hover:bg-[#1C3829] transition-colors text-base">
            See Plans
          </Link>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center gap-10 flex-wrap pt-6 border-t border-stone-200 dark:border-[#234533] w-full max-w-lg">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">{s.value}</div>
              <div className="text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
