'use client';
import Link from 'next/link';
import { Bookmark, BookmarkCheck, MapPin, Clock, ExternalLink } from 'lucide-react';
import { cn, formatRelativeDate, formatSalary, capitalize, CATEGORY_META, SOURCE_META } from '@/lib/utils';
import { useAuthStore, useJobsStore, useUIStore } from '@/lib/store';
import { applicationsApi } from '@/lib/api';
import { modalService } from '@/components/ui/Modal';
import { PaywallModal } from '@/components/jobs/PaywallModal';
import type { Job } from '@/lib/types';

interface JobCardProps { job: Job; }

export function JobCard({ job }: JobCardProps) {
  const { user, isPro, isLoggedIn, dailyAppsUsed, incrementDailyApp } = useAuthStore();
  const { isSaved, toggleSave, hasApplied, addApplication } = useJobsStore();
  const { toast } = useUIStore();
  const saved   = isSaved(job.id);
  const applied = hasApplied(job.id);
  const catMeta = CATEGORY_META[job.category as keyof typeof CATEGORY_META] ?? CATEGORY_META['other'];
  const srcMeta = SOURCE_META[job.source as keyof typeof SOURCE_META]       ?? SOURCE_META['manual'];
  const salary  = formatSalary(job.salaryMin, job.salaryMax, job.currency);
  const isDaily = user?.plan === 'daily';
  const isFree = !isLoggedIn() || user?.plan === 'free';
  // Day pass users also see company blurred — revealed when they click Apply
  const hideCompany = isFree || isDaily;
  const dailyLimitReached = isDaily && dailyAppsUsed >= 10;

  function handleSave(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!isLoggedIn()) { modalService.open(<PaywallModal mode="login" />); return; }
    const nowSaved = toggleSave(job.id);
    toast(nowSaved ? '🔖 Job saved!' : 'Removed from saved', 'success', 2000);
  }

  async function handleApply(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!isLoggedIn()) { modalService.open(<PaywallModal mode="login" />); return; }
    if (!isPro())      { modalService.open(<PaywallModal mode="subscribe" />); return; }
    if (isDaily && dailyLimitReached) {
      toast('Day Pass limit reached (10/10 applications). Upgrade to Pro for unlimited.', 'error', 5000);
      return;
    }
    if (applied) { toast('Already applied to this job', 'info'); return; }
    try {
      const app = await applicationsApi.apply(job.id);
      addApplication(app);
      if (isDaily) incrementDailyApp();
      toast('Application submitted! 🎉', 'success');
    } catch (err: any) { toast(err.message, 'error'); }
  }

  return (
    <Link href={`/jobs/${job.id}`}
      className={cn(
        'group relative flex flex-col gap-4 p-5 rounded-xl border bg-white dark:bg-[#0a1628] cursor-pointer transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-md-brand hover:border-brand-500 dark:hover:border-brand-600',
        job.featured
          ? 'border-accent dark:border-accent/60'
          : 'border-stone-200 dark:border-[#1e3a5f]',
      )}
    >
      {/* Featured top bar */}
      {job.featured && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent rounded-t-xl" />
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 shrink-0 rounded-xl bg-stone-100 dark:bg-[#0f1e38] border border-stone-200 dark:border-[#1e3a5f] flex items-center justify-center text-xl font-black text-brand-700 dark:text-brand-400 overflow-hidden">
          {job.logo}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors line-clamp-2 leading-snug">
            {job.title}
          </h3>
          {hideCompany ? (
            <p className="text-sm font-medium mt-0.5 flex items-center gap-1 text-stone-400">
              <span className="text-xs">🔒</span>
              <span className="blur-[3px] select-none pointer-events-none">{isDaily ? 'Click Apply' : 'Company Name'}</span>
            </p>
          ) : (
            <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5 font-medium">{job.company}</p>
          )}
        </div>
        <button onClick={handleSave} aria-label={saved ? 'Unsave' : 'Save job'}
          className={cn('shrink-0 p-1.5 rounded-lg transition-all duration-150',
            saved ? 'text-accent' : 'text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 hover:bg-stone-100 dark:hover:bg-[#0f1e38]')}>
          {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
        </button>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        {job.isNew && (
          <span className="badge bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">✨ New</span>
        )}
        {job.featured && (
          <span className="badge bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">⭐ Featured</span>
        )}
        <span className={cn('badge', catMeta.color)}>{catMeta.icon} {catMeta.label}</span>
        <span className="badge bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
          {capitalize(job.type.replace('-', ' '))}
        </span>
        {job.level && (
          <span className="badge bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
            {capitalize(job.level)}
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-3 text-xs text-stone-400 dark:text-stone-500">
        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location}</span>
        {job.timezone && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{job.timezone}</span>}
        <span className={cn('flex items-center gap-1', srcMeta.color)}>
          {srcMeta.icon} {srcMeta.label}
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-[#1e3a5f] flex-wrap gap-2 mt-auto">
        <div>
          {salary && (
            <span className="font-display font-bold text-sm text-brand-700 dark:text-brand-400">{salary}</span>
          )}
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{formatRelativeDate(job.posted)}</p>
        </div>
        <button onClick={handleApply}
          className={cn(
            'shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-150',
            applied
              ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
              : dailyLimitReached
              ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 cursor-not-allowed'
              : isPro()
              ? 'bg-brand-700 dark:bg-brand-600 text-white hover:bg-brand-800 shadow-sm'
              : 'border border-brand-600 dark:border-brand-500 text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20'
          )}>
          {applied ? '✓ Applied'
            : dailyLimitReached ? '10/10 Limit'
            : isPro() ? <span className="flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Apply</span>
            : '🔒 Subscribe'}
        </button>
      </div>
    </Link>
  );
}
