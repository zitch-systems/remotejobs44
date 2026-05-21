'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight, Bookmark } from 'lucide-react';
import { jobsApi } from '@/lib/api';
import { JobCard } from '@/components/jobs/JobCard';
import { cn, CATEGORY_META } from '@/lib/utils';
import type { Job, JobCategory, JobType, JobLevel } from '@/lib/types';

const CATEGORIES: (JobCategory | 'all')[] = ['all','engineering','design','marketing','finance','sales','data','hr','product','legal','operations','other'];
const TYPES:   JobType[]  = ['full-time','part-time','contract','freelance'];
const LEVELS:  JobLevel[] = ['entry','mid','senior','lead','executive'];
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'salary', label: 'Highest salary' },
];

function SkeletonCard() {
  return (
    <div className="card p-5 animate-pulse">
      <div className="flex items-start gap-3 mb-4">
        <div className="skeleton w-12 h-12 rounded-lg shrink-0" />
        <div className="flex-1">
          <div className="skeleton h-4 w-3/4 rounded mb-2" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
      </div>
      <div className="skeleton h-3 w-full rounded mb-2" />
      <div className="flex justify-between pt-3 border-t border-stone-100 dark:border-[#234533]">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-8 w-20 rounded-lg" />
      </div>
    </div>
  );
}

function JobsContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [jobs,     setJobs]     = useState<Job[]>([]);
  const [total,    setTotal]    = useState(0);
  const [pages,    setPages]    = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const q        = searchParams.get('q')        ?? '';
  const category = (searchParams.get('category') ?? 'all') as JobCategory | 'all';
  const type     = (searchParams.get('type')     ?? '') as JobType | '';
  const level    = (searchParams.get('level')    ?? '') as JobLevel | '';
  const sort     = (searchParams.get('sort')     ?? 'newest');
  const page     = parseInt(searchParams.get('page') ?? '1');

  const activeFilters = [type, level].filter(Boolean).length;

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await jobsApi.getJobs({ q, category, type, level, sort: sort as any, page, perPage: 12 });
      setJobs(res.jobs);
      setTotal(res.total);
      setPages(res.pages);
    } finally {
      setLoading(false);
    }
  }, [q, category, type, level, sort, page]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all' && value !== '') params.set(key, value);
    else params.delete(key);
    params.delete('page');
    router.push(`/jobs?${params.toString()}`);
  }

  function setPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`/jobs?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearFilters() {
    router.push('/jobs');
  }

  const catMeta = CATEGORY_META[category as keyof typeof CATEGORY_META] ?? CATEGORY_META['all'];

  return (
    <div className="max-w-[1240px] mx-auto px-5 py-8">

      {/* Search bar */}
      <div className="mb-6">
        <div className="flex gap-3 flex-col sm:flex-row">
          <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#152B20] border border-stone-200 dark:border-[#234533] rounded-xl focus-within:border-brand-600 dark:focus-within:border-brand-500 transition-colors">
            <Search className="w-4 h-4 text-stone-400 shrink-0" />
            <input
              type="text"
              defaultValue={q}
              onKeyDown={e => { if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value); }}
              onBlur={e => setParam('q', e.target.value)}
              placeholder="Job title, skill, or company…"
              className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
            />
            {q && (
              <button onClick={() => setParam('q', '')} className="text-stone-400 hover:text-stone-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <select value={sort} onChange={e => setParam('sort', e.target.value)}
              className="input text-sm w-auto pr-8">
              {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button onClick={() => setShowFilters(!showFilters)}
              className={cn('flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors', showFilters || activeFilters > 0 ? 'bg-brand-700 dark:bg-brand-500 text-white border-brand-700 dark:border-brand-500' : 'bg-white dark:bg-[#152B20] border-stone-200 dark:border-[#234533] text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#1C3829]')}>
              <SlidersHorizontal className="w-4 h-4" />
              Filters {activeFilters > 0 && `(${activeFilters})`}
            </button>
          </div>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mt-3 p-4 bg-white dark:bg-[#152B20] border border-stone-200 dark:border-[#234533] rounded-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Job Type</label>
                <div className="flex flex-wrap gap-2">
                  {TYPES.map(t => (
                    <button key={t} onClick={() => setParam('type', type === t ? '' : t)}
                      className={cn('chip', type === t && 'active')}>
                      {t.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Level</label>
                <div className="flex flex-wrap gap-2">
                  {LEVELS.map(l => (
                    <button key={l} onClick={() => setParam('level', level === l ? '' : l)}
                      className={cn('chip', level === l && 'active')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {activeFilters > 0 && (
              <button onClick={clearFilters} className="mt-3 text-xs text-red-500 hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-6">
        {CATEGORIES.map(cat => {
          const m = CATEGORY_META[cat as keyof typeof CATEGORY_META];
          return (
            <button key={cat} onClick={() => setParam('category', cat)}
              className={cn('chip shrink-0', category === cat && 'active')}>
              {m?.icon} {m?.label}
            </button>
          );
        })}
      </div>

      {/* Results header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100">
            {category === 'all' ? 'All Remote Jobs' : `${catMeta.icon} ${catMeta.label} Jobs`}
          </h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5">
            {loading ? 'Loading…' : `${total.toLocaleString()} jobs found${q ? ` for "${q}"` : ''}`}
          </p>
        </div>
        {(q || category !== 'all' || activeFilters > 0) && (
          <button onClick={clearFilters} className="text-xs text-stone-400 hover:text-brand-700 dark:hover:text-brand-400 hover:underline">
            Clear all
          </button>
        )}
      </div>

      {/* Jobs grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-2">No jobs found</h2>
          <p className="text-stone-400 dark:text-stone-500 mb-5 max-w-sm mx-auto">
            Try different keywords or remove some filters to see more results.
          </p>
          <button onClick={clearFilters}
            className="px-6 py-2.5 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-xl hover:bg-brand-600 transition-colors">
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {jobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage(page - 1)} disabled={page <= 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-stone-200 dark:border-[#234533] text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#1C3829] disabled:opacity-40 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>

              <div className="flex gap-1">
                {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                  const p = pages <= 7 ? i + 1 : i === 0 ? 1 : i === 6 ? pages : page - 2 + i;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={cn('w-9 h-9 rounded-lg text-sm font-semibold transition-colors', p === page ? 'bg-brand-700 dark:bg-brand-500 text-white' : 'border border-stone-200 dark:border-[#234533] text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#1C3829]')}>
                      {p}
                    </button>
                  );
                })}
              </div>

              <button onClick={() => setPage(page + 1)} disabled={page >= pages}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-stone-200 dark:border-[#234533] text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#1C3829] disabled:opacity-40 transition-colors">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={
      <div className="max-w-[1240px] mx-auto px-5 py-8">
        <div className="skeleton h-12 rounded-xl mb-6" />
        <div className="flex gap-2 mb-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-9 w-24 rounded-full" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    }>
      <JobsContent />
    </Suspense>
  );
}
