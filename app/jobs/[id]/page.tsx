'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Clock, ArrowLeft, Bookmark, BookmarkCheck, Share2, Zap, ExternalLink, Copy, CheckCheck } from 'lucide-react';
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
  const [copiedField, setCopiedField] = useState<string | null>(null);

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }
  const { user, isPro, isLoggedIn, dailyAppsUsed, incrementDailyApp } = useAuthStore();
  const isDaily = user?.plan === 'daily';
  const isFree = !isLoggedIn() || user?.plan === 'free';
  const dailyLimitReached = isDaily && dailyAppsUsed >= 10;
  const [companyRevealed, setCompanyRevealed] = useState(false);
  const { isSaved, toggleSave, hasApplied, addApplication } = useJobsStore();
  const { toast } = useUIStore();

  useEffect(() => {
    if (!id) return;
    jobsApi.getJob(id).then(j => {
      // If the job exists but has no real description (often the case for
      // scraped/aggregated postings where we only got title + link), send
      // the user straight to the company's vacancy page in a new tab and
      // back to /jobs so they don't see a blank detail screen.
      if (j) {
        const hasUsefulDescription = j.description && j.description.trim().length > 40;
        if (!hasUsefulDescription) {
          const target = j.applyUrl || j.sourceUrl || (j.applyEmail ? `mailto:${j.applyEmail}` : null);
          if (target) {
            window.open(target, '_blank', 'noopener,noreferrer');
            router.replace('/jobs');
            return;
          }
        }
      }
      setJob(j);
      setLoading(false);
    });
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
    if (isDaily && dailyLimitReached) {
      toast('Day Pass limit reached (10/10). Upgrade to Pro for unlimited.', 'error', 5000);
      return;
    }
    if (isDaily) { setCompanyRevealed(true); incrementDailyApp(); }
    if (applied) { toast('Already applied', 'info'); return; }
    setApplying(true);
    try {
      const app = await applicationsApi.apply(job!.id);
      addApplication(app);
      setCompanyRevealed(true);
      toast('Application submitted! 🎉 Opening application page…', 'success');
      // Redirect to the actual company application URL
      const applyTarget = job!.applyUrl || (job!.applyEmail && `mailto:${job!.applyEmail}`);
      if (applyTarget) {
        setTimeout(() => window.open(applyTarget, '_blank', 'noopener,noreferrer'), 800);
      }
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setApplying(false);
    }
  }

  // JSON-LD structured data for Google Jobs & AI search
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.posted,
    employmentType: job.type === 'full-time' ? 'FULL_TIME' : job.type === 'part-time' ? 'PART_TIME' : job.type === 'contract' ? 'CONTRACTOR' : job.type === 'freelance' ? 'TEMPORARY' : 'OTHER',
    jobLocationType: 'TELECOMMUTE',
    applicantLocationRequirements: { '@type': 'Country', name: 'Worldwide' },
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company,
      sameAs: job.applyUrl ?? undefined,
    },
    baseSalary: job.salaryMin ? {
      '@type': 'MonetaryAmount',
      currency: job.currency ?? 'USD',
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.salaryMin,
        maxValue: job.salaryMax ?? job.salaryMin,
        unitText: 'YEAR',
      },
    } : undefined,
    skills: job.skills?.join(', ') ?? undefined,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/jobs/${job.id}`,
  };

  return (
    <div className="max-w-[900px] mx-auto px-5 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
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
                {isFree ? (
                  <p className="text-base font-semibold flex items-center gap-2 text-stone-400">
                    <span className="text-sm">🔒</span>
                    <span className="blur-[4px] select-none">Hidden Company</span>
                    <span className="no-blur text-xs font-normal text-stone-400 ml-1">(upgrade to reveal)</span>
                  </p>
                ) : isDaily && !companyRevealed ? (
                  <p className="text-base font-semibold flex items-center gap-2 text-stone-400">
                    <span className="text-sm">🔒</span>
                    <span className="blur-[4px] select-none">{job.company}</span>
                    <span className="text-xs font-normal text-stone-400">(revealed on apply)</span>
                  </p>
                ) : (
                  <p className="text-base text-stone-500 dark:text-stone-400 font-semibold">{job.company}</p>
                )}
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
                  <span key={i} className="px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-semibold">
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
        </div>
      </div>
    </div>
  );
}
