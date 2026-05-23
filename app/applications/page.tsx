'use client';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Clock, CheckCircle, XCircle, ArrowRight, Briefcase } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useJobsStore } from '@/lib/store';
import { formatRelativeDate } from '@/lib/utils';

const STATUS_CONFIG = {
  applied:   { label: 'Applied',    color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',   icon: <Clock className="w-4 h-4" /> },
  screening: { label: 'Screening',  color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400', icon: <FileText className="w-4 h-4" /> },
  interview: { label: 'Interview',  color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',   icon: <Clock className="w-4 h-4" /> },
  offer:     { label: 'Offer! 🎉',  color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400', icon: <CheckCircle className="w-4 h-4" /> },
  rejected:  { label: 'Rejected',   color: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',          icon: <XCircle className="w-4 h-4" /> },
  withdrawn: { label: 'Withdrawn',  color: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',     icon: <XCircle className="w-4 h-4" /> },
} as const;

function ApplicationsContent() {
  const router   = useRouter();
  const supabase = createClient();
  const { applications } = useJobsStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (!authUser) { router.replace('/login?next=/applications'); return; }
      setChecked(true);
    });
  }, []);

  if (!checked) return (
    <div className="max-w-[900px] mx-auto px-5 py-8 animate-pulse space-y-4">
      <div className="skeleton h-8 w-48 rounded" />
      <div className="skeleton h-32 rounded-lg" />
      <div className="skeleton h-32 rounded-lg" />
    </div>
  );

  const byStatus = {
    active:   applications.filter(a => ['applied','screening','interview'].includes(a.status)),
    offers:   applications.filter(a => a.status === 'offer'),
    closed:   applications.filter(a => ['rejected','withdrawn'].includes(a.status)),
  };

  return (
    <div className="max-w-[900px] mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">My Applications</h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">{applications.length} total applications</p>
        </div>
        <Link href="/jobs"
          className="flex items-center gap-2 px-4 py-2 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
          <Briefcase className="w-4 h-4" /> Browse Jobs
        </Link>
      </div>

      {applications.length === 0 ? (
        <div className="card p-16 text-center">
          <FileText className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-4" />
          <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-2">No applications yet</h2>
          <p className="text-stone-400 dark:text-stone-500 mb-6 max-w-sm mx-auto">
            Start applying to jobs to track them here. Upgrade to Pro to apply with one click.
          </p>
          <Link href="/jobs"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700 text-white font-bold rounded-lg hover:bg-brand-600 transition-colors">
            Browse Jobs <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active */}
          {byStatus.active.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-3">
                Active ({byStatus.active.length})
              </h2>
              <div className="space-y-2">
                {byStatus.active.map(app => {
                  const cfg = STATUS_CONFIG[app.status as keyof typeof STATUS_CONFIG];
                  return (
                    <div key={app.id} className="card p-4 flex items-center gap-4 hover:border-brand-600 dark:hover:border-brand-500 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-sm font-black text-brand-700 dark:text-brand-400 shrink-0">
                        {(app.companyLogo ?? app.company[0]).toString()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-stone-900 dark:text-stone-100 truncate">{app.jobTitle}</p>
                        <p className="text-xs text-stone-400 dark:text-stone-500">{app.company} · Applied {formatRelativeDate(app.appliedAt)}</p>
                      </div>
                      {/* Progress steps */}
                      <div className="hidden sm:flex items-center gap-1">
                        {app.steps.map((step, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${step.done ? 'bg-brand-600' : 'bg-stone-200 dark:bg-stone-700'}`} />
                            {i < app.steps.length - 1 && <div className="w-4 h-px bg-stone-200 dark:bg-stone-700" />}
                          </div>
                        ))}
                      </div>
                      <span className={`badge ${cfg.color} flex items-center gap-1 shrink-0`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Offers */}
          {byStatus.offers.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-3">
                Offers 🎉 ({byStatus.offers.length})
              </h2>
              <div className="space-y-2">
                {byStatus.offers.map(app => (
                  <div key={app.id} className="card p-4 flex items-center gap-4 border-orange-300 dark:border-orange-700/50 bg-orange-50/30 dark:bg-orange-900/10">
                    <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-sm font-black text-orange-700 dark:text-orange-400 shrink-0">
                      {app.company[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-stone-900 dark:text-stone-100 truncate">{app.jobTitle}</p>
                      <p className="text-xs text-stone-400">{app.company}</p>
                    </div>
                    <span className="badge bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">🎉 Offer received</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Closed */}
          {byStatus.closed.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-3">
                Closed ({byStatus.closed.length})
              </h2>
              <div className="space-y-2 opacity-60">
                {byStatus.closed.map(app => {
                  const cfg = STATUS_CONFIG[app.status as keyof typeof STATUS_CONFIG];
                  return (
                    <div key={app.id} className="card p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-sm font-black text-stone-400 shrink-0">
                        {app.company[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-stone-600 dark:text-stone-400 truncate">{app.jobTitle}</p>
                        <p className="text-xs text-stone-400">{app.company}</p>
                      </div>
                      <span className={`badge ${cfg.color}`}>{cfg.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<div className="max-w-[900px] mx-auto px-5 py-8 animate-pulse"><div className="skeleton h-8 w-48 rounded mb-6" /></div>}>
      <ApplicationsContent />
    </Suspense>
  );
}
