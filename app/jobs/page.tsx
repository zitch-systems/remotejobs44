'use client';
// app/jobs/page.tsx — Full jobs listing with working filters, search, sort, pagination
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight, Grid3X3, List } from 'lucide-react';
import { JobCard } from '@/components/jobs/JobCard';
import { jobsApi } from '@/lib/api';
import { cn, CATEGORY_META } from '@/lib/utils';
import type { Job, SearchFilters, JobCategory, JobType, JobLevel } from '@/lib/types';

const CATEGORIES: (JobCategory | 'all')[] = [
  'all','engineering','design','marketing','finance','sales','data','hr','product','operations','legal','other'
];
const TYPES: { value: JobType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'freelance', label: 'Freelance' },
];
const LEVELS: { value: JobLevel | ''; label: string }[] = [
  { value: '', label: 'All Levels' },
  { value: 'entry', label: 'Entry' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'executive', label: 'Executive' },
];

function Skeleton() {
  return (
    <div className="card p-5 flex flex-col gap-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="skeleton w-12 h-12 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="skeleton h-5 w-14 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
      <div className="flex gap-3">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-3 w-16 rounded" />
      </div>
      <div className="flex justify-between pt-3 border-t border-stone-100 dark:border-[#234533]">
        <div className="skeleton h-4 w-28 rounded" />
        <div className="skeleton h-8 w-24 rounded-lg" />
      </div>
    </div>
  );
}

function JobsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [inputQ, setInputQ] = useState(searchParams.get('q') ?? '');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const category = (searchParams.get('category') ?? 'all') as JobCategory | 'all';
  const type = (searchParams.get('type') ?? '') as JobType | '';
  const level = (searchParams.get('level') ?? '') as JobLevel | '';
  const sort = (searchParams.get('sort') ?? 'newest') as 'newest' | 'salary';
  const page = Number(searchParams.get('page') ?? 1);

  const updateParam = useCallback((updates: Record<string, string>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    p.delete('page'); // reset to p1 on filter change
    router.push(`/jobs?${p.toString()}`);
  }, [router, searchParams]);

  const setPage = (n: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set('page', String(n));
    router.push(`/jobs?${p.toString()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    updateParam({ q: inputQ });
  }

  function clearAll() {
    setInputQ('');
    router.push('/jobs');
  }

  useEffect(() => {
    setLoading(true);
    const filters: SearchFilters = {
      q: searchParams.get('q') ?? undefined,
      category: (category !== 'all' ? category : undefined) as any,
      type: (type || undefined) as any,
      level: (level || undefined) as any,
      sort,
      page,
      perPage: 12,
    };
    jobsApi.getJobs(filters).then((result) => {
      setJobs(result.jobs);
      setTotal(result.total);
      setPages(result.pages);
      setLoading(false);
    });
  }, [searchParams.toString()]);

  // Keep inputQ in sync when URL q changes externally
  useEffect(() => {
    setInputQ(searchParams.get('q') ?? '');
  }, [searchParams.get('q')]);

  const activeFilters = [
    category !== 'all' && category,
    type,
    level,
    sort !== 'newest' && sort,
  ].filter(Boolean).length;

  const catMeta = CATEGORY_META[category] ?? CATEGORY_META.all;

  return (
    <div className="max-w-[1240px] mx-auto px-5 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-display font-extrabold text-2xl md:text-3xl text-stone-900 dark:text-stone-100 tracking-tight mb-1">
          {category === 'all' ? 'All Remote Jobs' : `${catMeta.icon} ${catMeta.label} Jobs`}
        </h1>
        <p className="text-sm text-stone-400 dark:text-stone-500">
          {loading
            ? 'Finding jobs…'
            : `${total.toLocaleString()} remote ${category !== 'all' ? catMeta.label.toLowerCase() + ' ' : ''}jobs worldwide`
          }
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <div className={cn(
          'flex-1 flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-[#152B20] border rounded-xl transition-all duration-150',
          'border-stone-200 dark:border-[#234533]',
          'focus-within:border-brand-600 dark:focus-within:border-brand-500 focus-within:shadow-[0_0_0_3px_rgba(10,92,54,0.08)]'
        )}>
          <Search className="w-4 h-4 text-stone-400 shrink-0" />
          <input
            type="text"
            value={inputQ}
            onChange={(e) => setInputQ(e.target.value)}
            placeholder="Job title, skill, or company…"
            className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 py-0.5"
          />
          {inputQ && (
            <button type="button" onClick={() => { setInputQ(''); updateParam({ q: '' }); }}
              className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button type="submit"
          className="px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-xl hover:bg-brand-600 dark:hover:bg-brand-400 transition-colors">
          Search
        </button>
        <button
          type="button"
          onClick={() => setFilterOpen((o) => !o)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors',
            filterOpen || activeFilters > 0
              ? 'border-brand-600 dark:border-brand-500 text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20'
              : 'border-stone-200 dark:border-[#234533] text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-[#1C3829]'
          )}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:block">Filters</span>
          {activeFilters > 0 && (
            <span className="w-5 h-5 rounded-full bg-brand-700 dark:bg-brand-500 text-white text-xs flex items-center justify-center font-bold">
              {activeFilters}
            </span>
          )}
        </button>
      </form>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-4 -mx-1 px-1">
        {CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat];
          const active = category === cat;
          return (
            <button
              key={cat}
              onClick={() => updateParam({ category: cat === 'all' ? '' : cat })}
              className={cn('chip flex-none', active && 'active')}
            >
              <span>{meta.icon}</span>
              <span className="whitespace-nowrap">{meta.label}</span>
            </button>
          );
        })}
      </div>

      {/* Expanded filter panel */}
      {filterOpen && (
        <div className="card p-4 mb-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1.5 block">Job Type</label>
              <select value={type} onChange={(e) => updateParam({ type: e.target.value })} className="input py-2 text-sm">
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1.5 block">Experience</label>
              <select value={level} onChange={(e) => updateParam({ level: e.target.value })} className="input py-2 text-sm">
                {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1.5 block">Sort By</label>
              <select value={sort} onChange={(e) => updateParam({ sort: e.target.value })} className="input py-2 text-sm">
                <option value="newest">Newest First</option>
                <option value="salary">Highest Salary</option>
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={clearAll}
                className="w-full py-2 text-sm font-medium text-red-500 dark:text-red-400 border border-red-200 dark:border-red-900/40 rounded-md hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                Clear All Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results toolbar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {!loading && (
            <>
              Showing <span className="font-semibold text-stone-700 dark:text-stone-300">{(page - 1) * 12 + 1}–{Math.min(page * 12, total)}</span> of <span className="font-semibold text-stone-700 dark:text-stone-300">{total.toLocaleString()}</span> jobs
            </>
          )}
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => setViewMode('grid')}
            className={cn('p-1.5 rounded-md transition-colors', viewMode === 'grid' ? 'text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300')}>
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('list')}
            className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300')}>
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Jobs grid/list */}
      <div className={cn(
        'gap-4',
        viewMode === 'grid'
          ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
          : 'flex flex-col'
      )}>
        {loading
          ? Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} />)
          : jobs.length === 0
          ? (
            <div className="col-span-full text-center py-20">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-2">No jobs found</h3>
              <p className="text-stone-400 dark:text-stone-500 mb-6 max-w-xs mx-auto">
                Try different keywords or remove some filters to see more results.
              </p>
              <button onClick={clearAll}
                className="px-6 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-xl hover:bg-brand-600 transition-colors">
                Clear all filters
              </button>
            </div>
          )
          : jobs.map((job) => <JobCard key={job.id} job={job} />)
        }
      </div>

      {/* Pagination */}
      {!loading && pages > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-10">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-stone-200 dark:border-[#234533] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-50 dark:hover:bg-[#1C3829] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1)
            .reduce<(number | '...')[]>((acc, n, i, arr) => {
              if (i > 0 && (arr[i - 1] as number) < n - 1) acc.push('...');
              acc.push(n);
              return acc;
            }, [])
            .map((item, i) =>
              item === '...' ? (
                <span key={`ellipsis-${i}`} className="w-9 h-9 flex items-center justify-center text-stone-400">…</span>
              ) : (
                <button
                  key={item}
                  onClick={() => setPage(item as number)}
                  className={cn(
                    'w-9 h-9 rounded-lg text-sm font-semibold transition-colors',
                    (item as number) === page
                      ? 'bg-brand-700 dark:bg-brand-500 text-white'
                      : 'border border-stone-200 dark:border-[#234533] text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-[#1C3829]'
                  )}
                >
                  {item}
                </button>
              )
            )
          }

          <button
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-stone-200 dark:border-[#234533] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-50 dark:hover:bg-[#1C3829] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={
      <div className="max-w-[1240px] mx-auto px-5 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} />)}
        </div>
      </div>
    }>
      <JobsContent />
    </Suspense>
  );
}
