'use client';
import { memo } from 'react';
import Link from 'next/link';
import { BookmarkPlus, BookmarkCheck, MapPin, Timer, ArrowUpRight, Banknote, Sparkles, Star, Lock, Zap } from 'lucide-react';
import { cn, formatRelativeDate, formatSalary, capitalize, CATEGORY_META } from '@/lib/utils';
import { useAuthStore, useJobsStore, useUIStore } from '@/lib/store';
import { applicationsApi } from '@/lib/api';
import { modalService } from '@/components/ui/Modal';
import { PaywallModal } from '@/components/jobs/PaywallModal';
import { isSafeOpenUrl, safeWindowOpen } from '@/lib/safe-url';
import { saveJobRemote, unsaveJobRemote } from '@/lib/saved-jobs-sync';
import { evaluateFreeTrial } from '@/lib/auth/free-trial';
import type { Job } from '@/lib/types';

// Check if a string looks like a real UUID (Supabase ID)
function isRealJobId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// Resolve the URL a card click should navigate to.
// We always send users to the internal detail page first so they can read
// the job description on remotejobs44 before deciding to redirect. The
// Apply button on the detail page is the only place that opens the
// external apply URL.
function cardHref(job: Job) {
  return `/jobs/${job.id}`;
}

interface JobCardProps { job: Job; listMode?: boolean; }

function JobCardImpl({ job, listMode = false }: JobCardProps) {
  // Narrow primitive zustand selectors: each card only re-renders when
  // the specific value it reads actually changes. The previous version
  // destructured the whole useAuthStore/useJobsStore/useUIStore objects,
  // so any save/apply re-ran every card on the page (50 of them on /jobs)
  // even though only the toggled card needed to re-render.
  const userPlan        = useAuthStore(s => s.user?.plan);
  const joinedAt        = useAuthStore(s => s.user?.joinedAt);
  const loggedIn        = useAuthStore(s => !!s.user);
  const dailyAppsUsed   = useAuthStore(s => s.dailyAppsUsed);
  const incrementDailyApp = useAuthStore(s => s.incrementDailyApp);
  const applicationsCount = useJobsStore(s => s.applications.length);
  // Derived booleans from primitives — re-renders only when underlying
  // primitive flips.
  const isPro    = userPlan === 'daily' || userPlan === 'pro' || userPlan === 'admin';
  const isDaily  = userPlan === 'daily';
  const isFree   = !loggedIn || userPlan === 'free';
  // Registered free-plan users get a few free applies for a week. Server
  // gate is authoritative; this drives the button affordance only.
  const freeTrialActive = loggedIn && userPlan === 'free'
    && evaluateFreeTrial({ registeredAt: joinedAt, used: applicationsCount }).canApply;
  // Apply-able right now: a paid plan OR an active free trial.
  const canApplyNow = isPro || freeTrialActive;
  // Per-job primitive selectors: `saved` flips only when THIS job's id is
  // added/removed from savedJobIds; other cards' subscriptions are noops.
  const saved   = useJobsStore(s => s.savedJobIds.includes(job.id));
  const applied = useJobsStore(s => s.applications.some(a => a.jobId === job.id));
  const toggleSave     = useJobsStore(s => s.toggleSave);
  const addApplication = useJobsStore(s => s.addApplication);
  const toast = useUIStore(s => s.toast);

  const catMeta = CATEGORY_META[job.category as keyof typeof CATEGORY_META] ?? CATEGORY_META['other'];
  const salary  = formatSalary(job.salaryMin, job.salaryMax, job.currency);
  // Day pass users also see company blurred — revealed when they click Apply
  const hideCompany = isFree || isDaily;
  const dailyLimitReached = isDaily && dailyAppsUsed >= 10;
  const href = cardHref(job);
  const isExternal = href.startsWith('http');

  async function handleSave(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!loggedIn) { modalService.open(<PaywallModal mode="login" />); return; }
    // Optimistic flip first so the bookmark icon updates instantly,
    // then mirror to the server. On error, rollback + warn so the
    // local + remote state stay in sync.
    const nowSaved = toggleSave(job.id);
    toast(nowSaved ? 'Job saved!' : 'Removed from saved', 'success', 2000);
    const fn = nowSaved ? saveJobRemote : unsaveJobRemote;
    const { ok } = await fn(job.id);
    if (!ok) {
      toggleSave(job.id);
      toast(nowSaved ? 'Couldn’t save — try again' : 'Couldn’t remove — try again', 'error', 3000);
    }
  }

  // Cancel the parent <Link>'s native middle-click → new-tab behaviour so
  // middle-clicking Apply / Save actually fires the button handler instead
  // of opening the detail page. (onAuxClick runs for middle + right click;
  // we only care about middle but preventDefault is harmless on right.)
  function cancelAux(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleApply(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!loggedIn) { modalService.open(<PaywallModal mode="login" />); return; }
    if (!canApplyNow) { modalService.open(<PaywallModal mode="subscribe" />); return; }
    if (isDaily && dailyLimitReached) {
      toast('Day Pass limit reached (10/10 applications). Upgrade to Pro for unlimited.', 'error', 5000);
      return;
    }

    // Treat any non-http(s)/mailto applyUrl as missing — `javascript:` URLs
    // from a compromised ATS feed must not reach window.open.
    const applyTargetRaw = job.applyUrl || (job.applyEmail ? `mailto:${job.applyEmail}` : null);
    const applyTarget    = isSafeOpenUrl(applyTargetRaw) ? applyTargetRaw : null;

    // Already-applied path: skip the API call (no double-counting against
    // Day Pass limit, no duplicate-409) and just re-open the same link.
    // The Apply button itself signals "Applied" via the styling below;
    // re-clicking should still WORK because users routinely re-open
    // application pages to upload extra docs / check status.
    if (applied) {
      if (applyTarget) safeWindowOpen(applyTarget);
      else toast('No application link available for this job', 'error');
      return;
    }

    // No-DB-track path for non-real (mock) job ids: just open the link.
    if (!isRealJobId(job.id)) {
      if (applyTarget) safeWindowOpen(applyTarget);
      else toast('No application link available for this job', 'error');
      return;
    }

    try {
      const app = await applicationsApi.apply(job.id);
      addApplication(app);
      if (isDaily) incrementDailyApp();
      // One toast, not two: confirm tracking, and only mention a missing link
      // when there genuinely isn't one (the old code stacked both).
      if (applyTarget) {
        toast('Application tracked! 🎉', 'success');
        safeWindowOpen(applyTarget);
      } else {
        toast('Application tracked! No apply link on file for this job.', 'success');
      }
    } catch (err: any) {
      // If DB tracking fails but we have a URL, still let them apply
      if (applyTarget && err.message?.includes('not found')) {
        safeWindowOpen(applyTarget);
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
        <button onClick={handleApply} onAuxClick={cancelAux}
          aria-label={applied ? 'Already applied' : canApplyNow ? 'Apply to this job' : 'Subscribe to apply'}
          title={applied ? 'Already applied' : canApplyNow ? 'Apply' : 'Subscribe to apply'}
          className={cn(
            'shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150',
            applied ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
              : canApplyNow ? 'bg-brand-700 dark:bg-brand-600 text-white hover:bg-brand-800'
              : 'border border-brand-600 text-brand-700 dark:text-brand-400 hover:bg-brand-50'
          )}>
          {applied ? '✓' : canApplyNow ? 'Apply' : '🔒'}
        </button>
        <button onClick={handleSave} onAuxClick={cancelAux} aria-label={saved ? 'Unsave' : 'Save job'}
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
        <button onClick={handleSave} onAuxClick={cancelAux} aria-label={saved ? 'Unsave' : 'Save job'}
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
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-[#1e3a5f] flex-wrap gap-2 mt-auto">
        <div>
          {salary && (
            <span className="font-display font-bold text-sm text-brand-700 dark:text-brand-400 flex items-center gap-1"><Banknote className="w-3.5 h-3.5" />{salary}</span>
          )}
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{formatRelativeDate(job.posted)}</p>
        </div>
        <button onClick={handleApply} onAuxClick={cancelAux}
          className={cn(
            'shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1',
            applied
              ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
              : dailyLimitReached
              ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 cursor-not-allowed'
              : canApplyNow
              ? 'bg-brand-700 dark:bg-brand-600 text-white hover:bg-brand-800 shadow-sm'
              : 'border border-brand-600 dark:border-brand-500 text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20'
          )}>
          {applied ? <><BookmarkCheck className="w-3 h-3" /> Applied</>
            : dailyLimitReached ? '10/10 Limit'
            : isPro ? <><ArrowUpRight className="w-3 h-3" /> Apply</>
            : freeTrialActive ? <><Zap className="w-3 h-3" /> Apply Free</>
            : <><Lock className="w-3 h-3" /> Subscribe</>}
        </button>
      </div>
    </Link>
  );
}

// Memoised export — combined with the per-job primitive zustand selectors
// above, this means a save/apply on card A only re-renders card A. Card B's
// `job` prop reference is stable across renders (the parent's jobs array
// comes from the server-component fetch), so React.memo's default shallow
// prop compare correctly skips them.
export const JobCard = memo(JobCardImpl);
