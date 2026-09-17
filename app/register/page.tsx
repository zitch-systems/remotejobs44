'use client';
// app/register/page.tsx — Supabase email/password registration
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Eye, EyeOff, Mail, Lock, User, Check, Moon, Sun, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUIStore, useAuthStore } from '@/lib/store';
import { resolveRole, destinationForRole } from '@/lib/auth/redirect';
import { passwordChecks, validatePassword, friendlyAuthError } from '@/lib/auth/password';
import { setRememberChoice } from '@/lib/auth/remember';

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
      className="absolute top-5 right-6 z-10 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-2)] bg-[var(--bg-card)] text-[var(--fg-3)] transition-colors hover:text-[var(--brand-600)] dark:hover:text-[var(--brand-400)]"
    >
      {mounted && isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

function StrengthBar({ password }: { password: string }) {
  const checks = passwordChecks(password);
  const score = checks.filter(c => c.pass).length;
  const colors = ['', 'bg-red-400', 'bg-amber-400', 'bg-brand-500'];
  return (
    <div className="mt-2">
      <div className="mb-1.5 flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score] : 'bg-stone-200 dark:bg-stone-700'}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {checks.map(c => (
          <span key={c.label} className={`flex items-center gap-1 text-xs ${c.pass ? 'text-brand-600 dark:text-brand-400' : 'text-stone-400'}`}>
            <Check className="h-3 w-3" />{c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const router   = useRouter();
  const supabase = createClient();
  const { toast } = useUIStore();
  const { setUser } = useAuthStore();

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [agree,    setAgree]    = useState(false);
  const [loading,  setLoading]  = useState(false);
  // Honeypot — invisible to real users (off-screen + aria-hidden + autocomplete=off).
  // Bots that auto-fill every input on the page will fill this; we silently
  // pretend the signup succeeded and never call Supabase. No CAPTCHA needed.
  const [website,  setWebsite]  = useState('');

  // If someone is already logged in and lands on /register, send them home —
  // they don't need to create another account. Same guard as on /login.
  useEffect(() => {
    (async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;
        const role = resolveRole({ profileRole: undefined, email: authUser.email });
        window.location.replace(destinationForRole(role, null));
      } catch {}
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Honeypot trip — pretend success, do nothing. Don't surface an error
    // because that tells the bot to retry without the hidden field.
    if (website) {
      toast('Account created! Check your email to confirm.', 'success', 6000);
      router.push('/login?registered=1');
      return;
    }
    if (!agree) { toast('Please accept the terms to continue', 'error'); return; }
    // Validate and submit the exact same credential on web and mobile.
    const submittedPassword = password;
    // Enforce the full policy the strength meter advertises (length +
    // uppercase + number) here, BEFORE calling Supabase. Previously we only
    // checked length, so an 8-char all-lowercase password passed the client
    // and was rejected by Supabase's stricter server policy — surfacing a
    // raw, cryptic auth error that read as "incorrect password" at signup.
    const passwordError = validatePassword(submittedPassword);
    if (passwordError) { toast(passwordError, 'error'); return; }
    setLoading(true);

    // Registration has no "Remember me" control. Clear a session-only
    // choice left by a previous account before the confirmation round-trip;
    // otherwise AuthSyncProvider would sign this new account out on the next
    // browser restart when the old flag survives in localStorage.
    setRememberChoice(true);

    // try/catch because auth-js THROWS (rather than returning { error })
    // when it can't acquire the cross-tab auth lock within 5s — without
    // the catch, that rejection escaped handleSubmit and left the button
    // stuck on its loading state. Same guard as /login and /reset-password.
    let data: Awaited<ReturnType<typeof supabase.auth.signUp>>['data'];
    let error: Awaited<ReturnType<typeof supabase.auth.signUp>>['error'];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setLoading(false);
      toast('Signup is taking longer than expected. Check your email before trying again.', 'error');
    }, 15_000);
    try {
      ({ data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: submittedPassword,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      }));
      clearTimeout(timer);
      if (timedOut) return;
    } catch (err: any) {
      clearTimeout(timer);
      if (timedOut) return;
      console.error('[register]', err);
      toast(friendlyAuthError(err?.message), 'error');
      setLoading(false);
      return;
    }

    if (error) {
      // Translate Supabase's raw auth strings into friendly, actionable copy
      // (e.g. leaked-password / already-registered / stricter server policy)
      // instead of toasting the developer-facing message verbatim.
      toast(friendlyAuthError(error.message), 'error');
      setLoading(false);
      return;
    }

    // Auto-confirm path: Supabase returns a session immediately. We need to
    // hit /api/profile so the profile row + welcome email get created, then
    // route to /admin or /dashboard based on role.
    if (data.session && data.user) {
      // Clear any leftover persisted store from a different account FIRST,
      // so a slow /api/profile doesn't render the previous user's data.
      try {
        localStorage.removeItem('rj44-auth');
        localStorage.removeItem('rj44-jobs');
      } catch {}

      // /register has no "Remember me" control, so a new account is always a
      // remembered session. Stated explicitly rather than left to default,
      // because a previous user signing in on this browser with the box
      // unticked would otherwise leave a flag behind that signs the NEW
      // account out on the next browser restart.
      setRememberChoice(true);

      // Attribute this signup to a referring agent if they arrived via a
      // referral link. The server reads the httpOnly rj44_ref cookie; we just
      // poke the endpoint. Awaited so it lands before we navigate away.
      try { await fetch('/api/referral/attribute', { method: 'POST', signal: AbortSignal.timeout(8_000) }); } catch {}

      let profile: any = null;
      try {
        const res = await fetch('/api/profile', { signal: AbortSignal.timeout(8_000) });
        if (res.ok) profile = (await res.json())?.profile ?? null;
      } catch {}

      const role = resolveRole({ profileRole: profile?.role, email: data.user.email });

      // For a brand-new signup we always have at least the email + name
      // entered in the form, so it's safe to seed Zustand even if the
      // /api/profile call hasn't finished. New signups are always 'free'
      // unless their email is in the hardcoded admin list.
      setUser({
        id:    data.user.id,
        email: data.user.email!,
        name:  profile?.name ?? name,
        plan:  role === 'admin' ? 'admin' : (profile?.plan ?? 'free'),
        role,
        joinedAt: profile?.created_at ?? new Date().toISOString(),
        profileCompletion: profile?.profile_completion ?? 20,
      });

      toast('Welcome to RemoteJobs44! 🎉', 'success', 4000);
      window.location.replace(destinationForRole(role, null));
      return;
    }

    // Confirmation-required path: Supabase will send its own confirmation link.
    toast('Account created! Check your email to confirm.', 'success', 6000);
    router.push('/login?registered=1');
  }

  async function handleGoogleSignup() {
    setLoading(true);
    // OAuth signup also has no remember control. Record the default before
    // navigating away so a previous user's session-only flag cannot be
    // applied to the new account when the callback returns.
    setRememberChoice(true);
    const fallback = setTimeout(() => setLoading(false), 10000);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
      });
      if (error) throw error;
    } catch (err: any) {
      clearTimeout(fallback);
      setLoading(false);
      toast(err?.message ?? 'Google sign-up failed. Please try again.', 'error');
    }
  }

  return (
    <div className="deep-ocean">
      <div className="grid min-h-[80dvh] grid-cols-1 md:grid-cols-[1.04fr_0.96fr]">

        {/* Brand panel — darker scrim because ig-high-five.jpg is brighter */}
        <aside
          className="relative hidden flex-col overflow-hidden px-[52px] pb-[46px] pt-10 text-white md:flex"
          style={{
            background:
              'radial-gradient(ellipse 74% 50% at 18% 0%, rgba(37,99,235,0.34), transparent 60%),' +
              'radial-gradient(ellipse 60% 60% at 96% 100%, rgba(249,115,22,0.16), transparent 60%),' +
              'linear-gradient(155deg, rgba(8,18,36,0.90) 0%, rgba(8,17,34,0.93) 50%, rgba(6,14,31,0.96) 100%),' +
              'url(/redesign/ig-high-five.jpg) center 22%/cover no-repeat, #060e1f',
          }}
        >
          <div className="relative z-[2]">
            <Link href="/" className="inline-flex items-center gap-2.5 font-display font-bold text-white no-underline">
              <svg viewBox="0 0 32 32" fill="none" className="h-[30px] w-[30px]">
                <defs><linearGradient id="lg-register" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#2563eb"/><stop offset="100%" stopColor="#1e3a5f"/></linearGradient></defs>
                <rect width="32" height="32" rx="8" fill="url(#lg-register)"/>
                <path d="M8 20 Q12 10 16 16 Q20 22 23 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <circle cx="23" cy="12" r="2.5" fill="#f97316"/>
              </svg>
              <span className="text-lg">RemoteJobs<span className="text-[var(--accent-light)]">44</span></span>
            </Link>
          </div>

          <div className="relative z-[2] my-auto max-w-[440px]">
            <span className="eyebrow-pill" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.18)', color: '#dbeafe' }}>
              <span className="dot" />Free to browse — no card needed
            </span>
            <h2 className="mb-3.5 mt-[18px] font-display text-[clamp(2rem,3vw,2.85rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-white">
              Start applying to remote roles today.
            </h2>
            <p className="mb-[26px] text-[17px] leading-[1.55] text-[#aebfd6]">
              Create your free account to save jobs and set up alerts. Choose a paid plan when you’re ready to apply.
            </p>
            <ul className="flex list-none flex-col gap-[13px] p-0">
              {[
                'Browse every role free, forever',
                'Daily alerts for roles that fit you',
                "Pay only when you're ready to apply",
              ].map(point => (
                <li key={point} className="flex items-center gap-3 text-[14.5px] text-[#d7e2f1]">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[rgba(34,197,94,0.18)] text-[#5fd99a]">
                    <Check className="h-[13px] w-[13px]" strokeWidth={3} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex gap-[30px]">
              {[
                { n: 'Daily', l: 'New roles' },
                { n: '150+', l: 'Countries' },
                { n: '5,000+', l: 'Hired' },
              ].map(s => (
                <div key={s.l}>
                  <div className="font-display text-[26px] font-extrabold tracking-[-0.02em] text-white">{s.n}</div>
                  <div className="mt-0.5 text-[12.5px] text-[#9fb2cf]">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Form panel */}
        <main className="relative flex items-center justify-center px-8 py-12">
          <ThemeToggle />

          <div className="w-full max-w-[416px]">
            <h1 className="font-display text-[30px] font-extrabold tracking-[-0.02em] text-[var(--fg-1)]">Create your free account</h1>
            <p className="mb-7 mt-[7px] text-[15px] text-[var(--fg-3)]">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-[var(--brand-700)] no-underline hover:underline dark:text-[var(--brand-400)]">
                Log in
              </Link>
            </p>

            {/* Social sign-up */}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleGoogleSignup}
                disabled={loading}
                className="flex items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-[var(--border-2)] bg-[var(--bg-card)] p-3 font-display text-[14.5px] font-semibold text-[var(--fg-1)] transition-colors hover:border-[var(--brand-400)] hover:bg-[var(--brand-50)] disabled:opacity-50 dark:hover:bg-brand-900/20"
              >
                <svg width="18" height="18" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                  <path d="M47.5 24.6c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.2 7.3-10.5 7.3-17.4z" fill="#4285F4"/>
                  <path d="M24 48c6.5 0 12-2.1 16-5.8l-7.9-6c-2.2 1.5-5 2.3-8.1 2.3-6.2 0-11.5-4.2-13.4-9.9H2.5v6.2C6.5 42.6 14.7 48 24 48z" fill="#34A853"/>
                  <path d="M10.6 28.6A14.8 14.8 0 0 1 9.8 24c0-1.6.3-3.2.8-4.6v-6.2H2.5A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.8l8.1-6.2z" fill="#FBBC05"/>
                  <path d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.8-6.8C35.9 2.3 30.4 0 24 0 14.7 0 6.5 5.4 2.5 13.2l8.1 6.2C12.5 13.7 17.8 9.5 24 9.5z" fill="#EA4335"/>
                </svg>
                Sign up with Google
              </button>
            </div>

            <div className="my-[22px] flex items-center gap-3.5 text-[12.5px] font-semibold tracking-[0.04em] text-[var(--fg-4)] before:h-px before:flex-1 before:bg-[var(--border-3)] after:h-px after:flex-1 after:bg-[var(--border-3)]">
              OR
            </div>

            <form onSubmit={handleSubmit}>
              {/* Honeypot — off-screen, aria-hidden, tabIndex=-1. Real users
                  never see or focus this; auto-fillers and naive crawlers
                  will populate any <input name="website"> they see. */}
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
                <label htmlFor="reg-name" className="mb-[7px] block text-[13px] font-semibold text-[var(--fg-2)]">Full name</label>
                <div className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-[var(--border-2)] bg-[var(--bg-card)] px-3.5 transition-all focus-within:border-[var(--brand-500)] focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]">
                  <User className="h-[18px] w-[18px] shrink-0 text-[var(--fg-4)]" />
                  <input
                    id="reg-name"
                    type="text" required value={name} onChange={e => setName(e.target.value)}
                    placeholder="Ada Okeke" autoComplete="name"
                    className="min-w-0 flex-1 border-none bg-transparent py-[13px] text-[15px] text-[var(--fg-1)] outline-none placeholder:text-[var(--fg-4)]"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="reg-email" className="mb-[7px] block text-[13px] font-semibold text-[var(--fg-2)]">Email</label>
                <div className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-[var(--border-2)] bg-[var(--bg-card)] px-3.5 transition-all focus-within:border-[var(--brand-500)] focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]">
                  <Mail className="h-[18px] w-[18px] shrink-0 text-[var(--fg-4)]" />
                  <input
                    id="reg-email"
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@email.com" autoComplete="email"
                    className="min-w-0 flex-1 border-none bg-transparent py-[13px] text-[15px] text-[var(--fg-1)] outline-none placeholder:text-[var(--fg-4)]"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="reg-password" className="mb-[7px] block text-[13px] font-semibold text-[var(--fg-2)]">Password</label>
                <div className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-[var(--border-2)] bg-[var(--bg-card)] px-3.5 transition-all focus-within:border-[var(--brand-500)] focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]">
                  <Lock className="h-[18px] w-[18px] shrink-0 text-[var(--fg-4)]" />
                  <input
                    id="reg-password"
                    type={showPass ? 'text' : 'password'} required value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters" autoComplete="new-password" minLength={8}
                    className="min-w-0 flex-1 border-none bg-transparent py-[13px] text-[15px] text-[var(--fg-1)] outline-none placeholder:text-[var(--fg-4)]"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center p-1 text-[var(--fg-4)] hover:text-[var(--fg-2)]"
                    aria-label={showPass ? 'Hide password' : 'Show password'}>
                    {showPass ? <EyeOff className="h-[17px] w-[17px]" /> : <Eye className="h-[17px] w-[17px]" />}
                  </button>
                </div>
                {password
                  ? <StrengthBar password={password} />
                  : <p className="mt-[7px] text-xs text-[var(--fg-4)]">Use 8+ characters with an uppercase letter and a number.</p>}
              </div>

              <div className="my-1 mb-[22px] flex items-start gap-2.5 text-[13px]">
                <label className="inline-flex cursor-pointer items-start gap-2.5 leading-[1.45] text-[var(--fg-2)]">
                  <input
                    type="checkbox" required checked={agree} onChange={e => setAgree(e.target.checked)}
                    className="mt-[1px] h-[18px] w-[18px] shrink-0 rounded-md border-[1.5px] border-[var(--border-2)] text-[var(--brand-600)] focus:ring-[var(--brand-600)]"
                  />
                  <span>
                    I agree to the{' '}
                    <Link href="/terms" className="font-semibold text-[var(--brand-700)] no-underline hover:underline dark:text-[var(--brand-400)]">Terms</Link>
                    {' '}and{' '}
                    <Link href="/privacy" className="font-semibold text-[var(--brand-700)] no-underline hover:underline dark:text-[var(--brand-400)]">Privacy Policy</Link>.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading || !name || !email || !password || !agree}
                className="btn btn-primary btn-lg w-full justify-center disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Creating account…
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowRight className="h-[17px] w-[17px]" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-[18px] text-center text-[12.5px] leading-relaxed text-[var(--fg-4)]">
              Browse free. Upgrade only when you&apos;re ready to apply.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
