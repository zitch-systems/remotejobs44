'use client';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Briefcase, BookmarkCheck, FileText, TrendingUp, ArrowRight, Star, Zap } from 'lucide-react';
import { createClient, getAuthedUserSafe } from '@/lib/supabase/client';
import { useAuthStore, useJobsStore, useUIStore } from '@/lib/store';
import { resolveRole } from '@/lib/auth/redirect';
import { resolvePlan } from '@/lib/auth/plan';
import { formatRelativeDate } from '@/lib/utils';
import type { Job, Application } from '@/lib/types';

// Inner component — uses useSearchParams, so must be inside <Suspense>
function DashboardContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();
  const { user, setUser, isPro } = useAuthStore();
  const { applications, savedJobIds } = useJobsStore();
  const { toast } = useUIStore();
  // Optimistic render: if persisted Zustand has a user, show the dashboard
  // immediately with that data and run the profile refresh in the
  // background. Skeleton only shows on a genuinely cold first visit.
  // Use `user` from the hook subscription (above) — getState() reads the
  // pre-hydration null and would force the skeleton on every cold load.
  const [loading, setLoading] = useState(!user);
  useEffect(() => { if (user && loading) setLoading(false); }, [user, loading]);
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [featured, setFeatured] = useState<Job[]>([]);

  useEffect(() => {
    let cancelled = false;
    // HARD failsafe: clear the loading skeleton after 10s no matter what.
    // Without this, any stall in loadSession (e.g., a hanging Supabase
    // call with no timeout) leaves the dashboard spinning forever on
    // throttled Vercel functions.
    const failsafe = setTimeout(() => { if (!cancelled) setLoading(false); }, 10000);
    async function loadSession() {
      try {
        // Fast path: Header.syncAuth already validates the session on every
        // page mount and populates Zustand. If Zustand has a user we trust
        // it for first paint, refresh the profile data in the background,
        // and skip the dashboard's own getAuthedUserSafe round-trip (which
        // was duplicating middleware getUser + Header getUser on every
        // dashboard load and adding ~2s of latency in the cold path).
        const persistedUser = useAuthStore.getState().user;
        let authUser: { id: string; email?: string | null } | null = persistedUser
          ? { id: persistedUser.id, email: persistedUser.email }
          : null;

        if (!authUser) {
          // Cold load with no persisted user — fall back to the validated
          // path with the 2s retry to absorb token-refresh races.
          let attempt = await getAuthedUserSafe(supabase);
          if (attempt.status === 'unauthed' && useAuthStore.getState().user) {
            await new Promise(r => setTimeout(r, 2000));
            attempt = await getAuthedUserSafe(supabase);
          }
          const { user: u, status } = attempt;
          if (status === 'unauthed')  { router.replace('/login?next=/dashboard'); return; }
          // Transient — DON'T redirect. Mobile slow networks legitimately
          // hit this with valid sessions. Render the page; the
          // sign-in fallback at the bottom covers genuine logged-out.
          if (status === 'transient') {
            setLoading(false);
            return;
          }
          if (!u)                     { router.replace('/login?next=/dashboard'); return; }
          authUser = u;
        }

        let profile: any = null;
        try {
          // Enumerated columns instead of select('*'): paystack_*_code
          // and paystack_email_token are server-only state — no need to
          // ship them to the browser even for the owning user.
          const queryPromise = supabase
            .from('profiles')
            .select('id, email, name, plan, role, created_at, updated_at, profile_completion, plan_expires_at, suspended, suspended_reason, cv_url')
            .eq('id', authUser.id)
            .maybeSingle()
            .then(({ data }) => data);
          const timeoutPromise = new Promise<null>(res => setTimeout(() => res(null), 5000));
          profile = await Promise.race([queryPromise, timeoutPromise]);
        } catch {}

        // Profile missing — common right after a fresh Google OAuth signup:
        // the auth/callback profile upsert runs in waitUntil (background)
        // and may not have finished before the browser lands here. Also
        // covers the case where the on_auth_user_created trigger hasn't
        // committed yet. Render a skeleton user from the auth session so
        // the page is never blank, then retry the profile fetch a few
        // times to upgrade the state once the row appears.
        //
        // CRITICAL: write the skeleton whenever the persisted user's id
        // does not match the authed user. Otherwise a previous user's
        // localStorage state on the same device leaks into the new login —
        // they would see the prior user's name / plan / role until the
        // background retry caught up. That was a real security bug.
        if (!profile) {
          const persisted = useAuthStore.getState().user;
          if (!persisted || persisted.id !== authUser.id) {
            // Use the full auth user (not just id+email) so we can pick up
            // user_metadata.name / full_name from Google.
            const { data: { user: fullUser } } = await supabase.auth.getUser();
            const meta = (fullUser?.user_metadata ?? {}) as Record<string, any>;
            const fallbackName = meta.name ?? meta.full_name ?? authUser.email!.split('@')[0];
            setUser({
              id: authUser.id,
              email: authUser.email!,
              name: fallbackName,
              plan: 'free',
              role: 'user',
              joinedAt: new Date().toISOString(),
              profileCompletion: 20,
            });
          }
          setLoading(false);
          // Background retry: poll for the profile row up to 5x at 1s
          // intervals. Once it lands, replace the skeleton user with the
          // real one. This is what catches up to the trigger / waitUntil
          // upsert without blocking the first paint.
          let tries = 0;
          const retry = async () => {
            tries++;
            const { data: row } = await supabase
              .from('profiles')
              .select('id, email, name, plan, role, created_at, updated_at, profile_completion, plan_expires_at, suspended, suspended_reason, cv_url')
              .eq('id', authUser.id)
              .maybeSingle();
            if (row) {
              const r = resolveRole({ profileRole: row.role, email: authUser.email });
              if (r === 'admin') { router.replace('/admin'); return; }
              // r was narrowed to 'user' by the early-return above.
              const plan = resolvePlan({
                role: r,
                dbPlan: row.plan,
                planExpiresAt: row.plan_expires_at,
                currentClientPlan: useAuthStore.getState().user?.plan,
              });
              setUser({
                id: authUser.id,
                email: authUser.email!,
                name: row.name ?? authUser.email!.split('@')[0],
                plan,
                role: r,
                joinedAt: row.created_at ?? new Date().toISOString(),
                profileCompletion: row.profile_completion ?? 20,
              });
              return;
            }
            if (tries < 5) setTimeout(retry, 1000);
          };
          setTimeout(retry, 800);
          return;
        }

        const role = resolveRole({ profileRole: profile.role, email: authUser.email });
        // Admins shouldn't be on /dashboard — send them to /admin
        if (role === 'admin') {
          router.replace('/admin');
          return;
        }

        const plan = resolvePlan({
          role,
          dbPlan: profile.plan,
          planExpiresAt: profile.plan_expires_at,
          currentClientPlan: useAuthStore.getState().user?.plan,
        });

        setUser({
          id:    authUser.id,
          email: authUser.email!,
          name:  profile.name ?? authUser.email!.split('@')[0],
          plan,
          role,
          joinedAt: profile.created_at ?? new Date().toISOString(),
          profileCompletion: profile.profile_completion ?? 20,
        });
      } catch {
        // Network exception — don't redirect, keep showing the page
      }
      setLoading(false);
    }

    async function loadJobs() {
      try {
        // Fetch featured jobs from real API
        const res = await fetch('/api/jobs?sort=newest&perPage=6');
        if (res.ok) {
          const data = await res.json();
          const jobs: Job[] = data.jobs ?? [];
          setFeatured(jobs.filter((j: Job) => j.featured).slice(0, 3));
        }
      } catch {}
    }

    async function loadApplications() {
      // Server is source of truth for applications. Backfill the local
      // zustand store with any rows we haven't seen yet — self-heals
      // dashboards that lost their local cache (e.g., users hit by the
      // pre-fix spurious-reset-on-setUser(null) bug).
      try {
        const res = await fetch('/api/applications');
        if (!res.ok) return;
        const json = await res.json();
        const list: Application[] = Array.isArray(json.applications) ? json.applications : [];
        const current = useJobsStore.getState();
        const knownIds = new Set(current.applications.map(a => a.id));
        for (const a of list) {
          if (!knownIds.has(a.id)) current.addApplication(a);
        }
      } catch {}
    }

    // Wrap loadSession in try/finally so setLoading(false) always fires
    // even if an inner await throws unexpectedly.
    (async () => {
      try { await loadSession(); } finally { if (!cancelled) setLoading(false); }
    })();
    loadJobs();
    loadApplications();
    return () => { cancelled = true; clearTimeout(failsafe); };
  }, []);

  // Load saved job details whenever savedJobIds change.
  // One batched request via /api/jobs?ids=a,b,c instead of N×1 round-trips —
  // the N×1 version was costing ~600ms of dashboard render time on slow
  // connections even though we only render 3 cards.
  useEffect(() => {
    if (savedJobIds.length === 0) { setSavedJobs([]); return; }
    const ids = savedJobIds.slice(0, 3);
    fetch(`/api/jobs?ids=${ids.join(',')}`)
      .then(r => r.ok ? r.json() : { jobs: [] })
      .then((d: { jobs?: Job[] }) => setSavedJobs((d.jobs ?? []).slice(0, 3)))
      .catch(() => setSavedJobs([]));
  }, [savedJobIds.join(',')]);

  // Post-payment: re-sync user plan from DB so UI updates immediately.
  // Optimistically flips the plan in Zustand based on the URL so the dashboard
  // doesn't render "Upgrade from ₦500" for a user who just paid — then polls
  // the DB until the webhook stamps the real plan, refusing to overwrite the
  // optimistic value with profile.plan='free' until we run out of retries.
  useEffect(() => {
    const subscribed = searchParams.get('subscribed') === '1' || searchParams.get('success') === '1';
    if (!subscribed) return;
    const plan = searchParams.get('plan') ?? 'pro';
    const label = plan === 'daily' ? 'Day Pass' : plan === 'pro_annual' ? 'Pro Annual' : 'Pro Monthly';
    toast(`🎉 Welcome to ${label}! Full access unlocked.`, 'success', 7000);

    const optimisticPlan: 'daily' | 'pro' = plan === 'daily' ? 'daily' : 'pro';
    const { updateUser } = useAuthStore.getState();
    updateUser({ plan: optimisticPlan });

    let attempts = 0;
    const maxAttempts = 10;
    async function sync() {
      try {
        // Use getAuthedUserSafe so a transient 401 during a token refresh
        // doesn't silently kill the poll and leave the user stuck on the
        // optimistic plan with no DB reconciliation.
        const { user: authUser, status } = await getAuthedUserSafe(supabase);
        if (status === 'unauthed' || !authUser) return;
        if (status === 'transient') {
          if (attempts < maxAttempts) { attempts++; setTimeout(sync, 1000); }
          return;
        }
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('name,plan,role,created_at,profile_completion,plan_expires_at')
          .eq('id', authUser.id)
          .maybeSingle();
        if (error || !profile) {
          if (attempts < maxAttempts) { attempts++; setTimeout(sync, 1000); }
          return;
        }
        const role = resolveRole({ profileRole: profile.role, email: authUser.email });
        const expiryMs = profile.plan_expires_at ? new Date(profile.plan_expires_at).getTime() : null;
        const hasFutureExpiry = expiryMs !== null && expiryMs >= Date.now();
        // Keep polling while DB still says 'free' AND we have no proof of
        // payment via plan_expires_at. Once verify or webhook lands, the
        // expiry timestamp or the plan column will flip.
        const rawDbPlan = role === 'admin' ? 'admin' : (profile.plan ?? 'free');
        if (rawDbPlan === 'free' && !hasFutureExpiry && plan !== 'free' && attempts < maxAttempts) {
          attempts++;
          setTimeout(sync, 1000);
          return;
        }
        const finalPlan = resolvePlan({
          role,
          dbPlan: profile.plan,
          planExpiresAt: profile.plan_expires_at,
          // During the webhook-race window, keep the optimistic plan we set
          // before this poll started (paystack callback hint).
          currentClientPlan: optimisticPlan,
        });
        setUser({
          id: authUser.id,
          email: authUser.email!,
          name: profile.name ?? authUser.email!.split('@')[0],
          plan: finalPlan,
          role,
          joinedAt: profile.created_at ?? new Date().toISOString(),
          profileCompletion: profile.profile_completion ?? 20,
        });
      } catch {
        if (attempts < maxAttempts) { attempts++; setTimeout(sync, 1000); }
      }
    }
    sync();
  }, []);

  async function handleLogout() {
    setUser(null);
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-') || k.startsWith('supabase') || k.startsWith('rj44')) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
    try { await supabase.auth.signOut(); } catch {}
    window.location.replace('/');
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

  // Fallback prompt instead of `return null` so a transient auth state
  // never presents as a blank "dashboard not loading" page.
  if (!user) return (
    <div className="max-w-[500px] mx-auto px-5 py-20 text-center">
      <p className="text-stone-500 dark:text-stone-400 mb-6">Your session expired. Please sign in to view your dashboard.</p>
      <Link href="/login?next=/dashboard" className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 transition-colors">
        Sign in
      </Link>
    </div>
  );

  const recentApps = applications.slice(0, 3);
  const planLabel  = user.plan === 'daily' ? 'Day Pass' : user.plan === 'pro' ? 'Pro' : user.plan === 'admin' ? 'Admin' : 'Free';
  const planColor  = user.plan === 'free'
    ? 'text-stone-500 bg-stone-100 dark:bg-stone-800'
    : 'text-brand-700 bg-brand-50 dark:bg-brand-900/30 dark:text-brand-400';

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
              <Zap className="w-4 h-4" /> Upgrade from ₦500
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