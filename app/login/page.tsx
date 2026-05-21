'use client';
import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, LogIn, AlertCircle, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/store';

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
  }, []);

  async function handleGoogleLogin() {
    setLoading(true);
    setErrorMsg('');
    try {
      const supabase = createClient();
      const next = searchParams.get('next') ?? '/dashboard';
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${next}` },
      });
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err?.message ?? 'Google sign-in failed. Please try again.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccess(false);

    try {
      const supabase = createClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setLoading(false);
        if (error.message.toLowerCase().includes('invalid') || error.message.toLowerCase().includes('credentials')) {
          setErrorMsg('Wrong email or password. If you just registered, confirm your email first.');
        } else if (error.message.toLowerCase().includes('confirm')) {
          setErrorMsg('Please check your inbox and click the confirmation link before logging in.');
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

      // Fetch profile silently
      let profile: any = null;
      try {
        const supabase2 = createClient();
        const { data: p } = await supabase2
          .from('profiles')
          .select('name,plan,role,created_at,profile_completion')
          .eq('id', data.user.id)
          .maybeSingle();
        profile = p;
      } catch {}

      // Store user in Zustand
      setUser({
        id:    data.user.id,
        email: data.user.email!,
        name:  profile?.name ?? data.user.email!.split('@')[0],
        plan:  profile?.plan ?? 'free',
        role:  profile?.role ?? 'user',
        joinedAt: profile?.created_at ?? new Date().toISOString(),
        profileCompletion: profile?.profile_completion ?? 20,
      });

      // Hard redirect — clears all React state, guarantees fresh load
      const next = searchParams.get('next') ?? '/dashboard';
      window.location.replace(next);

    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err?.message ?? 'An error occurred. Please try again.');
    }
  }

  return (
    <div className="card p-6">
      {/* Success banner */}
      {success && (
        <div className="flex items-start gap-3 p-3 mb-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <p className="text-sm text-green-700 dark:text-green-400">
            Account created! You can now log in.
          </p>
        </div>
      )}

      {/* Error banner */}
      {errorMsg && (
        <div className="flex items-start gap-3 p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{errorMsg}</p>
        </div>
      )}

      {/* Google OAuth */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 py-3 mb-4 border border-stone-200 dark:border-[#234533] rounded-lg bg-white dark:bg-[#152B20] hover:bg-stone-50 dark:hover:bg-[#1C3829] text-stone-800 dark:text-stone-100 text-sm font-semibold transition-all disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
          <path d="M47.5 24.6c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.2 7.3-10.5 7.3-17.4z" fill="#4285F4"/>
          <path d="M24 48c6.5 0 12-2.1 16-5.8l-7.9-6c-2.2 1.5-5 2.3-8.1 2.3-6.2 0-11.5-4.2-13.4-9.9H2.5v6.2C6.5 42.6 14.7 48 24 48z" fill="#34A853"/>
          <path d="M10.6 28.6A14.8 14.8 0 0 1 9.8 24c0-1.6.3-3.2.8-4.6v-6.2H2.5A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.8l8.1-6.2z" fill="#FBBC05"/>
          <path d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.8-6.8C35.9 2.3 30.4 0 24 0 14.7 0 6.5 5.4 2.5 13.2l8.1 6.2C12.5 13.7 17.8 9.5 24 9.5z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 mb-4">
        <hr className="flex-1 border-stone-200 dark:border-[#234533]" />
        <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">or</span>
        <hr className="flex-1 border-stone-200 dark:border-[#234533]" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
            Email address
          </label>
          <input
            type="email" required autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={loading}
            className="input"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-stone-700 dark:text-stone-300">
              Password
            </label>
            <Link href="/forgot-password"
              className="text-xs text-brand-700 dark:text-brand-400 hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'} required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              className="input pr-10"
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              aria-label={showPass ? 'Hide password' : 'Show password'}>
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="w-full flex items-center justify-center gap-2 py-3 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-all"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              Sign In
            </>
          )}
        </button>
      </form>

      <div className="mt-4 p-3 rounded-lg bg-stone-50 dark:bg-[#0f2820] border border-stone-100 dark:border-[#1a3d2e] text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
        <strong>Can't log in?</strong> Go to Supabase Dashboard → Authentication →
        Providers → Email → turn off <em>Confirm email</em> for instant access.
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 font-display font-bold text-xl text-stone-900 dark:text-stone-100">
            <svg viewBox="0 0 32 32" className="w-9 h-9" fill="none">
              <rect width="32" height="32" rx="8" fill="#0d7a5f"/>
              <path d="M8 20 Q12 10 16 16 Q20 22 23 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="23" cy="12" r="2.5" fill="#f59e0b"/>
            </svg>
            RemoteJobs44
          </Link>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 mt-6 mb-1">
            Welcome back
          </h1>
          <p className="text-sm text-stone-400 dark:text-stone-500">
            Sign in to continue your remote job search
          </p>
        </div>

        <Suspense fallback={
          <div className="card p-6 animate-pulse space-y-4">
            <div className="skeleton h-10 rounded-lg" />
            <div className="skeleton h-10 rounded-lg" />
            <div className="skeleton h-12 rounded-lg" />
          </div>
        }>
          <LoginForm />
        </Suspense>

        <p className="text-center text-sm text-stone-400 dark:text-stone-500 mt-5">
          Don't have an account?{' '}
          <Link href="/register"
            className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">
            Create free account
          </Link>
        </p>
      </div>
    </div>
  );
}
