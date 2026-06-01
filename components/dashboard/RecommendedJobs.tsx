'use client';
// components/dashboard/RecommendedJobs.tsx
//
// "Recommended for you" row on /dashboard. Fetches once on mount
// from /api/recommendations, renders a horizontally-scrolling list
// of compact job cards. Self-hides when the API has nothing useful
// to ship (cold-start path with no featured jobs either).
//
// The label flips between "Recommended for you" and "Featured roles"
// depending on the `basis` flag the API returns — so a brand-new
// visitor sees an honest title instead of a misleading "personalised"
// one against featured rows they happen to share zero history with.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, MapPin, Star, ArrowRight } from 'lucide-react';
import { CATEGORY_META, formatSalary } from '@/lib/utils';
import { CompanyMask } from '@/components/jobs/CompanyMask';

interface RecommendedJob {
  id:       string;
  title:    string;
  company:  string;
  logo?:    string;
  category: string;
  location: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  featured?: boolean;
  isNew?:    boolean;
}

export function RecommendedJobs() {
  const [jobs, setJobs]   = useState<RecommendedJob[]>([]);
  const [basis, setBasis] = useState<'history' | 'featured' | 'error' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/recommendations', { cache: 'no-store' });
        if (!res.ok) throw new Error('rec-fetch-failed');
        const data = await res.json();
        if (cancelled) return;
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        setBasis(data.basis ?? null);
      } catch {
        if (!cancelled) { setJobs([]); setBasis('error'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="skeleton h-5 w-44 rounded" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="skeleton h-24 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (jobs.length === 0) return null;

  const title = basis === 'history' ? 'Recommended for you' : 'Featured remote roles';
  const subtitle = basis === 'history'
    ? 'Based on the jobs you’ve saved and applied to.'
    : 'Curated picks from the freshest active postings.';

  return (
    <div className="mb-8">
      <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-700 dark:text-brand-400" />
            {title}
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">{subtitle}</p>
        </div>
        <Link href="/jobs"
          className="text-xs text-brand-700 dark:text-brand-400 font-semibold hover:underline flex items-center gap-1">
          Browse all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {jobs.slice(0, 6).map(j => {
          const cat = CATEGORY_META[j.category as keyof typeof CATEGORY_META] ?? CATEGORY_META['other'];
          const salary = formatSalary(j.salaryMin ?? undefined, j.salaryMax ?? undefined, j.currency);
          return (
            <Link key={j.id} href={`/jobs/${j.id}`}
              className="card p-4 hover:border-brand-400 dark:hover:border-brand-500 transition-colors flex flex-col gap-2 group">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-sm font-black text-brand-700 dark:text-brand-300 shrink-0">
                  {j.logo}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100 truncate group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">
                    {j.title}
                  </h3>
                  <p className="text-xs text-stone-500 truncate"><CompanyMask company={j.company} /></p>
                </div>
                {j.featured && <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-stone-400">
                <span className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 font-semibold">{cat.icon} {cat.label}</span>
                {j.location && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3 shrink-0" /> {j.location}
                  </span>
                )}
              </div>
              {salary && (
                <p className="text-[11px] font-semibold text-brand-700 dark:text-brand-400">{salary}</p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
