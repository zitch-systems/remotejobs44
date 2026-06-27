'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User, Mail, Save, Zap, Shield, LogOut, Upload, FileText, CheckCircle,
  Brain, Sparkles, AlertCircle, Settings, CreditCard, Bell, Trash2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { documentHasSupabaseAuthCookie } from '@/lib/supabase/cookies';
import { useAuthStore, useUIStore } from '@/lib/store';
import { resolveRole } from '@/lib/auth/redirect';
import { resolvePlan } from '@/lib/auth/plan';
import { VerifyEmailBanner } from '@/components/auth/VerifyEmailBanner';

// Profile page — anti-glitch pattern:
//   * Initial load uses /api/profile which already enumerates safe columns,
//     computes effective plan from plan_expires_at, and upgrades hardcoded
//     admins. One source of truth.
//   * On 401 from /api/profile, redirect to /login. On any other failure,
//     fall through to a skeleton built from persisted Zustand so the page
//     is never blank and the user is never forcibly logged out by a
//     transient network blip.
//   * Logout uses the auth store's logout() which is the single
//     authoritative cleanup path.

function ProfileContent() {
  const router   = useRouter();
  const supabase = createClient();
  const { user, setUser, isPro } = useAuthStore();
  const logoutStore = useAuthStore(s => s.logout);
  const { toast } = useUIStore();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [name,       setName]       = useState('');
  // Initial loading state is based on whether Zustand already has the user
  // from the last session. If we do, render the page immediately with the
  // persisted data and refresh in the background — never block first paint
  // on a network round-trip. If we don't, briefly show a skeleton while
  // the load runs.
  const [loading,    setLoading]    = useState(() => !useAuthStore.getState().user);
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [cvUrl,      setCvUrl]      = useState<string | null>(null);
  const [profileCompletion, setProfileCompletion] = useState<number>(20);

  const [cvText, setCvText]       = useState('');
  const [targetRole, setTargetRole] = useState('Remote');
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview]       = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    // HARD failsafe: render after 10s no matter what. If anything inside
    // load() throws or hangs (including the CV signed-URL fetch that has
    // no timeout), this ensures the skeleton clears.
    const failsafe = setTimeout(() => { if (!cancelled) setLoading(false); }, 10000);
    async function load() {
      let profile: any = null;
      let unauthorized = false;
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch('/api/profile', { signal: ctrl.signal });
        clearTimeout(timeout);
        if (res.status === 401) unauthorized = true;
        else if (res.ok) {
          const json = await res.json();
          profile = json.profile ?? null;
        }
      } catch {}
      if (cancelled) return;

      if (unauthorized) {
        router.replace('/login?next=/profile');
        return;
      }

      // Use profile.id / profile.email directly — /api/profile already
      // includes those in SAFE_PROFILE_COLS. Skip supabase.auth.getUser()
      // which can stall indefinitely on throttled functions and leave
      // the page stuck on the loading skeleton (no timeout on that call).
      // Persisted Zustand is the fallback when /api/profile didn't return.
      const persisted = useAuthStore.getState().user;
      const authUser: { id: string; email?: string | null } | null =
        profile
          ? { id: profile.id, email: profile.email }
          : persisted
          ? { id: persisted.id, email: persisted.email }
          : null;

      if (profile && authUser) {
        const role = resolveRole({ profileRole: profile.role, email: authUser.email });
        // Defense in depth: even though /api/profile applies effectivePlan
        // server-side, mirror the persisted-plan guard everywhere so a
        // transient server-side race that returns plan='free' with a
        // future plan_expires_at can't downgrade an already-paid user.
        const plan = resolvePlan({
          role,
          dbPlan: profile.plan,
          planExpiresAt: profile.plan_expires_at,
          currentClientPlan: useAuthStore.getState().user?.plan,
        });
        setUser({
          id: authUser.id,
          email: authUser.email!,
          name: profile.name ?? '',
          plan,
          role,
          joinedAt: profile.created_at,
          profileCompletion: profile.profile_completion ?? 20,
        });
        setName(profile.name ?? '');
        setProfileCompletion(profile.profile_completion ?? 20);

        // Fetch CV signed URL if profile has a cv_url path. /api/cv mints
        // a short-lived signed URL each call so the link in <a href> stays
        // valid for the page's lifetime without exposing the storage path.
        if (profile.cv_url) {
          try {
            const cvRes = await fetch('/api/cv');
            if (cvRes.ok) {
              const { url } = await cvRes.json();
              if (!cancelled) setCvUrl(url ?? null);
            }
          } catch {}
        }
      } else if (authUser && !useAuthStore.getState().user) {
        // /api/profile failed (network) AND there's no persisted user.
        // Render a skeleton from authUser so the page isn't blank.
        // Existing persisted state takes precedence when it exists.
        setUser({
          id: authUser.id,
          email: authUser.email!,
          name: authUser.email!.split('@')[0],
          plan: 'free',
          role: resolveRole({ profileRole: null, email: authUser.email }),
          joinedAt: new Date().toISOString(),
          profileCompletion: 20,
        });
        setName(authUser.email!.split('@')[0]);
      }
    }
    // Wrapped in a try/finally so setLoading(false) ALWAYS fires, even
    // if load() throws unexpectedly (e.g., a sync error from setUser).
    (async () => {
      try { await load(); } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; clearTimeout(failsafe); };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) { toast('Name cannot be empty', 'error'); return; }
    if (trimmed === user.name) { toast('No changes to save', 'info'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({ name: trimmed }).eq('id', user.id);
      if (error) throw new Error(error.message);
      setUser({ ...user, name: trimmed });
      toast('Profile updated', 'success');
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleCvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast('CV exceeds 5MB. Please compress it first.', 'error');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('cv', file);
      const res = await fetch('/api/cv', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Upload failed');
      setCvUrl(data.url);
      setProfileCompletion(prev => Math.max(prev, 80));
      toast('CV uploaded', 'success');
    } catch (err: any) {
      toast(err?.message ?? 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleReview() {
    if (cvText.trim().length < 50) { toast('Paste at least 50 characters of your CV', 'error'); return; }
    setReviewing(true); setReview(null);
    try {
      const r = await fetch('/api/ai/cv-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cv: cvText.trim(), role: targetRole.trim() || 'Remote' }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Review failed');
      setReview(j.review);
    } catch (err: any) {
      toast(err.message ?? 'Review failed', 'error');
    } finally {
      setReviewing(false);
    }
  }

  async function handleLogout() {
    // Single authoritative cleanup path — store.logout() wipes Zustand
    // (rj44-auth) and jobs store (rj44-jobs). We also clear any leftover
    // sb-* / supabase* keys here as belt-and-braces in case Supabase JS
    // didn't clean up (older versions leak across signout).
    logoutStore();
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-') || k.startsWith('supabase')) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
    try { await supabase.auth.signOut(); } catch {}
    window.location.replace('/');
  }

  if (loading) return (
    <div className="max-w-[860px] mx-auto px-5 py-10 animate-pulse space-y-4">
      <div className="skeleton h-8 w-48 rounded" />
      <div className="skeleton h-32 rounded-lg" />
      <div className="skeleton h-48 rounded-lg" />
    </div>
  );
  // Defensive fallback: if `user` is null here we hit a transient auth
  // state that loadSession returned from. Render a clear prompt instead
  // of `return null` (which presented as a blank "profile not loading"
  // page to users).
  if (!user) {
    // Cookie still present → not logged out, just a slow session re-read.
    // Offer Reload instead of the misleading "session expired" prompt.
    const cookiePresent = typeof document !== 'undefined' && documentHasSupabaseAuthCookie();
    if (cookiePresent) return (
      <div className="max-w-[500px] mx-auto px-5 py-20 text-center">
        <div className="inline-block w-8 h-8 border-2 border-brand-500/30 border-t-brand-600 dark:border-t-brand-400 rounded-full animate-spin mb-5" />
        <p className="text-stone-500 dark:text-stone-400 mb-6">Verifying your session… If this doesn’t clear in a moment, reload — or sign in again.</p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 transition-colors">
            Reload
          </button>
          <Link href="/login?next=/profile" className="inline-flex items-center gap-2 px-6 py-3 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 font-bold rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            Sign in again
          </Link>
        </div>
      </div>
    );
    return (
      <div className="max-w-[500px] mx-auto px-5 py-20 text-center">
        <p className="text-stone-500 dark:text-stone-400 mb-6">Your session expired. Please sign in to view your profile.</p>
        <Link href="/login?next=/profile" className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 transition-colors">
          Sign in
        </Link>
      </div>
    );
  }

  const planLabel = user.plan === 'daily' ? 'Day Pass' : user.plan === 'pro' ? 'Pro' : user.plan === 'admin' ? 'Admin' : 'Free';
  const planColor =
    user.plan === 'admin' ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' :
    user.plan === 'pro'   ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'    :
    user.plan === 'daily' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'        :
                            'bg-stone-100 dark:bg-stone-800 text-stone-500';

  return (
    <div className="max-w-[860px] mx-auto px-5 py-8">
      <VerifyEmailBanner />
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">My Profile</h1>
          <p className="text-xs text-stone-400 mt-1">Manage your account, CV, and preferences.</p>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-stone-500 hover:text-red-600 dark:hover:text-red-400 transition-colors">
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>

      {/* Identity card — avatar, plan badge, completion ring */}
      <div className="card p-6 mb-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-2xl font-black text-brand-700 dark:text-brand-400 shrink-0">
            {(user.name?.[0] ?? user.email[0]).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-extrabold text-xl text-stone-900 dark:text-stone-100 truncate">
              {user.name || user.email.split('@')[0]}
            </p>
            <p className="text-sm text-stone-500 dark:text-stone-400 truncate flex items-center gap-1.5 mt-0.5">
              <Mail className="w-3.5 h-3.5" /> {user.email}
            </p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${planColor}`}>
                {user.plan === 'admin' ? <Shield className="w-3 h-3" /> : user.plan === 'free' ? <User className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                {planLabel}
              </span>
              {user.plan === 'free' && (
                <Link href="/pricing" className="text-xs font-bold text-brand-700 dark:text-brand-400 hover:underline">
                  Upgrade from ₦500 →
                </Link>
              )}
              {user.plan !== 'free' && user.plan !== 'admin' && (
                <Link href="/profile/billing" className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-brand-700 dark:hover:text-brand-400 hover:underline">
                  Manage billing →
                </Link>
              )}
            </div>
          </div>
          {/* Completion meter */}
          <div className="w-20 text-center shrink-0">
            <div className="relative inline-block">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3"
                  className="stroke-stone-100 dark:stroke-[#1e3a5f]" />
                <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3"
                  strokeDasharray={`${(profileCompletion / 100) * 94.25} 94.25`}
                  strokeLinecap="round"
                  className="stroke-brand-600 dark:stroke-brand-400 transition-all duration-500" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-stone-700 dark:text-stone-200">
                {profileCompletion}%
              </span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mt-1">Complete</p>
          </div>
        </div>
      </div>

      {/* Personal info */}
      <div className="card p-6 mb-5">
        <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-brand-600" /> Personal info
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="profile-name" className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">Full name</label>
            <input id="profile-name" value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Your name" maxLength={120} />
          </div>
          <div>
            <label htmlFor="profile-email" className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">Email address</label>
            <input id="profile-email" value={user.email} disabled className="input opacity-60 cursor-not-allowed" />
            <p className="text-[11px] text-stone-400 mt-1">Email is managed via Supabase auth. Contact support to change it.</p>
          </div>
          <button type="submit" disabled={saving || !name.trim() || name.trim() === user.name}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors text-sm">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      {/* CV */}
      <div className="card p-6 mb-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-600" /> Your CV / Resume
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">PDF or Word, max 5MB. Used for one-click apply on Pro.</p>
          </div>
          {!isPro() && (
            <Link href="/pricing" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-bold">
              <Zap className="w-3 h-3" /> Pro only
            </Link>
          )}
        </div>

        {cvUrl ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800 mb-3">
            <CheckCircle className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brand-700 dark:text-brand-400">CV uploaded</p>
              <a href={cvUrl} target="_blank" rel="noopener" className="text-xs text-brand-600 dark:text-brand-400 hover:underline truncate block">View your CV →</a>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-stone-50 dark:bg-[#162033] border border-stone-200 dark:border-[#1e3a5f] mb-3">
            <FileText className="w-5 h-5 text-stone-400 shrink-0" />
            <p className="text-sm text-stone-400">No CV uploaded yet</p>
          </div>
        )}

        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleCvUpload} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading || !isPro()}
          className="flex items-center gap-2 px-4 py-2.5 border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-50 transition-colors">
          <Upload className="w-4 h-4" />
          {uploading ? 'Uploading…' : cvUrl ? 'Replace CV' : 'Upload CV'}
        </button>
        {!isPro() && <p className="text-[11px] text-stone-400 mt-2">Upgrade to Pro to enable CV upload and auto-apply.</p>}
      </div>

      {/* AI CV review */}
      <div className="card p-6 mb-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Brain className="w-4 h-4 text-brand-600" /> AI CV Review
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">Paste your CV text below for a scored review with rewrite tips.</p>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-[10px] font-bold uppercase tracking-wider">
            <Sparkles className="w-3 h-3" /> AI
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="profile-target-role" className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">Target role</label>
            <input id="profile-target-role" type="text" value={targetRole} onChange={e => setTargetRole(e.target.value)} className="input text-sm" placeholder="e.g. Senior Backend Engineer" maxLength={100} />
          </div>
          <div>
            <label htmlFor="profile-cv-text" className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">Your CV text</label>
            <textarea id="profile-cv-text" value={cvText} onChange={e => setCvText(e.target.value)} rows={6} maxLength={12000}
              placeholder="Paste your CV / résumé text here (max 12,000 chars)…"
              className="input text-sm font-mono resize-y" />
          </div>
          <button onClick={handleReview} disabled={reviewing || cvText.trim().length < 50}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
            {reviewing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Brain className="w-4 h-4" />}
            {reviewing ? 'Reviewing…' : 'Review my CV'}
          </button>
        </div>

        {review && (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800">
              <div className="text-3xl font-display font-extrabold text-brand-700 dark:text-brand-400">{review.overall_score ?? '–'}</div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Overall score / 100</p>
                <p className="text-sm text-stone-700 dark:text-stone-300 mt-0.5">{review.headline_summary}</p>
              </div>
            </div>
            {Array.isArray(review.strengths) && review.strengths.length > 0 && (
              <ReviewList title="Strengths" icon={<CheckCircle className="w-4 h-4 text-brand-600" />} items={review.strengths} />
            )}
            {Array.isArray(review.gaps) && review.gaps.length > 0 && (
              <ReviewList title="Gaps" icon={<AlertCircle className="w-4 h-4 text-amber-600" />} items={review.gaps} />
            )}
            {Array.isArray(review.ats_keywords_missing) && review.ats_keywords_missing.length > 0 && (
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wider text-stone-500 mb-2">ATS keywords missing</h3>
                <div className="flex flex-wrap gap-1.5">
                  {review.ats_keywords_missing.map((k: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-[#162033] text-stone-600 dark:text-stone-300 text-xs font-medium">{k}</span>
                  ))}
                </div>
              </div>
            )}
            {Array.isArray(review.rewrite_tips) && review.rewrite_tips.length > 0 && (
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wider text-stone-500 mb-2">Rewrite tips</h3>
                <ul className="space-y-2">
                  {review.rewrite_tips.map((t: any, i: number) => (
                    <li key={i} className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed pl-4 relative">
                      <span className="absolute left-0 text-brand-600">·</span>
                      <span className="font-semibold text-brand-700 dark:text-brand-400 uppercase text-[10px] tracking-wider mr-1">{t.section}</span>
                      {t.tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings — quick links to billing / preferences / danger zone */}
      <div className="card p-6">
        <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-4 flex items-center gap-2">
          <Settings className="w-4 h-4 text-brand-600" /> Settings
        </h2>
        <div className="space-y-2">
          <SettingsLink
            href="/profile/billing"
            icon={<CreditCard className="w-4 h-4" />}
            title="Billing & subscription"
            sub="Manage your plan, view receipts, cancel anytime."
          />
          <SettingsLink
            href="/profile/billing#emails"
            icon={<Bell className="w-4 h-4" />}
            title="Email preferences"
            sub="Choose which notifications you receive."
          />
          <SettingsLink
            href="/applications"
            icon={<FileText className="w-4 h-4" />}
            title="My applications"
            sub="Track your applied jobs and statuses."
          />
          <SettingsLink
            href="/profile/billing#danger"
            icon={<Trash2 className="w-4 h-4" />}
            title="Delete account"
            sub="Permanently remove your account and data."
            danger
          />
        </div>
      </div>
    </div>
  );
}

function ReviewList({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <div>
      <h3 className="font-bold text-xs uppercase tracking-wider text-stone-500 mb-2 flex items-center gap-1.5">{icon} {title}</h3>
      <ul className="space-y-1.5">
        {items.map((s, i) => (
          <li key={i} className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed pl-4 relative">
            <span className="absolute left-0 text-brand-600">·</span>{s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsLink({ href, icon, title, sub, danger }: {
  href: string; icon: React.ReactNode; title: string; sub: string; danger?: boolean;
}) {
  return (
    <Link href={href} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
      danger
        ? 'border-red-100 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/10'
        : 'border-stone-100 dark:border-[#1e3a5f] hover:bg-stone-50 dark:hover:bg-[#162033]'
    }`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        danger
          ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
          : 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${danger ? 'text-red-700 dark:text-red-400' : 'text-stone-900 dark:text-stone-100'}`}>{title}</p>
        <p className="text-xs text-stone-400 dark:text-stone-500 truncate">{sub}</p>
      </div>
      <span className={`text-xs ${danger ? 'text-red-400' : 'text-stone-400'}`}>→</span>
    </Link>
  );
}

export default function ProfilePage() {
  return <ProfileContent />;
}
