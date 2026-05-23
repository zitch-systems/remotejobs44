'use client';
import Link from 'next/link';
import { BookmarkPlus, BookmarkCheck, MapPin, Timer, ArrowUpRight, Banknote, Sparkles, Star, Lock, Zap } from 'lucide-react';
import { cn, formatRelativeDate, formatSalary, capitalize, CATEGORY_META, SOURCE_META } from '@/lib/utils';
import { useAuthStore, useJobsStore, useUIStore } from '@/lib/store';
import { applicationsApi } from '@/lib/api';
import { modalService } from '@/components/ui/Modal';
import { PaywallModal } from '@/components/jobs/PaywallModal';
import type { Job } from '@/lib/types';

// Check if a string looks like a real UUID (Supabase ID)
function isRealJobId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// Resolve the URL a card click should navigate to
function cardHref(job: Job) {
  // If there's an external apply URL, clicking the card goes straight there
  if (job.applyUrl) return job.applyUrl;
  // Otherwise fall back to the internal detail page
  return `/jobs/${job.id}`;
}

interface JobCardProps { job: Job; listMode?: boolean; }

export function JobCard({ job, listMode = false }: JobCardProps) {
  const { user, isPro, isAdmin, isLoggedIn, dailyAppsUsed, incrementDailyApp } = useAuthStore();
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
  const href = cardHref(job);
  const isExternal = href.startsWith('http');

  function handleSave(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!isLoggedIn()) { modalService.open(<PaywallModal mode="login" />); return; }
    const nowSaved = toggleSave(job.id);
    toast(nowSaved ? 'Job saved!' : 'Removed from saved', 'success', 2000);
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

    const applyTarget = job.applyUrl || (job.applyEmail ? `mailto:${job.applyEmail}` : null);

    // If this is a mock/preview job (non-UUID ID), skip DB tracking and go directly to company site
    if (!isRealJobId(job.id)) {
      if (applyTarget) {
        window.open(applyTarget, '_blank', 'noopener,noreferrer');
        toast('Redirecting to company application page 🚀', 'success', 3000);
      } else {
        toast('No application link available for this job', 'error');
      }
      return;
    }

    try {
      const app = await applicationsApi.apply(job.id);
      addApplication(app);
      if (isDaily) incrementDailyApp();
      toast('Application tracked! Opening company site 🎉', 'success');
      if (applyTarget) {
        window.open(applyTarget, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      // If DB tracking fails but we have a URL, still let them apply
      if (applyTarget && err.message?.includes('not found')) {
        window.open(applyTarget, '_blank', 'noopener,noreferrer');
        toast('Opening application page 🚀', 'success', 2000);
      } else {
        toast(err.message, 'error');
      }
    }
  }

  // ── List mode (compact row) ──────────────────────────────────────────────
  if (listMode) {
    return (
      <Link href={href} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className={cn(
          'group relative flex items-center gap-3 px-4 py-3 rounded-xl border bg-white dark:bg-[#0a1628] cursor-pointer transition-all duration-200',
          'hover:shadow-sm hover:border-brand-400 dark:hover:border-brand-600',
          'border-stone-200 dark:border-[#1e3a5f]',
        )}
      >
        <div className="w-9 h-9 shrink-0 rounded-lg bg-stone-100 dark:bg-[#0f1e38] border border-stone-200 dark:border-[#1e3a5f] flex items-center justify-center text-sm font-black text-brand-700 dark:text-brand-400 overflow-hidden">
          {job.logo}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors truncate">{job.title}</p>
          <p className="text-xs text-stone-400 dark:text-stone-500 truncate">
            {hideCompany ? <span className="blur-[2px] select-none">Company</span> : job.company}
            {' · '}{job.location}{job.timezone ? ` · ${job.timezone}` : ''}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <span className={cn('badge text-[10px]', catMeta.color)}>{catMeta.label}</span>
          <span className="badge bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 text-[10px]">{capitalize(job.type.replace('-', ' '))}</span>
        </div>
        {salary && <span className="hidden md:block font-bold text-xs text-brand-700 dark:text-brand-400 shrink-0">{salary}</span>}
        <span className="text-xs text-stone-400 dark:text-stone-500 shrink-0 hidden sm:block">{formatRelativeDate(job.posted)}</span>
        <button onClick={handleApply}
          className={cn(
            'shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150',
            applied ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
              : isPro() ? 'bg-brand-700 dark:bg-brand-600 text-white hover:bg-brand-800'
              : 'border border-brand-600 text-brand-700 dark:text-brand-400 hover:bg-brand-50'
          )}>
          {applied ? '✓' : isPro() ? 'Apply' : '🔒'}
        </button>
        <button onClick={handleSave} aria-label={saved ? 'Unsave' : 'Save job'}
          className={cn('shrink-0 p-1.5 rounded-lg transition-all duration-150',
            saved ? 'text-accent' : 'text-stone-300 dark:text-stone-600 hover:text-stone-500')}>
          {saved ? <BookmarkCheck className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
        </button>
      </Link>
    );
  }

  // ── Grid mode (card) ────────────────────────────────────────────────────
  return (
    <Link href={href} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={cn(
        'group relative flex flex-col gap-3 p-4 rounded-xl border bg-white dark:bg-[#0a1628] cursor-pointer transition-all duration-200 overflow-hidden',
        'hover:-translate-y-0.5 hover:shadow-md-brand hover:border-brand-500 dark:hover:border-brand-600',
        'border-stone-200 dark:border-[#1e3a5f]',
      )}
    >
      {/* Featured top bar — only rendered on featured jobs, overflow-hidden clips it cleanly */}
      {job.featured && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] rounded-t-xl bg-accent" />
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-lg bg-stone-100 dark:bg-[#0f1e38] border border-stone-200 dark:border-[#1e3a5f] flex items-center justify-center text-base font-black text-brand-700 dark:text-brand-400 overflow-hidden">
          {job.logo}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors line-clamp-2 leading-snug">
            {job.title}
          </h3>
          {hideCompany ? (
            <p className="text-sm font-medium mt-0.5 flex items-center gap-1 text-stone-400">
              <Lock className="w-3 h-3 shrink-0" />
              <span className="blur-[3px] select-none pointer-events-none">{isDaily ? 'Click Apply' : 'Company Name'}</span>
            </p>
          ) : (
            <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5 font-medium">{job.company}</p>
          )}
        </div>
        <button onClick={handleSave} aria-label={saved ? 'Unsave' : 'Save job'}
          className={cn('shrink-0 p-1.5 rounded-lg transition-all duration-150',
            saved ? 'text-accent' : 'text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 hover:bg-stone-100 dark:hover:bg-[#0f1e38]')}>
          {saved ? <BookmarkCheck className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
        </button>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        {job.isNew && (
          <span className="badge bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> New</span>
        )}
        {job.featured && (
          <span className="badge bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 flex items-center gap-1"><Star className="w-3 h-3" /> Featured</span>
        )}
        <span className={cn('badge', catMeta.color)}>{catMeta.label}</span>
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
        {job.timezone && <span className="flex items-center gap-1"><Timer className="w-3 h-3" />{job.timezone}</span>}
        {isAdmin() && (
          <span className={cn('flex items-center gap-1', srcMeta.color)}>
            {srcMeta.icon} {srcMeta.label}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-[#1e3a5f] flex-wrap gap-2 mt-auto">
        <div>
          {salary && (
            <span className="font-display font-bold text-sm text-brand-700 dark:text-brand-400 flex items-center gap-1"><Banknote className="w-3.5 h-3.5" />{salary}</span>
          )}
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{formatRelativeDate(job.posted)}</p>
        </div>
        <button onClick={handleApply}
          className={cn(
            'shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1',
            applied
              ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
              : dailyLimitReached
              ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 cursor-not-allowed'
              : isPro()
              ? 'bg-brand-700 dark:bg-brand-600 text-white hover:bg-brand-800 shadow-sm'
              : 'border border-brand-600 dark:border-brand-500 text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20'
          )}>
          {applied ? <><BookmarkCheck className="w-3 h-3" /> Applied</>
            : dailyLimitReached ? '10/10 Limit'
            : isPro() ? <><ArrowUpRight className="w-3 h-3" /> Apply</>
            : <><Lock className="w-3 h-3" /> Subscribe</>}
        </button>
      </div>
    </Link>
  );
}
