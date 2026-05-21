'use client';
import Link from 'next/link';
import { Search, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STATS = [
  { value: '50,000+', label: 'Active Jobs'  },
  { value: '8,000+',  label: 'Companies'    },
  { value: '190+',    label: 'Countries'    },
];

const POPULAR = ['React', 'Python', 'Design', 'Marketing', 'Finance', 'DevOps', 'Product'];

export function HeroSection() {
  const router = useRouter();
  const [q, setQ] = useState('');

  function search(term?: string) {
    const val = (term ?? q).trim();
    router.push(val ? `/jobs?q=${encodeURIComponent(val)}` : '/jobs');
  }

  return (
    <section className="relative overflow-hidden hero-glow pt-16 pb-14 sm:pt-20 sm:pb-16">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-5 flex flex-col items-center text-center gap-6">

        {/* Eyebrow */}
        <div className="animate-fade-in inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-widest"
          style={{ background:'rgba(13,122,95,0.08)', borderColor:'rgba(13,122,95,0.2)', color:'#0d7a5f' }}>
          🌍 50,000+ remote jobs worldwide
        </div>

        {/* Headline */}
        <h1 className="font-display font-extrabold tracking-tight text-stone-900 dark:text-stone-100 text-balance animate-slide-up"
          style={{ fontSize:'clamp(2rem,6vw,3.75rem)', lineHeight:1.08, maxWidth:'900px' }}>
          Your next remote job{' '}
          <span className="text-highlight">starts here</span>
        </h1>

        <p className="text-stone-500 dark:text-stone-400 max-w-lg leading-relaxed"
          style={{ fontSize:'clamp(1rem,2vw,1.1rem)' }}>
          Connect with top companies hiring remotely across engineering, design, marketing and more.
          Full access from just{' '}
          <span className="font-bold text-brand-700 dark:text-brand-400">₦1,000</span>.
        </p>

        {/* Search bar */}
        <div className="w-full max-w-2xl">
          <div className="flex flex-col sm:flex-row gap-2 p-2 bg-white dark:bg-[#0f2820] rounded-2xl border border-stone-200 dark:border-[#1a3d2e] shadow-md-brand focus-within:border-brand-500 dark:focus-within:border-brand-600 focus-within:shadow-glow transition-all duration-200">
            <div className="flex items-center gap-3 flex-1 px-3">
              <Search className="w-4 h-4 text-stone-400 shrink-0" />
              <input
                type="text" value={q} onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="Job title, skill, or company…"
                className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 py-2"
              />
            </div>
            <button onClick={() => search()}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-800 transition-colors shrink-0">
              <Search className="w-4 h-4" /> Search Jobs
            </button>
          </div>

          {/* Popular searches */}
          <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
            <span className="text-xs text-stone-400 dark:text-stone-500">Popular:</span>
            {POPULAR.map(term => (
              <button key={term} onClick={() => search(term)}
                className="text-xs px-2.5 py-1 rounded-full bg-stone-100 dark:bg-[#0f2820] border border-stone-200 dark:border-[#1a3d2e] text-stone-500 dark:text-stone-400 hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400 transition-all">
                {term}
              </button>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="flex gap-3 flex-wrap justify-center">
          <Link href="/jobs"
            className="flex items-center gap-2 px-7 py-3.5 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-800 transition-colors text-sm shadow-md-brand">
            Browse All Jobs <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/pricing"
            className="flex items-center gap-2 px-7 py-3.5 border border-stone-200 dark:border-[#1a3d2e] text-stone-600 dark:text-stone-300 font-bold rounded-xl hover:bg-stone-50 dark:hover:bg-[#0f2820] transition-colors text-sm">
            View Plans
          </Link>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center gap-8 sm:gap-12 flex-wrap pt-6 border-t border-stone-200 dark:border-[#1a3d2e] w-full max-w-lg">
          {STATS.map(s => (
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
