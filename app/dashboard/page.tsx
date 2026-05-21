'use client';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Briefcase, BookmarkCheck, FileText, TrendingUp, ArrowRight, Star, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore, useJobsStore, useUIStore } from '@/lib/store';
import { formatRelativeDate } from '@/lib/utils';
import { MOCK_JOBS } from '@/lib/mock-data';

// Inner component — uses useSearchParams, so must be inside <Suspense>
function DashboardContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();
  const { user, setUser, isPro } = useAuthStore();
  const { applications, savedJobIds } = useJobsStore();
  const { toast } = useUIStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login?next=/dashboard'); return; }

      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single();

      if (profile) {
        setUser({
          id:    session.user.id,
          email: session.user.email!,
          name:  profile.name ?? session.user.email!.split('@')[0],
          plan:  profile.plan  ?? 'free',
          role:  profile.role  ?? 'user',
          joinedAt: profile.created_at,
          profileCompletion: profile.profile_completion ?? 20,
        });
      }
      setLoading(false);
    }
    loadSession();
  }, []);

  // Post-payment toast
  useEffect(() => {
    if (searchParams.get('subscribed') === '1') {
      const plan = searchParams.get('plan') ?? 'pro';
      const label = plan === 'daily' ? 'Day Pass' : plan === 'pro_annual' ? 'Pro Annual' : 'Pro Monthly';
      toast(`🎉 Welcome to ${label}! Full access unlocked.`, 'success', 7000);
    }
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    router.push('/');
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="skeleton h-28 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="skeleton h-64 rounded-lg" />
          <div className="skeleton h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const recentApps = applications.slice(0, 3);
  const savedJobs  = MOCK_JOBS.filter(j => savedJobIds.includes(j.id)).slice(0, 3);
  const featured   = MOCK_JOBS.filter(j => j.featured).slice(0, 3);
  const planLabel  = user.plan === 'daily' ? 'Day Pass' : user.plan === 'pro' ? 'Pro' : user.plan === 'admin' ? 'Admin' : 'Free';
  const planColor  = user.plan === 'free'
    ? 'text-stone-500 bg-stone-100 dark:bg-stone-800'
    : 'text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400';

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">
            Welcome back, {user.name.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-1 flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${planColor}`}>{planLabel}</span>
            {user.plan === 'free' ? '· Upgrade to apply to any job' : '· All features unlocked'}
          </p>
        </div>
        <div className="flex gap-2">
          {user.plan === 'free' && (
            <Link href="/pricing"
              className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 rounded-lg text-sm font-bold hover:bg-amber-100 transition-colors">
              <Zap className="w-4 h-4" /> Upgrade from ₦1,000
            </Link>
          )}
          <button onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-stone-500 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            Log out
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Saved Jobs',    value: savedJobIds.length,    icon: <BookmarkCheck className="w-5 h-5" />, color: 'amber', href: '/jobs' },
          { label: 'Applications', value: applications.length,    icon: <FileText className="w-5 h-5" />,      color: 'blue',  href: '/applications' },
          { label: 'Profile',      value: `${user.profileCompletion ?? 20}%`, icon: <TrendingUp className="w-5 h-5" />, color: 'brand', href: '/profile' },
        ].map(s => (
          <Link key={s.label} href={s.href}
            className="card p-4 hover:border-brand-600 dark:hover:border-brand-500 transition-all group">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${
              s.color === 'amber' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' :
              s.color === 'blue'  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' :
                                    'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
            }`}>{s.icon}</div>
            <p className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100">{s.value}</p>
            <p className="text-xs font-semibold text-stone-400 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors mt-0.5">
              {s.label} →
            </p>
          </Link>
        ))}
      </div>

      {/* Recent applications + saved jobs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 dark:border-[#1e3a5f]">
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-stone-400" /> Recent Applications
            </h2>
            <Link href="/applications" className="text-xs text-brand-700 dark:text-brand-400 font-semibold hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentApps.length === 0 ? (
            <div className="p-8 text-center">
              <Briefcase className="w-8 h-8 text-stone-300 dark:text-stone-600 mx-auto mb-2" />
              <p className="text-sm text-stone-400 mb-3">No applications yet</p>
              <Link href="/jobs" className="text-xs text-brand-700 dark:text-brand-400 font-semibold hover:underline">Browse jobs →</Link>
            </div>
          ) : recentApps.map(app => (
            <div key={app.id} className="flex items-center gap-3 px-5 py-3 border-b border-stone-50 dark:border-[#162033] last:border-0 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
              <div className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-xs font-black text-brand-700 shrink-0">
                {app.company[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{app.jobTitle}</p>
                <p className="text-xs text-stone-400">{app.company} · {formatRelativeDate(app.appliedAt)}</p>
              </div>
              <span className={`badge ${
                app.status === 'applied'   ? 'bg-blue-50 text-blue-600' :
                app.status === 'interview' ? 'bg-amber-50 text-amber-600' :
                app.status === 'offer'     ? 'bg-orange-50 text-orange-600' :
                                             'bg-stone-100 text-stone-500'
              }`}>{app.status}</span>
            </div>
          ))}
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 dark:border-[#1e3a5f]">
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <BookmarkCheck className="w-4 h-4 text-amber-500" /> Saved Jobs
            </h2>
            <Link href="/jobs" className="text-xs text-brand-700 dark:text-brand-400 font-semibold hover:underline flex items-center gap-1">
              Browse more <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {savedJobs.length === 0 ? (
            <div className="p-8 text-center">
              <BookmarkCheck className="w-8 h-8 text-stone-300 dark:text-stone-600 mx-auto mb-2" />
              <p className="text-sm text-stone-400 mb-3">No saved jobs yet</p>
              <Link href="/jobs" className="text-xs text-brand-700 dark:text-brand-400 font-semibold hover:underline">Find jobs →</Link>
            </div>
          ) : savedJobs.map(job => (
            <Link key={job.id} href={`/jobs/${job.id}`}
              className="flex items-center gap-3 px-5 py-3 border-b border-stone-50 dark:border-[#162033] last:border-0 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
              <div className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-xs font-black text-brand-700">{job.logo}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{job.title}</p>
                <p className="text-xs text-stone-400">{job.company} · {job.location}</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-stone-300 shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* Featured */}
      <div className="mt-6">
        <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500" /> Featured Opportunities
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {featured.map(job => (
            <Link key={job.id} href={`/jobs/${job.id}`}
              className="card p-4 hover:border-brand-600 dark:hover:border-brand-500 hover:-translate-y-0.5 transition-all group">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-md bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-xs font-black text-brand-700">{job.logo}</div>
                <p className="text-xs font-bold text-stone-500 truncate">{job.company}</p>
              </div>
              <p className="text-sm font-bold text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors line-clamp-2">{job.title}</p>
              <p className="text-xs text-stone-400 mt-1">{job.location}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

// Outer page wraps everything in Suspense
export default function DashboardPage() {
  return (
    <div className="max-w-[1000px] mx-auto px-5 py-8">
      <Suspense fallback={
        <div className="animate-pulse space-y-4">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="skeleton h-28 rounded-lg" />)}
          </div>
        </div>
      }>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
