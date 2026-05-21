'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Clock, ArrowLeft, Bookmark, BookmarkCheck, Share2, Zap, ExternalLink } from 'lucide-react';
import { jobsApi, applicationsApi } from '@/lib/api';
import { useAuthStore, useJobsStore, useUIStore } from '@/lib/store';
import { modalService } from '@/components/ui/Modal';
import { PaywallModal } from '@/components/jobs/PaywallModal';
import { cn, formatRelativeDate, formatSalary, CATEGORY_META } from '@/lib/utils';
import type { Job } from '@/lib/types';



export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const { isPro, isLoggedIn } = useAuthStore();
  const { isSaved, toggleSave, hasApplied, addApplication } = useJobsStore();
  const { toast } = useUIStore();

  useEffect(() => {
    if (!id) return;
    jobsApi.getJob(id).then(j => { setJob(j); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div className="max-w-[900px] mx-auto px-5 py-12">
      <div className="animate-pulse space-y-4">
        <div className="skeleton h-8 w-2/3 rounded" />
        <div className="skeleton h-4 w-1/3 rounded" />
        <div className="skeleton h-48 rounded-lg" />
      </div>
    </div>
  );

  if (!job) return (
    <div className="max-w-[900px] mx-auto px-5 py-20 text-center">
      <div className="text-5xl mb-4">🔍</div>
      <h1 className="font-display font-bold text-2xl text-stone-900 dark:text-stone-100 mb-2">Job not found</h1>
      <p className="text-stone-400 mb-6">This listing may have been removed or expired.</p>
      <Link href="/jobs" className="px-6 py-3 bg-brand-700 text-white font-bold rounded-xl hover:bg-brand-600 transition-colors">Browse All Jobs</Link>
    </div>
  );

  const catMeta = CATEGORY_META[job.category] ?? CATEGORY_META.other;
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency);
  const saved = job ? isSaved(job.id) : false;
  const applied = job ? hasApplied(job.id) : false;

  async function handleApply() {
    if (!isLoggedIn()) { modalService.open(<PaywallModal mode="login" />); return; }
    if (!isPro()) { modalService.open(<PaywallModal mode="subscribe" />); return; }
    if (applied) { toast('Already applied', 'info'); return; }
    setApplying(true);
    try {
      const app = await applicationsApi.apply(job!.id);
      addApplication(app);
      toast('Application submitted! 🎉', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="max-w-[900px] mx-auto px-5 py-8">
      <Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-16 h-16 shrink-0 rounded-xl bg-stone-100 dark:bg-[#162033] border border-stone-200 dark:border-[#1e3a5f] flex items-center justify-center text-2xl font-black text-brand-700 dark:text-brand-400">
                {job.logo}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-display font-extrabold text-xl text-stone-900 dark:text-stone-100 tracking-tight mb-1">{job.title}</h1>
                <p className="text-base text-stone-500 dark:text-stone-400 font-semibold">{job.company}</p>
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-stone-400 dark:text-stone-500">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{job.location}</span>
                  {job.timezone && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{job.timezone}</span>}
                  <span>{formatRelativeDate(job.posted)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              {job.isNew && <span className="badge bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">✨ New</span>}
              {job.featured && <span className="badge bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">⭐ Featured</span>}
              <span className={cn('badge', catMeta.color)}>{catMeta.icon} {catMeta.label}</span>
              <span className="badge bg-stone-100 dark:bg-stone-800 text-stone-500">{job.type}</span>
              {job.level && <span className="badge bg-stone-100 dark:bg-stone-800 text-stone-500">{job.level}</span>}
            </div>

            {salary && (
              <div className="font-display font-extrabold text-2xl text-brand-700 dark:text-brand-400 mb-5">{salary}</div>
            )}

            <div className="job-prose">
              {job.description.split('\n\n').map((para, i) => (
                <p key={i} className="mb-4 text-stone-600 dark:text-stone-300 leading-relaxed">{para}</p>
              ))}
            </div>
          </div>

          {job.requirements && job.requirements.length > 0 && (
            <div className="card p-6">
              <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-4">Requirements</h2>
              <ul className="space-y-2">
                {job.requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-stone-600 dark:text-stone-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-600 dark:bg-brand-400 mt-2 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {job.benefits && job.benefits.length > 0 && (
            <div className="card p-6">
              <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-4">Benefits</h2>
              <div className="flex flex-wrap gap-2">
                {job.benefits.map((b, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-semibold">
                    ✓ {b}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
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
                <button onClick={handleApply} disabled={applying}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-xl hover:bg-brand-600 disabled:opacity-60 transition-colors mb-3">
                  {applying ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Applying…</> : isPro() ? <><Zap className="w-4 h-4" /> Apply Now</> : <><>🔒</> Subscribe to Apply</>}
                </button>
                {!isPro() && (
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
          </div>

          {/* Skills */}
          {job.skills && job.skills.length > 0 && (
            <div className="card p-5">
              <h3 className="font-bold text-sm text-stone-700 dark:text-stone-300 mb-3">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {job.skills.map(s => (
                  <Link key={s} href={`/jobs?q=${encodeURIComponent(s)}`}
                    className="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-[#162033] text-stone-600 dark:text-stone-300 text-xs font-semibold hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">
                    {s}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
