'use client';
// components/home/HeroSearchBox.tsx
//
// Tiny client island for the homepage search input. The surrounding
// hero copy + popular-search chips are server-rendered (the chips
// became plain <Link>s — no JS needed for navigation).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export function HeroSearchBox() {
  const router = useRouter();
  const [q, setQ] = useState('');

  function search() {
    const val = q.trim();
    router.push(val ? `/jobs?q=${encodeURIComponent(val)}` : '/jobs');
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 p-2 bg-white dark:bg-[#0a1628] rounded-2xl border border-stone-200 dark:border-[#1e3a5f] shadow-md-brand focus-within:border-brand-500 dark:focus-within:border-brand-600 focus-within:shadow-glow transition-all duration-200">
      <div className="flex items-center gap-3 flex-1 px-3">
        <Search className="w-4 h-4 text-stone-400 shrink-0" />
        <input
          type="text" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Job title, skill, or company…"
          className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 py-2"
          aria-label="Search jobs"
        />
      </div>
      <button onClick={search}
        className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-800 transition-colors shrink-0">
        <Search className="w-4 h-4" /> Search Jobs
      </button>
    </div>
  );
}
