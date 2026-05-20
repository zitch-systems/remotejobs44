'use client';
import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { createClient }  from '@/lib/supabase/client';
import { useAuthStore, useUIStore } from '@/lib/store';

// Inner component uses useSearchParams — must be inside <Suspense>
function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();
  const { setUser }  = useAuthStore();
  const { toast }    = useUIStore();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) toast(decodeURIComponent(err).replace(/_/g, ' '), 'error');
    if (searchParams.get('registered') === '1')
      toast('Account created! Check your email to confirm.', 'success', 6000);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast(error.message, 'error');
      setLoading(false);
      return;
    }

    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', data.user.id).single();

      setUser({
        id:    data.user.id,
        email: data.user.email!,
        name:  profile?.name ?? data.user.email!.split('@')[0],
        plan:  profile?.plan ?? 'free',
        role:  profile?.role ?? 'user',
        joinedAt: profile?.created_at ?? new Date().toISOString(),
        profileCompletion: profile?.profile_completion ?? 20,
      });

      toast('Welcome back! 👋', 'success');
      router.push(searchParams.get('next') ?? '/dashboard');
    }
  }

  return (
    <div className="card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
            Email address
          </label>
          <input
            type="email" required value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" className="input"
            autoComplete="email"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-stone-700 dark:text-stone-300">Password</label>
            <Link href="/forgot-password" className="text-xs text-brand-700 dark:text-brand-400 hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'} required value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" className="input pr-10"
              autoComplete="current-password"
            />
            <button
              type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit" disabled={loading || !email || !password}
          className="w-full flex items-center justify-center gap-2 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 disabled:opacity-60 transition-colors"
        >
          {loading
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <LogIn className="w-4 h-4" />}
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

// Outer page wraps the form in Suspense — required for useSearchParams in Next.js 14
export default function LoginPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 font-display font-bold text-xl text-stone-900 dark:text-stone-100">
            <svg viewBox="0 0 32 32" className="w-8 h-8 text-brand-700 dark:text-brand-400" fill="none">
              <circle cx="16" cy="16" r="14" fill="currentColor" opacity="0.12"/>
              <path d="M8 20 Q12 10 16 16 Q20 22 24 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="24" cy="12" r="3" fill="currentColor"/>
            </svg>
            RemoteJobs44
          </Link>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 mt-6 mb-1">
            Welcome back
          </h1>
          <p className="text-sm text-stone-400 dark:text-stone-500">Sign in to continue your remote job search</p>
        </div>

        <Suspense fallback={
          <div className="card p-6 space-y-4 animate-pulse">
            <div className="skeleton h-10 rounded-md" />
            <div className="skeleton h-10 rounded-md" />
            <div className="skeleton h-12 rounded-lg" />
          </div>
        }>
          <LoginForm />
        </Suspense>

        <p className="text-center text-sm text-stone-400 dark:text-stone-500 mt-5">
          Don't have an account?{' '}
          <Link href="/register" className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">
            Create free account
          </Link>
        </p>
      </div>
    </div>
  );
}
