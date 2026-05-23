'use client';
import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, LogIn, AlertCircle, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/store';
import { isHardcodedAdmin } from '@/lib/admin-emails';

function LoginForm() {
  const searchParams = useSearchParams();
  const { setUser }  = useAuthStore();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success,  setSuccess]  = useState(false);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) setErrorMsg(decodeURIComponent(err).replace(/_/g, ' '));
    if (searchParams.get('registered') === '1') {
      setSuccess(true);
      setErrorMsg('');
    }
    // Pre-fill email if passed (e.g. from "already registered" redirect)
    const emailParam = searchParams.get('email');
    if (emailParam) setEmail(decodeURIComponent(emailParam));
  }, []);

  async function handleGoogleLogin() {
    setLoading(true);
    setErrorMsg('');
    // Safety: reset loading if OAuth redirect doesn't happen within 10s
    const fallback = setTimeout(() => setLoading(false), 10000);
    try {
      const supabase = createClient();
      const next = searchParams.get('next') ?? '/dashboard';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${next}` },
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

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      // Auth call returned — clear the timer regardless of outcome
      clearTimeout(timer);
      if (timedOut) return; // user already saw the timeout message; bail out

      if (error) {
        setLoading(false);
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setErrorMsg('Please confirm your email first — check your inbox.');
        } else if (
          error.message.toLowerCase().includes('invalid') ||
          error.message.toLowerCase().includes('credentials') ||
          error.message.toLowerCase().includes('password')
        ) {
          setErrorMsg('Wrong email or password. Please try again.');
        } else {
          setErrorMsg(error.message);
        }
        return;
      }

      if (!data?.user) {
        setLoading(false);
        setErrorMsg('Login failed. Please try again.');
        return;
      }

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

      const resolvedRole = (profile?.role === 'admin' || isHardcodedAdmin(data.user.email)) ? 'admin' : 'user';
      const resolvedPlan = resolvedRole === 'admin' ? 'admin' : (profile?.plan ?? 'free');

      setUser({
        id:    data.user.id,
        email: data.user.email!,
        name:  profile?.name ?? data.user.email!.split('@')[0],
        plan:  resolvedPlan,
        role:  resolvedRole,
        joinedAt: profile?.created_at ?? new Date().toISOString(),
        profileCompletion: profile?.profile_completion ?? 20,
      });

      const next = searchParams.get('next') ?? (resolvedRole === 'admin' ? '/admin' : '/dashboard');
      window.location.replace(next);

    } catch (err: any) {
      clearTimeout(timer);
      if (timedOut) return;
      setLoading(false);
      setErrorMsg(err?.message ?? 'An error occurred. Please try again.');
    }
  }

  return (
    <div className="card p-6 shadow-md">
      {success && (
        <div className="flex items-start gap-3 p-3 mb-4 rounded-lg bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800">
          <CheckCircle className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-brand-700 dark:text-brand-400">Account created!</p>
            <p className="text-xs text-brand-600 dark:text-brand-500 mt-0.5">
              Check your email for a confirmation link, then sign in below.
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-3 p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{errorMsg}</p>
        </div>
      )}

      {/* Google OAuth */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 py-3 mb-4 border border-slate-200 dark:border-[#1e3a5f] rounded-lg bg-white dark:bg-[#0d1a2e] hover:bg-slate-50 dark:hover:bg-[#162033] text-slate-800 dark:text-slate-100 text-sm font-semibold transition-all disabled:opacity-50"
      >
        <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
          <path d="M47.5 24.6c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.2 7.3-10.5 7.3-17.4z" fill="#4285F4"/>
          <path d="M24 48c6.5 0 12-2.1 16-5.8l-7.9-6c-2.2 1.5-5 2.3-8.1 2.3-6.2 0-11.5-4.2-13.4-9.9H2.5v6.2C6.5 42.6 14.7 48 24 48z" fill="#34A853"/>
          <path d="M10.6 28.6A14.8 14.8 0 0 1 9.8 24c0-1.6.3-3.2.8-4.6v-6.2H2.5A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.8l8.1-6.2z" fill="#FBBC05"/>
          <path d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.8-6.8C35.9 2.3 30.4 0 24 0 14.7 0 6.5 5.4 2.5 13.2l8.1 6.2C12.5 13.7 17.8 9.5 24 9.5z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 mb-4">
        <hr className="flex-1 border-slate-200 dark:border-[#1e3a5f]" />
        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">or</span>
        <hr className="flex-1 border-slate-200 dark:border-[#1e3a5f]" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Email address
          </label>
          <input
            id="login-email"
            type="email" required autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={loading}
            className="input"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="login-password" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Password
            </label>
            <Link href="/forgot-password"
              className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPass ? 'text' : 'password'} required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              className="input pr-10"
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label={showPass ? 'Hide password' : 'Show password'}>
              {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="w-full flex items-center justify-center gap-2 py-3 bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-all shadow-sm"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              <LogIn className="w-5 h-5" />
              Sign In
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 font-display font-bold text-xl text-slate-900 dark:text-slate-100">
            <svg viewBox="0 0 32 32" className="w-8 h-8 text-brand-600" fill="none">
              <circle cx="16" cy="16" r="14" fill="currentColor" opacity="0.12"/>
              <path d="M8 20 Q12 10 16 16 Q20 22 24 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="24" cy="12" r="3" fill="currentColor"/>
            </svg>
            RemoteJobs44
          </Link>
          <h1 className="font-display font-extrabold text-2xl text-slate-900 dark:text-slate-100 mt-6 mb-1">
            Welcome back
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Sign in to continue your job search.</p>
        </div>

        <Suspense fallback={<div className="card p-6 shadow-md animate-pulse"><div className="skeleton h-10 w-full rounded mb-4" /><div className="skeleton h-10 w-full rounded mb-4" /><div className="skeleton h-10 w-full rounded" /></div>}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-5">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-brand-600 dark:text-brand-400 font-semibold hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  );
}
