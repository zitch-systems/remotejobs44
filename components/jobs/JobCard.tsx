'use client';
// components/jobs/JobCard.tsx
import Link from 'next/link';
import { Bookmark, BookmarkCheck, MapPin, Clock, Zap } from 'lucide-react';
import { cn, formatRelativeDate, formatSalary, capitalize, CATEGORY_META, SOURCE_META } from '@/lib/utils';
import { useAuthStore, useJobsStore, useUIStore } from '@/lib/store';
import { applicationsApi } from '@/lib/api';
import { modalService } from '@/components/ui/Modal';
import { PaywallModal } from './PaywallModal';
import type { Job } from '@/lib/types';

interface JobCardProps {
  job: Job;
  variant?: 'default' | 'compact' | 'featured';
}

export function JobCard({ job, variant = 'default' }: JobCardProps) {
  const { isPro, isLoggedIn } = useAuthStore();
  const { isSaved, toggleSave, hasApplied, addApplication } = useJobsStore();
  const { toast } = useUIStore();
  const saved = isSaved(job.id);
  const applied = hasApplied(job.id);
  const catMeta = CATEGORY_META[job.category] ?? CATEGORY_META.other;
  const srcMeta = SOURCE_META[job.source] ?? SOURCE_META.manual;
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency);

  function handleSave(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!isLoggedIn()) { modalService.open(<PaywallModal mode="login" />); return; }
    const nowSaved = toggleSave(job.id);
    toast(nowSaved ? '🔖 Job saved!' : 'Removed from saved', 'success', 2000);
  }

  async function handleApply(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!isLoggedIn()) { modalService.open(<PaywallModal mode="login" />); return; }
    if (!isPro())       { modalService.open(<PaywallModal mode="subscribe" />); return; }
    if (applied) { toast('Already applied to this job', 'info'); return; }
    try {
      const app = await applicationsApi.apply(job.id);
      addApplication(app);
      toast('Application submitted! 🎉', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  }

  return (
    <Link href={`/jobs/${job.id}`} className={cn(
      'group card flex flex-col gap-4 p-5 cursor-pointer transition-all duration-200',
      'hover:-translate-y-0.5 hover:shadow-md-brand hover:border-brand-600 dark:hover:border-brand-500',
      job.featured && 'border-amber-400 dark:border-amber-600',
    )} tabIndex={0}>
      {/* Featured bar */}
      {job.featured && <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-400 dark:bg-amber-500 rounded-t-lg" />}

      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 shrink-0 rounded-lg bg-stone-100 dark:bg-[#1C3829] border border-stone-200 dark:border-[#234533] flex items-center justify-center text-xl font-black text-brand-700 dark:text-brand-400 overflow-hidden">
          {job.logo}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors truncate">
            {job.title}
          </h3>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5">{job.company}</p>
        </div>
        {/* Save button */}
        <button
          onClick={handleSave}
          aria-label={saved ? 'Remove from saved' : 'Save job'}
          className={cn('shrink-0 p-1.5 rounded-md transition-all duration-150', saved ? 'text-amber-500' : 'text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 hover:bg-stone-100 dark:hover:bg-[#1C3829]')}
        >
          {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
        </button>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        {job.isNew && <span className="badge bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">✨ New</span>}
        {job.featured && <span className="badge bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">⭐ Featured</span>}
        <span className="badge bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">{catMeta.emoji} {catMeta.label}</span>
        <span className="badge bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">{capitalize(job.type)}</span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-3 text-xs text-stone-400 dark:text-stone-500">
        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location}</span>
        {job.timezone && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{job.timezone}</span>}
        <span className={cn('flex items-center gap-1', srcMeta.color)}>
          <span>{srcMeta.icon}</span>{srcMeta.label}
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-[#234533] flex-wrap gap-2 mt-auto">
        <div>
          {salary && <span className="font-display font-bold text-sm text-brand-700 dark:text-brand-400">{salary}</span>}
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{formatRelativeDate(job.posted)}</p>
        </div>
        <button
          onClick={handleApply}
          className={cn(
            'shrink-0 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-150',
            applied
              ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 cursor-default'
              : isPro()
              ? 'bg-brand-700 dark:bg-brand-500 text-white hover:bg-brand-600 dark:hover:bg-brand-400'
              : 'border border-brand-600 dark:border-brand-500 text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20'
          )}
        >
          {applied ? '✓ Applied' : isPro() ? 'Apply Now' : '🔒 Subscribe'}
        </button>
      </div>
    </Link>
  );
}
