'use client';
// components/jobs/JobActionsCard.tsx
//
// All the auth-dependent / interactive UI for a job detail page bundled
// into a single client island:
//   - Apply button (with paywall modal, day-pass quota, daily limit)
//   - Save toggle
//   - Share (clipboard)
//   - Admin-only Delete
//   - Pro-only "Quick Copy — CV Details" autofill helper
//
// The rest of the job detail page is now a Server Component, so the
// title, description, salary, requirements, benefits, skills, and
// JobPosting JSON-LD are all in the SSR'd HTML where AI/non-JS
// crawlers (Bing, Perplexity, ClaudeBot, GPTBot) can read them.
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Bookmark, BookmarkCheck, Share2, Zap, Copy, CheckCheck, Trash2, Shield } from 'lucide-react';
import { useAuthStore, useJobsStore, useUIStore } from '@/lib/store';
import { jobsApi, applicationsApi } from '@/lib/api';
import { modalService } from '@/components/ui/Modal';
import { PaywallModal } from '@/components/jobs/PaywallModal';
import { safeWindowOpen, isSafeOpenUrl } from '@/lib/safe-url';
import { cn } from '@/lib/utils';
import type { Job } from '@/lib/types';

export function JobActionsCard({ job }: { job: Job }) {
  const router = useRouter();
  const { user, isPro, isAdmin, isLoggedIn, dailyAppsUsed, incrementDailyApp } = useAuthStore();
  const { isSaved, toggleSave, hasApplied, addApplication } = useJobsStore();
  const { toast } = useUIStore();

  const [applying, setApplying] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const isDaily = user?.plan === 'daily';
  const dailyLimitReached = isDaily && dailyAppsUsed >= 10;
  const saved = isSaved(job.id);
  const applied = hasApplied(job.id);

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }

  async function handleAdminDelete() {
    if (!confirm(`Delete "${job.title}" at ${job.company}?\n\nThis is permanent — the row is removed from the jobs table.`)) return;
    try {
      await jobsApi.deleteJob(job.id);
      toast('Job deleted', 'success');
      router.replace('/jobs');
    } catch (err: any) {
      toast(err.message ?? 'Delete failed', 'error');
    }
  }

  async function handleApply() {
    if (!isLoggedIn()) { modalService.open(<PaywallModal mode="login" />); return; }
    if (!isPro()) { modalService.open(<PaywallModal mode="subscribe" />); return; }
    if (isDaily && dailyLimitReached) {
      toast('Day Pass limit reached (10/10). Upgrade to Pro for unlimited.', 'error', 5000);
      return;
    }
    // Important: this guard runs BEFORE incrementDailyApp(). Previously a
    // duplicate-click on an already-applied job still bumped the daily
    // counter — a Day Pass user could hit 10/10 with zero new applications.
    if (applied) { toast('Already applied', 'info'); return; }
    setApplying(true);
    try {
      const app = await applicationsApi.apply(job.id);
      addApplication(app);
      if (isDaily) incrementDailyApp();
      const applyTargetRaw = job.applyUrl || (job.applyEmail && `mailto:${job.applyEmail}`);
      if (isSafeOpenUrl(applyTargetRaw)) {
        safeWindowOpen(applyTargetRaw);
      }
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      {/* Apply card */}
      <div className="card p-5 sticky top-24">
        {applied ? (
          <div className="text-center py-2">
            <div className="text-3xl mb-2">🎉</div>
            <p className="font-bold text-brand-700 dark:text-brand-400 text-sm">Application submitted!</p>
            <Link href="/applications" className="text-xs text-stone-400 hover:underline mt-1 block">View in tracker</Link>
          </div>
        ) : (
          <>
            <button onClick={handleApply} disabled={applying || dailyLimitReached}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3 font-bold rounded-xl transition-colors mb-3',
                dailyLimitReached
                  ? 'bg-stone-100 dark:bg-stone-800 text-stone-400 cursor-not-allowed'
                  : 'bg-brand-700 dark:bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-60'
              )}>
              {applying ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Applying…</>
                : dailyLimitReached ? '10/10 applications used'
                : isPro() ? <><Zap className="w-4 h-4" /> Apply Now</>
                : <><span>🔒</span> Subscribe to Apply</>}
            </button>
            {isDaily && dailyLimitReached && (
              <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                Day Pass limit reached. <Link href="/pricing" className="font-semibold underline">Upgrade to Pro</Link> for unlimited.
              </p>
            )}
            {!isPro() && !dailyLimitReached && (
              <p className="text-xs text-stone-400 dark:text-stone-500 text-center">
                <Link href="/pricing" className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">Pro</Link> unlocks apply links & auto-apply
              </p>
            )}
          </>
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={() => { const s = toggleSave(job.id); toast(s ? '🔖 Saved!' : 'Removed', 'success', 2000); }}
            className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-colors',
              saved ? 'border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'border-stone-200 dark:border-[#1e3a5f] text-stone-500 hover:bg-stone-50 dark:hover:bg-[#162033]')}>
            {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            {saved ? 'Saved' : 'Save'}
          </button>
          <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast('Link copied!', 'success', 2000); }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-stone-200 dark:border-[#1e3a5f] text-stone-500 text-sm font-semibold hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            <Share2 className="w-4 h-4" /> Share
          </button>
        </div>

        {/* Admin-only quick-delete — handy when triaging spam / dead postings. */}
        {isAdmin() && (
          <div className="mt-3 pt-3 border-t border-stone-100 dark:border-[#1e3a5f]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2 flex items-center gap-1.5">
              <Shield className="w-3 h-3" /> Admin
            </p>
            <button onClick={handleAdminDelete}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete this job
            </button>
          </div>
        )}
      </div>

      {/* CV Autofill helper — only shown to pro users who are applying */}
      {isPro() && user && (
        <div className="card p-5">
          <h3 className="font-bold text-sm text-stone-700 dark:text-stone-300 mb-1">Quick Copy — CV Details</h3>
          <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">Click any field to copy it for pasting into the application form.</p>
          <div className="space-y-2">
            {[
              { label: 'Full Name', value: user.name },
              { label: 'Email', value: user.email },
            ].map(({ label, value }) => value ? (
              <button key={label}
                onClick={() => copyToClipboard(value, label)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-stone-50 dark:bg-[#162033] border border-stone-100 dark:border-[#1e3a5f] hover:border-brand-400 transition-colors group text-left"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">{label}</p>
                  <p className="text-xs font-semibold text-stone-700 dark:text-stone-200 truncate">{value}</p>
                </div>
                {copiedField === label
                  ? <CheckCheck className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
                  : <Copy className="w-3.5 h-3.5 text-stone-300 group-hover:text-brand-500 shrink-0 transition-colors" />}
              </button>
            ) : null)}
          </div>
          <Link href="/profile" className="mt-3 block text-xs text-brand-700 dark:text-brand-400 hover:underline text-center">
            Edit profile & upload CV →
          </Link>
        </div>
      )}
    </>
  );
}
