'use client';
// app/register/page.tsx — Supabase email/password registration
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, UserPlus, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUIStore } from '@/lib/store';

function StrengthBar({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', pass: password.length >= 8 },
    { label: 'Uppercase',     pass: /[A-Z]/.test(password) },
    { label: 'Number',        pass: /\d/.test(password) },
  ];
  const score = checks.filter(c => c.pass).length;
  const colors = ['', 'bg-red-400', 'bg-amber-400', 'bg-brand-500'];
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score] : 'bg-stone-200 dark:bg-stone-700'}`} />
        ))}
      </div>
      <div className="flex gap-3 flex-wrap">
        {checks.map(c => (
          <span key={c.label} className={`flex items-center gap-1 text-xs ${c.pass ? 'text-brand-600 dark:text-brand-400' : 'text-stone-400'}`}>
            <Check className="w-3 h-3" />{c.label}
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

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [agree,    setAgree]    = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) { toast('Please accept the terms to continue', 'error'); return; }
    if (password.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
    setLoading(true);

    // Always use the current browser origin for the confirmation redirect.
    // This ensures it works on vercel.app, localhost, and any custom domain.
    const redirectTo = `${window.location.origin}/auth/callback`;

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { name: name.trim() },
        emailRedirectTo: redirectTo,
      },
    });

    setLoading(false);

    if (error) {
      // "User already registered" — guide them to login
      if (error.message.toLowerCase().includes('already registered') ||
          error.message.toLowerCase().includes('already been registered')) {
        toast('An account with this email already exists. Please sign in.', 'error', 5000);
        router.push(`/login?email=${encodeURIComponent(email.trim().toLowerCase())}`);
        return;
      }
      toast(error.message, 'error');
      return;
    }

    // Supabase may auto-confirm (if email confirmation is disabled in dashboard)
    // or require email confirmation. Handle both cases.
    const user = data?.user;
    const needsConfirmation = user && !user.email_confirmed_at && !user.confirmed_at;

    if (needsConfirmation) {
      // Show in-page confirmation state instead of redirecting
      setDone(true);
    } else {
      // Already confirmed (email confirmation disabled in Supabase) — go straight to dashboard
      toast('Account created! Welcome to RemoteJobs44 🎉', 'success', 4000);
      router.push('/dashboard');
    }
  }

  // ── Post-signup confirmation screen ────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-brand-600 dark:text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 mb-2">Check your inbox</h1>
          <p className="text-stone-500 dark:text-stone-400 mb-2">
            We sent a confirmation link to
          </p>
          <p className="font-bold text-stone-800 dark:text-stone-200 mb-5">{email}</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mb-6">
            Click the link in the email to activate your account. Check your spam folder if you don't see it within a minute.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-xl hover:bg-brand-600 transition-colors"
          >
            Back to Sign In
          </button>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-4">
            Wrong email?{' '}
            <button onClick={() => setDone(false)} className="text-brand-600 dark:text-brand-400 hover:underline font-semibold">
              Go back
            </button>
          </p>
        </div>
      </div>
    );
  }

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
            Create your account
          </h1>
          <p className="text-sm text-stone-400 dark:text-stone-500">Free to join. Upgrade to apply to any job.</p>
        </div>

        <div className="card p-6">
          {/* Free plan perks */}
          <div className="flex flex-wrap gap-2 mb-5">
            {['Browse 50k+ jobs', 'Save favourites', 'Track applications'].map(f => (
              <span key={f} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-semibold">
                <Check className="w-3 h-3" /> {f}
              </span>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="register-name" className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Full name</label>
              <input
                id="register-name"
                type="text" required value={name} onChange={e => setName(e.target.value)}
                placeholder="Jane Smith" className="input" autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="register-email" className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Email address</label>
              <input
                id="register-email"
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" className="input" autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="register-password" className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPass ? 'text' : 'password'} required value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Create a strong password" className="input pr-10"
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label={showPass ? 'Hide password' : 'Show password'}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password && <StrengthBar password={password} />}
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-stone-300 dark:border-[#1e3a5f] text-brand-700 focus:ring-brand-600"
              />
              <span className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                I agree to the{' '}
                <Link href="/terms" className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">Terms</Link>
                {' '}and{' '}
                <Link href="/privacy" className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">Privacy Policy</Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !name || !email || !password || !agree}
              className="w-full flex items-center justify-center gap-2 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 disabled:opacity-60 transition-colors"
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <UserPlus className="w-4 h-4" />}
              {loading ? 'Creating account…' : 'Create Free Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-stone-400 dark:text-stone-500 mt-5">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
-stone-500 mt-5">
          