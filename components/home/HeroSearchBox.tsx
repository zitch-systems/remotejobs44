'use client';
// components/home/HeroSearchBox.tsx
//
// Tiny client island for the homepage search input. The surrounding
// hero copy + popular-search chips are server-rendered (the chips
// became plain <Link>s — no JS needed for navigation).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export function HeroSearchBox() {
  const router = useRouter();
  const [q, setQ] = useState('');
  // /jobs SSR is 2-8s on cold cache and this hero box is the most
  // common entry point. Without a pending indicator users hit Enter
  // and see nothing for seconds — assume the button is broken.
  const [isPending, startTransition] = useTransition();

  function search() {
    const val = q.trim();
    startTransition(() => {
      router.push(val ? `/jobs?q=${encodeURIComponent(val)}` : '/jobs');
    });
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 p-2 bg-white dark:bg-[#0a1628] rounded-2xl border border-stone-200 dark:border-[#1e3a5f] shadow-md-brand focus-within:border-brand-500 dark:focus-within:border-brand-600 focus-within:shadow-glow transition-all duration-200">
      <div className="flex items-center gap-3 flex-1 px-3">
        {isPending ? (
          <span className="w-4 h-4 border-2 border-stone-300 dark:border-stone-600 border-t-brand-600 rounded-full animate-spin shrink-0" aria-label="Searching" />
        ) : (
          <Search className="w-4 h-4 text-stone-400 shrink-0" />
        )}
        <input
          type="text" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Job title, skill, or company…"
          className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 py-2 disabled:opacity-60"
          aria-label="Search jobs"
          disabled={isPending}
        />
      </div>
      <button onClick={search} disabled={isPending}
        className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-800 transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed">
        {isPending ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Searching…</>
        ) : (
          <><Search className="w-4 h-4" /> Search Jobs</>
        )}
      </button>
    </div>
  );
}
