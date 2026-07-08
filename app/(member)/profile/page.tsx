'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  User, Mail, Save, Zap, Shield, LogOut, Upload, FileText, CheckCircle,
  Brain, Sparkles, AlertCircle, Settings, CreditCard, Bell, Trash2, Moon, Sun, Lock,
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
  // Theme lives here since /settings merged into this page. next-themes is
  // the same mechanism Header/MemberShell use; `mounted` gates the label so
  // the SSR pass (which can't know the stored theme) matches first paint.
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Lazy-init from the persisted user so the name baseline matches on the
  // first painted frame of a warm-cache navigation (Zustand is already
  // rehydrated by AuthSyncProvider). Without this, `name` starts '' while
  // user.name is "John", which briefly reads as an unsaved edit and lights up
  // the "Unsaved changes" hint / AI-card Save button until /api/profile
  // resolves. The async load below still reconciles to the server value.
  const [name,       setName]       = useState(() => useAuthStore.getState().user?.name ?? '');
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
  const [targetRole, setTargetRole] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview]       = useState<any>(null);
  // Last-saved baselines for target role + CV text so we can tell whether the
  // form has unsaved edits (name's baseline is the store's user.name). These
  // used to be write-only React state that was silently dropped on every
  // reload — now they load from and persist to the profile.
  const [savedTargetRole, setSavedTargetRole] = useState('');
  const [savedCvText, setSavedCvText]         = useState('');

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
        // Hydrate the persisted profile-content fields + their baselines so
        // Target Role / Your CV Text survive navigation instead of resetting.
        setTargetRole(profile.target_role ?? '');
        setCvText(profile.cv_text ?? '');
        setSavedTargetRole(profile.target_role ?? '');
        setSavedCvText(profile.cv_text ?? '');

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

  // Single save path for every editable profile field (name + target role +
  // CV text). Goes through PATCH /api/profile because migration_v9 lets the
  // browser-side client write only `name` — target_role + cv_text must be
  // written server-side with the service-role client. Both the "Save changes"
  // button and the AI-review-card "Save" button call this, so the two inputs
  // that previously vanished on reload now actually persist.
  async function saveProfile() {
    if (!user) return;
    const trimmedName = name.trim();
    if (!trimmedName) { toast('Name cannot be empty', 'error'); return; }

    // Send only the fields that actually changed.
    const patch: Record<string, string> = {};
    if (trimmedName !== (user.name ?? '').trim()) patch.name = trimmedName;
    if (targetRole.trim() !== savedTargetRole.trim()) patch.target_role = targetRole.trim();
    if (cvText !== savedCvText) patch.cv_text = cvText;

    if (Object.keys(patch).length === 0) { toast('No changes to save', 'info'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save changes');

      const p = data.profile;
      if (p) {
        // Authoritative sync from the server response (includes the freshly
        // recomputed completion %).
        setUser({
          ...user,
          name: p.name ?? trimmedName,
          profileCompletion: p.profile_completion ?? user.profileCompletion,
        });
        setName(p.name ?? trimmedName);
        setTargetRole(p.target_role ?? '');
        setCvText(p.cv_text ?? '');
        setSavedTargetRole(p.target_role ?? '');
        setSavedCvText(p.cv_text ?? '');
        if (typeof p.profile_completion === 'number') setProfileCompletion(p.profile_completion);
      } else {
        // Defensive: a 200 without a profile body shouldn't happen (the route
        // always returns { profile } on success), but sync optimistically from
        // what we sent rather than leaving the baselines stale.
        setUser({ ...user, name: trimmedName });
        setSavedTargetRole(targetRole.trim());
        setSavedCvText(cvText);
      }
      toast('Profile saved', 'success');
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save changes', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await saveProfile();
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

  // Any editable field diverging from its last-saved baseline. Drives the
  // "unsaved changes" hint and the AI-card Save button's enabled state.
  const dirty =
    name.trim() !== (user.name ?? '').trim() ||
    targetRole.trim() !== savedTargetRole.trim() ||
    cvText !== savedCvText;

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
            <input id="profile-name" value={name} onChange={e => setName(e.target.value)} disabled={saving} className="input disabled:opacity-60" placeholder="Your name" maxLength={120} />
          </div>
          <div>
            <label htmlFor="profile-email" className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">Email address</label>
            <input id="profile-email" value={user.email} disabled className="input opacity-60 cursor-not-allowed" />
            <p className="text-[11px] text-stone-400 mt-1">Email is managed via Supabase auth. Contact support to change it.</p>
          </div>
          {/* Enabled whenever the name is valid and we aren't mid-save — the
              click always produces feedback ("No changes to save" or "Profile
              saved"), so it never reads as an unresponsive button. It also
              saves Target Role + Your CV Text below, which is what users
              expected "Save changes" to do all along. */}
          <div className="flex items-center gap-3 flex-wrap">
            <button type="submit" disabled={saving || !name.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors text-sm">
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {dirty && !saving && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">Unsaved changes</span>
            )}
          </div>
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
        {isPro() ? (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-50 transition-colors">
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading…' : cvUrl ? 'Replace CV' : 'Upload CV'}
          </button>
        ) : (
          // Free tier: instead of a dead, greyed-out button (which read as
          // "there's no way to upload"), show an explicit locked panel that
          // says why the option is disabled and links straight to the upgrade.
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                  {cvUrl ? 'Replacing your CV file is a Pro feature' : 'Uploading a CV file is a Pro feature'}
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                  Upgrade to upload or replace your CV file (PDF/Word) and unlock one-click auto-apply. Your Target Role, CV text, and AI CV Review below stay free.
                </p>
                <Link href="/pricing"
                  className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold rounded-lg transition-colors">
                  <Zap className="w-4 h-4" /> Upgrade from ₦500
                </Link>
              </div>
            </div>
          </div>
        )}
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
            <input id="profile-target-role" type="text" value={targetRole} onChange={e => setTargetRole(e.target.value)} disabled={saving} className="input text-sm disabled:opacity-60" placeholder="e.g. Senior Backend Engineer" maxLength={100} />
          </div>
          <div>
            <label htmlFor="profile-cv-text" className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">Your CV text</label>
            <textarea id="profile-cv-text" value={cvText} onChange={e => setCvText(e.target.value)} disabled={saving} rows={6} maxLength={12000}
              placeholder="Paste your CV / résumé text here (max 12,000 chars)…"
              className="input text-sm font-mono resize-y disabled:opacity-60" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handleReview} disabled={reviewing || cvText.trim().length < 50}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
              {reviewing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Brain className="w-4 h-4" />}
              {reviewing ? 'Reviewing…' : 'Review my CV'}
            </button>
            {/* Persist Target Role + Your CV Text (and any name edit above)
                without needing to scroll back up to "Save changes". */}
            <button type="button" onClick={saveProfile} disabled={saving || !dirty}
              className="flex items-center gap-2 px-4 py-2.5 border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-50 transition-colors">
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <p className="text-[11px] text-stone-400">Your Target Role and CV text are saved to your profile and restored when you return.</p>
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

      {/* Settings — merged from the old /settings page: billing, email
          preferences, applications, theme, support, and the danger zone all
          live here now (the /settings route permanently redirects here). */}
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
          {/* Theme toggle — same next-themes mechanism as the Header. */}
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-stone-100 dark:border-[#1e3a5f] hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 flex items-center justify-center shrink-0">
              {mounted && theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-stone-900 dark:text-stone-100">Theme</p>
              <p className="text-xs text-stone-400 dark:text-stone-500 truncate">
                {mounted ? `Currently ${theme === 'dark' ? 'dark' : 'light'} mode — tap to switch` : 'Switch between light and dark mode'}
              </p>
            </div>
            <span className="text-xs text-stone-400">→</span>
          </button>
          <SettingsLink
            href="mailto:hello@remotejobs44.com"
            icon={<Mail className="w-4 h-4" />}
            title="Contact support"
            sub="hello@remotejobs44.com"
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
  // mailto:/external hrefs get a plain anchor — next/link is for app routes.
  const Tag: any = href.startsWith('/') ? Link : 'a';
  return (
    <Tag href={href} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
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
    </Tag>
  );
}

export default function ProfilePage() {
  return <ProfileContent />;
}
