'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlusCircle, Trash2, Eye, Star, ToggleLeft, ToggleRight, Search } from 'lucide-react';
import { jobsApi } from '@/lib/api';
import { useUIStore } from '@/lib/store';
import { formatRelativeDate, CATEGORY_META } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Job } from '@/lib/types';

export default function AdminJobsPage() {
  const { toast } = useUIStore();
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [q, setQ]             = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    jobsApi.getJobs({ perPage: 50 }).then(r => { setJobs(r.jobs); setLoading(false); });
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('Delete this job?')) return;
    setDeleting(id);
    await jobsApi.deleteJob(id);
    setJobs(prev => prev.filter(j => j.id !== id));
    toast('Job deleted', 'success');
    setDeleting(null);
  }

  async function toggleFeatured(job: Job) {
    await jobsApi.updateJob(job.id, { featured: !job.featured });
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, featured: !j.featured } : j));
  }

  const filtered = jobs.filter(j => !q || j.title.toLowerCase().includes(q.toLowerCase()) || j.company.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Manage Jobs</h1>
          <p className="text-sm text-stone-400 mt-1">{jobs.length} jobs in database</p>
        </div>
        <Link href="/admin/jobs/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
          <PlusCircle className="w-4 h-4" /> Post New Job
        </Link>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-lg mb-5 w-full max-w-sm">
        <Search className="w-4 h-4 text-stone-400 shrink-0" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search jobs…"
          className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-stone-400" />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded" />)}</div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-[#1e3a5f]">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-stone-50 dark:bg-[#162033] text-xs font-bold uppercase tracking-wider text-stone-400">
              <div className="col-span-5">Job</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-2">Posted</div>
              <div className="col-span-3">Actions</div>
            </div>
            {filtered.map(job => {
              const cat = CATEGORY_META[job.category as keyof typeof CATEGORY_META] ?? CATEGORY_META['other'];
              return (
                <div key={job.id} className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
                  <div className="col-span-5 flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-xs font-black text-brand-700 shrink-0">
                      {job.logo ?? job.company[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{job.title}</p>
                        {job.featured && <Star className="w-3 h-3 text-amber-500 shrink-0" />}
                      </div>
                      <p className="text-xs text-stone-400 truncate">{job.company}</p>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className={cn('badge text-xs', cat.color)}>{cat.icon} {cat.label}</span>
                  </div>
                  <div className="col-span-2 text-xs text-stone-400">
                    {formatRelativeDate(job.posted)}
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <Link href={`/jobs/${job.id}`} target="_blank"
                      className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-[#162033] transition-colors">
                      <Eye className="w-4 h-4" />
                    </Link>
                    <button onClick={() => toggleFeatured(job)}
                      className={cn('p-1.5 rounded-md transition-colors', job.featured ? 'text-amber-500 hover:bg-amber-50' : 'text-stone-400 hover:text-amber-500 hover:bg-amber-50')}>
                      {job.featured ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleDelete(job.id)} disabled={deleting === job.id}
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
    </div>
  );
}
