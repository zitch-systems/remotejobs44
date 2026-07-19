'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlusCircle, Trash2, Eye, Star, ToggleLeft, ToggleRight, Search, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { jobsApi } from '@/lib/api';
import { useUIStore } from '@/lib/store';
import { formatRelativeDate, CATEGORY_META, cn } from '@/lib/utils';
import type { Job } from '@/lib/types';

const PER_PAGE = 50;

export default function AdminJobsPage() {
  const { toast } = useUIStore();
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const [page, setPage]         = useState(1);
  const [q, setQ]               = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  // Debounce the search box and reset to page 1 whenever the query changes.
  // The previous version filtered the 50 already-loaded rows client-side, so
  // an admin searching the 107k-row table could only ever match the newest 50
  // and could never reach — let alone feature/delete — any older job.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  // Server-side fetch on query/page change. Hits /api/jobs directly (not
  // jobsApi.getJobs) so an API/DB failure surfaces as a real error state
  // instead of silently rendering MOCK_JOBS — critical on this screen because
  // acting on a mock row (id 'j1') would fire a doomed DELETE against a uuid
  // column and leave the row half-managed.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
    if (debouncedQ) params.set('q', debouncedQ);
    fetch(`/api/jobs?${params.toString()}`)
      .then(async res => {
        if (!res.ok) throw new Error('load_failed');
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        setJobs(data.jobs ?? []);
        setTotal(data.total ?? 0);
        setPages(Math.max(1, data.pages ?? 1));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedQ, page]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this job?')) return;
    setDeleting(id);
    try {
      await jobsApi.deleteJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
      setTotal(t => Math.max(0, t - 1));
      toast('Job deleted', 'success');
    } catch (err: any) {
      // Without this, a failed delete left the row's button disabled forever
      // with no feedback (setDeleting(null) never ran).
      toast(err?.message ?? 'Failed to delete job', 'error');
    } finally {
      setDeleting(null);
    }
  }

  async function toggleFeatured(job: Job) {
    if (toggling) return; // ignore rapid re-clicks while a PATCH is in flight
    setToggling(job.id);
    try {
      const updated = await jobsApi.updateJob(job.id, { featured: !job.featured });
      // Trust the server's returned value rather than blindly flipping local
      // state, so the star can't desync from the DB.
      const featured = updated?.featured ?? !job.featured;
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, featured } : j));
    } catch (err: any) {
      toast(err?.message ?? 'Failed to update job', 'error');
    } finally {
      setToggling(null);
    }
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const rangeEnd   = (page - 1) * PER_PAGE + jobs.length;

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Manage Jobs</h1>
          <p className="text-sm text-stone-500 mt-1">
            {total.toLocaleString()} jobs{debouncedQ ? ' match' : ' in database'}
            {total > 0 && ` · showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()}`}
          </p>
        </div>
        <Link href="/admin/jobs/new"
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors w-full sm:w-auto">
          <PlusCircle className="w-4 h-4 shrink-0" /> Post New Job
        </Link>
      </div>

      {/* Search — server-side across the whole table */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-lg mb-5 w-full max-w-sm">
        <Search className="w-4 h-4 text-stone-400 shrink-0" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search all jobs…"
          aria-label="Search jobs by title or company"
          className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-stone-400" />
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-8 animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded" />)}</div>
        ) : error ? (
          <div className="p-10 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Couldn’t load jobs</p>
            <p className="text-xs text-stone-500 mt-1 mb-4">Something went wrong reaching the database.</p>
            <button onClick={() => { setDebouncedQ(q.trim()); setPage(p => p); setError(false); setLoading(true); setPage(1); }}
              className="px-4 py-2 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
              Retry
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-10 text-center">
            <Search className="w-8 h-8 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              {debouncedQ ? `No jobs match “${debouncedQ}”` : 'No jobs found'}
            </p>
            <p className="text-xs text-stone-500 mt-1">{debouncedQ ? 'Try a different title or company.' : 'Post a job to get started.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-[#1e3a5f]">
            {/* Header */}
            <div className="grid grid-cols-12 min-w-[680px] gap-2 px-5 py-3 bg-stone-50 dark:bg-[#162033] text-xs font-bold uppercase tracking-wider text-stone-500">
              <div className="col-span-5">Job</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-2">Posted</div>
              <div className="col-span-3">Actions</div>
            </div>
            {jobs.map(job => {
              const cat = CATEGORY_META[job.category as keyof typeof CATEGORY_META] ?? CATEGORY_META['other'];
              return (
                <div key={job.id} className="grid grid-cols-12 min-w-[680px] gap-2 px-5 py-3 items-center hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
                  <div className="col-span-5 flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-xs font-black text-brand-700 shrink-0">
                      {job.logo ?? job.company?.[0] ?? '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{job.title}</p>
                        {job.featured && <Star className="w-3 h-3 text-amber-500 shrink-0" />}
                      </div>
                      <p className="text-xs text-stone-500 truncate">{job.company}</p>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className={cn('badge text-xs', cat.color)}>{cat.icon} {cat.label}</span>
                  </div>
                  <div className="col-span-2 text-xs text-stone-500">
                    {formatRelativeDate(job.posted)}
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <Link href={`/jobs/${job.id}`} target="_blank" aria-label={`View “${job.title}” (opens in new tab)`}
                      className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-[#162033] transition-colors">
                      <Eye className="w-4 h-4" />
                    </Link>
                    <button onClick={() => toggleFeatured(job)} disabled={toggling === job.id}
                      aria-label={job.featured ? `Unfeature “${job.title}”` : `Feature “${job.title}”`}
                      aria-pressed={job.featured}
                      className={cn('p-1.5 rounded-md transition-colors disabled:opacity-40', job.featured ? 'text-amber-500 hover:bg-amber-50' : 'text-stone-400 hover:text-amber-500 hover:bg-amber-50')}>
                      {job.featured ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleDelete(job.id)} disabled={deleting === job.id}
                      aria-label={`Delete “${job.title}”`}
                      className="p-1.5 rounded-md text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-40">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && pages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-[#1e3a5f] rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <span className="text-sm text-stone-500">Page {page.toLocaleString()} of {pages.toLocaleString()}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-[#1e3a5f] rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
