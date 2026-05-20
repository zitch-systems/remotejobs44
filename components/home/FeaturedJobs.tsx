'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { jobsApi } from '@/lib/api';
import { JobCard } from '@/components/jobs/JobCard';
import type { Job } from '@/lib/types';

export function FeaturedJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    jobsApi.getJobs({ perPage: 3 }).then(r => setJobs(r.jobs.filter(j => j.featured)));
  }, []);
  if (!jobs.length) return null;
  return (
    <section className="py-14 bg-stone-50 dark:bg-[#0D1F18]">
      <div className="max-w-[1240px] mx-auto px-5">
        <div className="flex items-center justify-between mb-7">
          <div>
            <h2 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Featured Jobs</h2>
            <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">Hand-picked opportunities from top remote companies</p>
          </div>
          <Link href="/jobs?sort=newest" className="text-sm font-semibold text-brand-700 dark:text-brand-400 hover:underline">View all →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {jobs.map(job => <JobCard key={job.id} job={job} />)}
        </div>
      </div>
    </section>
  );
}
