'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Eye, EyeOff, Mail, Lock, Check, Moon, Sun, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/store';
import { resolveRole, destinationForRole } from '@/lib/auth/redirect';
import { resolvePlan } from '@/lib/auth/plan';
import { describeAuthCallbackError } from '@/lib/auth/callback-error';
import { setRememberChoice } from '@/lib/auth/remember';
import { ResendVerificationLink } from '@/components/auth/ResendVerificationLink';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Toggle dark mode"
      aria-pressed={mounted ? isDark : undefined}
      className="absolute top-5 right-6 z-10 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-2)] bg-[var(--bg-card)] text-[var(--fg-3)] transition-colors hover:text-[var(--brand-600)] dark:hover:text-[var(--brand-400)]"
    >
      {mounted && isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const { setUser }  = useAuthStore();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading,  setLoading]  = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success,  setSuccess]  = useState(false);
  // Honeypot. Same off-screen pattern as /register + /contact +
  // /forgot-password. Bots that auto-fill every input populate this;
  // real users never see or focus it. On trip we pretend the sign-in
  // succeeded (set the success spinner) but never call Supabase, so
  // the bot doesn't learn the field exists and doesn't get a session.
  const [website, setWebsite] = useState('');

  useEffect(() => {
    // Turn the opaque `?error=…&reason=…` the callback attaches into an
    // actionable message. `reason` carries the real cause (expired link,
    // missing PKCE verifier, no code, provider denial); the old code showed
    // only "auth callback failed" and dropped it entirely.
    const err = searchParams.get('error');
    if (err) {
      const reason = searchParams.get('reason');
      setErrorMsg(
        describeAuthCallbackError(err, reason) ?? decodeURIComponent(err).replace(/_/g, ' '),
      );
    }
    if (searchParams.get('registered') === '1') {
      setSuccess(true);
      setErrorMsg('');
    }
    // Pre-fill email if passed (e.g. from "already registered" redirect).
    // decodeURIComponent throws on malformed % sequences ("foo%" etc.) —
    // wrap so a bad email param doesn't kill the entire useEffect (which
    // would also block the already-logged-in redirect just below).
    const emailParam = searchParams.get('email');
    if (emailParam) {
      try { setEmail(decodeURIComponent(emailParam)); }
      catch { setEmail(emailParam); }
    }

    // If someone is already logged in and lands on /login, send them straight
    // to their home. Without this, signing in as a different account briefly
    // shows the previous user's persisted state in the Header — confusing
    // and also a UX nuisance. We verify against the live Supabase session
    // (not just persisted Zustand) so a stale localStorage doesn't trick us
    // into redirecting a logged-out user.
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;
        const role = resolveRole({ profileRole: undefined, email: authUser.email });
        const next = searchParams.get('next');
        window.location.replace(destinationForRole(role, next));
      } catch {}
    })();
  }, []);

  async function handleGoogleLogin() {
    setLoading(true);
    setErrorMsg('');
    // Safety: reset loading if OAuth redirect doesn't happen within 10s
    const fallback = setTimeout(() => setLoading(false), 10000);
    // Record the choice before we navigate away — the OAuth round-trip lands
    // back on /auth/callback, not here, so this is the last chance to read it.
    setRememberChoice(remember);
    try {
      const supabase = createClient();
      const next = searchParams.get('next') ?? '/dashboard';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) throw error;
    } catch (err: any) {
      clearTimeout(fallback);
      setLoading(false);
      setErrorMsg(err?.message ?? 'Google sign-in failed. Please try again.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Honeypot trip — pretend the sign-in is in flight then settle on
    // a generic "Invalid email or password" error after a short
    // delay. Don't redirect, don't call Supabase. The bot sees the
    // exact same shape as a wrong-password attempt.
    if (website) {
      setLoading(true);
      setErrorMsg('');
      setTimeout(() => {
        setLoading(false);
        setErrorMsg('Invalid email or password. Please try again.');
      }, 800);
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccess(false);

    // 15s timer ONLY covers the auth call — profile fetch is best-effort with its own timeout
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setLoading(false);
      setErrorMsg('Request timed out. Check your connection and try again.');
    }, 15000);

    try {
      const supabase = createClient();

      // Trim whitespace from password too — users on mobile often double-tap
      // a space after autocomplete, and that one trailing char fails the auth
      // with "invalid_credentials" while looking identical to the user.
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      // Auth call returned — clear the timer regardless of outcome
      clearTimeout(timer);
      if (timedOut) return; // user already saw the timeout message; bail out

      if (error) {
        setLoading(false);
        // SECURITY: collapse all auth failures to a single generic
        // message. The previous branches distinguished "email not
        // confirmed" (proves the email exists) from "wrong password"
        // (also proves the email exists), making account enumeration
        // trivial via the response text. Email-not-confirmed users
        // already get the bounce-back from Supabase's own confirmation
        // email; they don't need a distinct UX here.
        const msg = error.message.toLowerCase();
        const isCredOrConfirm =
          msg.includes('invalid') ||
          msg.includes('credentials') ||
          msg.includes('password') ||
          msg.includes('not confirmed') ||
          msg.includes('not found');
        // Generic, enumeration-safe nudge: accounts created via Google have no
        // password, so a password attempt always fails here. Pointing every
        // failed attempt at "Continue with Google" reveals nothing about which
        // emails exist, but rescues OAuth users who don't realise they never
        // set a password.
        setErrorMsg(isCredOrConfirm
          ? 'Invalid email or password. If you signed up with Google, use “Continue with Google” above.'
          : 'Sign-in failed. Please try again.');
        return;
      }

      if (!data?.user) {
        setLoading(false);
        setErrorMsg('Login failed. Please try again.');
        return;
      }

      // Wipe persisted client store from any previous user before writing the
      // new one, so stale role/plan from a different account can't leak through.
      try {
        localStorage.removeItem('rj44-auth');
        localStorage.removeItem('rj44-jobs');
      } catch {}

      // Honour the "Remember me" checkbox. Until now it was wired to state and
      // read by nothing — unticking it did not stop the session persisting
      // across browser restarts, which is precisely what it promises on a
      // shared machine. AuthSyncProvider ends the session on the next cold
      // start when this records an unticked box. See lib/auth/remember.ts.
      setRememberChoice(remember);

      // Best-effort profile fetch — never blocks login on failure
      let profile: any = null;
      try {
        const ctrl = new AbortController();
        const abortTimer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch('/api/profile', { signal: ctrl.signal });
        clearTimeout(abortTimer);
        if (res.ok) {
          const json = await res.json();
          if (json?.profile) profile = json.profile;
        }
      } catch {}

      // Hardcoded-admin email check works without a profile fetch and is
      // sufficient for routing to /admin vs /dashboard.
      const resolvedRole = resolveRole({ profileRole: profile?.role, email: data.user.email });

      if (profile) {
        const plan = resolvePlan({
          role: resolvedRole,
          dbPlan: profile.plan,
          planExpiresAt: profile.plan_expires_at,
          currentClientPlan: typeof window !== 'undefined' ? useAuthStore.getState().user?.plan : null,
        });
        setUser({
          id:    data.user.id,
          email: data.user.email!,
          name:  profile.name ?? data.user.email!.split('@')[0],
          plan,
          role:  resolvedRole,
          joinedAt: profile.created_at ?? new Date().toISOString(),
          profileCompletion: profile.profile_completion ?? 20,
        });
      }
      // No profile (timeout / RLS hiccup / cold start): DON'T write a
      // half-complete user object with plan='free'. That's how paying
      // users briefly appeared unsubscribed. The dashboard / admin
      // layout will fetch a fresh profile on mount and call setUser
      // there with the correct plan.

      const dest = destinationForRole(resolvedRole, searchParams.get('next'));
      window.location.replace(dest);

    } catch (err: any) {
      clearTimeout(timer);
      if (timedOut) return;
      setLoading(false);
      setErrorMsg(err?.message ?? 'An error occurred. Please try again.');
    }
  }

  return (
    <div className="w-full max-w-[416px]">
      <h1 className="font-display text-[30px] font-extrabold tracking-[-0.02em] text-[var(--fg-1)]">Welcome back</h1>
      <p className="mb-7 mt-[7px] text-[15px] text-[var(--fg-3)]">
        New to RemoteJobs44?{' '}
        <Link href="/register" className="font-semibold text-[var(--brand-700)] no-underline hover:underline dark:text-[var(--brand-400)]">
          Create a free account
        </Link>
      </p>

      {success && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3 dark:border-brand-800 dark:bg-brand-900/20">
          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
          <div>
            <p className="text-sm font-semibold text-brand-700 dark:text-brand-400">Account created!</p>
            <p className="mt-0.5 text-xs text-brand-600 dark:text-brand-500">
              Check your email for a confirmation link, then sign in below.
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm text-red-700 dark:text-red-400">{errorMsg}</p>
        </div>
      )}

      {/* Social sign-in */}
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="flex items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-[var(--border-2)] bg-[var(--bg-card)] p-3 font-display text-[14.5px] font-semibold text-[var(--fg-1)] transition-colors hover:border-[var(--brand-400)] hover:bg-[var(--brand-50)] disabled:opacity-50 dark:hover:bg-brand-900/20"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <path d="M47.5 24.6c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.2 7.3-10.5 7.3-17.4z" fill="#4285F4"/>
            <path d="M24 48c6.5 0 12-2.1 16-5.8l-7.9-6c-2.2 1.5-5 2.3-8.1 2.3-6.2 0-11.5-4.2-13.4-9.9H2.5v6.2C6.5 42.6 14.7 48 24 48z" fill="#34A853"/>
            <path d="M10.6 28.6A14.8 14.8 0 0 1 9.8 24c0-1.6.3-3.2.8-4.6v-6.2H2.5A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.8l8.1-6.2z" fill="#FBBC05"/>
            <path d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.8-6.8C35.9 2.3 30.4 0 24 0 14.7 0 6.5 5.4 2.5 13.2l8.1 6.2C12.5 13.7 17.8 9.5 24 9.5z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
      </div>

      <div className="my-[22px] flex items-center gap-3.5 text-[12.5px] font-semibold tracking-[0.04em] text-[var(--fg-4)] before:h-px before:flex-1 before:bg-[var(--border-3)] after:h-px after:flex-1 after:bg-[var(--border-3)]">
        OR
      </div>

      <form onSubmit={handleSubmit}>
        {/* Honeypot — off-screen, aria-hidden, tabIndex=-1. Real users
            never see or focus this; auto-fillers populate it. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
          <label>Website (leave blank)
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={e => setWebsite(e.target.value)}
            />
          </label>
        </div>

        <div className="mb-4">
          <label htmlFor="login-email" className="mb-[7px] block text-[13px] font-semibold text-[var(--fg-2)]">Email</label>
          <div className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-[var(--border-2)] bg-[var(--bg-card)] px-3.5 transition-all focus-within:border-[var(--brand-500)] focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]">
            <Mail className="h-[18px] w-[18px] shrink-0 text-[var(--fg-4)]" />
            <input
              id="login-email"
              type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              disabled={loading}
              className="min-w-0 flex-1 border-none bg-transparent py-[13px] text-[15px] text-[var(--fg-1)] outline-none placeholder:text-[var(--fg-4)]"
            />
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="login-password" className="mb-[7px] block text-[13px] font-semibold text-[var(--fg-2)]">Password</label>
          <div className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-[var(--border-2)] bg-[var(--bg-card)] px-3.5 transition-all focus-within:border-[var(--brand-500)] focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]">
            <Lock className="h-[18px] w-[18px] shrink-0 text-[var(--fg-4)]" />
            <input
              id="login-password"
              type={showPass ? 'text' : 'password'} required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              className="min-w-0 flex-1 border-none bg-transparent py-[13px] text-[15px] text-[var(--fg-1)] outline-none placeholder:text-[var(--fg-4)]"
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="inline-flex p-1 text-[var(--fg-4)] hover:text-[var(--fg-2)]"
              aria-label={showPass ? 'Hide password' : 'Show password'}>
              {showPass ? <EyeOff className="h-[17px] w-[17px]" /> : <Eye className="h-[17px] w-[17px]" />}
            </button>
          </div>
        </div>

        <div className="mb-[22px] mt-0.5 flex items-center justify-between text-[13.5px]">
          <label className="inline-flex cursor-pointer select-none items-center gap-2.5 text-[var(--fg-2)]">
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              className="h-[18px] w-[18px] rounded-md border-[1.5px] border-[var(--border-2)] text-[var(--brand-600)] focus:ring-[var(--brand-600)]"
            />
            Remember me
          </label>
          <Link href="/forgot-password" className="font-semibold text-[var(--brand-700)] no-underline hover:underline dark:text-[var(--brand-400)]">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="btn btn-primary btn-lg w-full justify-center disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Signing in…
            </>
          ) : (
            <>
              Log in
              <ArrowRight className="h-[17px] w-[17px]" />
            </>
          )}
        </button>
      </form>

      <p className="mt-[18px] text-center text-[12.5px] leading-relaxed text-[var(--fg-4)]">
        By continuing you agree to our{' '}
        <Link href="/terms" className="text-[var(--fg-3)] underline">Terms</Link>
        {' '}&amp;{' '}
        <Link href="/privacy" className="text-[var(--fg-3)] underline">Privacy Policy</Link>.
      </p>

      <div className="mt-4 text-center">
        <ResendVerificationLink />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="deep-ocean">
      <div className="grid min-h-[80dvh] grid-cols-1 md:grid-cols-[1.04fr_0.96fr]">

        {/* Brand panel — dark ocean over photo */}
        <aside
          className="relative hidden flex-col overflow-hidden px-[52px] pb-[46px] pt-10 text-white md:flex"
          style={{
            background:
              'radial-gradient(ellipse 74% 50% at 18% 0%, rgba(37,99,235,0.34), transparent 60%),' +
              'radial-gradient(ellipse 60% 60% at 96% 100%, rgba(249,115,22,0.16), transparent 60%),' +
              'linear-gradient(155deg, rgba(8,18,36,0.82) 0%, rgba(8,17,34,0.88) 50%, rgba(6,14,31,0.93) 100%),' +
              'url(/redesign/hero-videocall-sm.jpg) center 24%/cover no-repeat, #060e1f',
          }}
        >
          <div className="relative z-[2]">
            <Link href="/" className="inline-flex items-center gap-2.5 font-display font-bold text-white no-underline">
              <svg viewBox="0 0 32 32" fill="none" className="h-[30px] w-[30px]">
                <defs><linearGradient id="lg-login" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#2563eb"/><stop offset="100%" stopColor="#1e3a5f"/></linearGradient></defs>
                <rect width="32" height="32" rx="8" fill="url(#lg-login)"/>
                <path d="M8 20 Q12 10 16 16 Q20 22 23 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <circle cx="23" cy="12" r="2.5" fill="#f97316"/>
              </svg>
              <span className="text-lg">RemoteJobs<span className="text-[var(--accent-light)]">44</span></span>
            </Link>
          </div>

          <div className="relative z-[2] my-auto max-w-[440px]">
            <span className="eyebrow-pill" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.18)', color: '#dbeafe' }}>
              <span className="dot" />70,000+ live remote roles
            </span>
            <h2 className="mb-3.5 mt-[18px] font-display text-[clamp(2rem,3vw,2.85rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-white">
              Your next remote role is already posted.
            </h2>
            <p className="mb-[26px] text-[17px] leading-[1.55] text-[#aebfd6]">
              Pick up where you left off — saved searches, tracked applications, and one-click apply, all in one place.
            </p>
            <ul className="flex list-none flex-col gap-[13px] p-0">
              {[
                'Every listing verified genuinely remote',
                'Salary shown upfront, in USD',
                'Track every application to offer',
              ].map(point => (
                <li key={point} className="flex items-center gap-3 text-[14.5px] text-[#d7e2f1]">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[rgba(34,197,94,0.18)] text-[#5fd99a]">
                    <Check className="h-[13px] w-[13px]" strokeWidth={3} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-[2] mt-[34px] flex items-center gap-3.5 rounded-2xl border border-white/[0.12] bg-white/[0.06] p-4">
            <Image src="/redesign/people-4-portrait.jpg" alt="Adaeze O." width={46} height={46} sizes="46px" className="h-[46px] w-[46px] shrink-0 rounded-full object-cover" />
            <div>
              <div className="text-[13.5px] leading-[1.5] text-[#eaf0f9]">&ldquo;Two interviews in my first week — I&apos;d never seen so many genuinely remote roles in one place.&rdquo;</div>
              <div className="mt-[3px] text-[12.5px] text-[#9fb2cf]">Adaeze O. · Frontend Engineer → Vercel</div>
            </div>
          </div>
        </aside>

        {/* Form panel */}
        <main className="relative flex items-center justify-center px-8 py-12">
          <ThemeToggle />
          <Suspense fallback={
            <div className="w-full max-w-[416px] animate-pulse">
              <div className="skeleton mb-4 h-10 w-full rounded" />
              <div className="skeleton mb-4 h-10 w-full rounded" />
              <div className="skeleton h-10 w-full rounded" />
            </div>
          }>
            <LoginForm />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
