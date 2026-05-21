'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { jobsApi } from '@/lib/api';
import { JobCard } from '@/components/jobs/JobCard';
import type { Job } from '@/lib/types';

export function FeaturedJobs() {
  const [jobs,    setJobs]    = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    jobsApi.getJobs({ perPage: 6, sort: 'newest' }).then(r => {
      // Prefer featured, fallback to newest
      const featured = r.jobs.filter(j => j.featured);
      setJobs(featured.length >= 3 ? featured.slice(0, 6) : r.jobs.slice(0, 6));
      setLoading(false);
    });
  }, []);

  return (
    <section className="py-16 bg-white dark:bg-[#0f1e38]">
      <div className="max-w-[1240px] mx-auto px-5">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-accent" />
              <span className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
                Featured Opportunities
              </span>
            </div>
            <h2 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">
              Top Remote Jobs Right Now
            </h2>
            <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">
              Hand-picked roles from companies actively hiring
            </p>
          </div>
          <Link href="/jobs"
            className="flex items-center gap-1.5 text-sm font-semibold text-brand-700 dark:text-brand-400 hover:underline shrink-0">
            View all jobs <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-stone-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0a1628] p-5 animate-pulse">
                <div className="flex gap-3 mb-4">
                  <div className="skeleton w-12 h-12 rounded-xl shrink-0" />
                  <div className="flex-1"><div className="skeleton h-4 rounded mb-2" /><div className="skeleton h-3 w-2/3 rounded" /></div>
                </div>
                <div className="skeleton h-3 rounded mb-2" /><div className="skeleton h-3 w-3/4 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {jobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        )}
      </div>
    </section>
  );
}
