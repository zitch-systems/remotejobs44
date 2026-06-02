'use client';
// app/register/page.tsx — Supabase email/password registration
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, UserPlus, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUIStore, useAuthStore } from '@/lib/store';
import { resolveRole, destinationForRole } from '@/lib/auth/redirect';

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
    // Validate against the value we'll ACTUALLY store. Otherwise pasting
    // "    pass    " (12 chars, passes length check) would trim down to
    // 4 chars at signUp and Supabase would reject — confusing UX. Same
    // bug pattern as components/auth/ResetPasswordForm.tsx.
    const trimmedPassword = password.trim();
    if (trimmedPassword.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
    setLoading(true);

    // Trim password too — see the same fix on /login. Trailing-space typos
    // from autocomplete account for a meaningful chunk of "invalid creds"
    // failures in our auth logs.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: trimmedPassword,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      toast(error.message, 'error');
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

      let profile: any = null;
      try {
        const res = await fetch('/api/profile');
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
          <div className="flex flex-wrap gap-2 mb-5">
            {['Browse 50k+ jobs', 'Save favourites', 'Track applications'].map(f => (
              <span key={f} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-semibold">
                <Check className="w-3 h-3" /> {f}
              </span>
            ))}
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 mb-4 border border-stone-200 dark:border-[#1e3a5f] rounded-lg bg-white dark:bg-[#0d1a2e] hover:bg-stone-50 dark:hover:bg-[#162033] text-stone-800 dark:text-stone-100 text-sm font-semibold transition-all disabled:opacity-50"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
              <path d="M47.5 24.6c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.2 7.3-10.5 7.3-17.4z" fill="#4285F4"/>
              <path d="M24 48c6.5 0 12-2.1 16-5.8l-7.9-6c-2.2 1.5-5 2.3-8.1 2.3-6.2 0-11.5-4.2-13.4-9.9H2.5v6.2C6.5 42.6 14.7 48 24 48z" fill="#34A853"/>
              <path d="M10.6 28.6A14.8 14.8 0 0 1 9.8 24c0-1.6.3-3.2.8-4.6v-6.2H2.5A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.8l8.1-6.2z" fill="#FBBC05"/>
              <path d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.8-6.8C35.9 2.3 30.4 0 24 0 14.7 0 6.5 5.4 2.5 13.2l8.1 6.2C12.5 13.7 17.8 9.5 24 9.5z" fill="#EA4335"/>
            </svg>
            Sign up with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <hr className="flex-1 border-stone-200 dark:border-[#1e3a5f]" />
            <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">or with email</span>
            <hr className="flex-1 border-stone-200 dark:border-[#1e3a5f]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
            <div>
              <label htmlFor="reg-name" className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Full name</label>
              <input
                id="reg-name"
                type="text" required value={name} onChange={e => setName(e.target.value)}
                placeholder="Jane Smith" className="input" autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Email address</label>
              <input
                id="reg-email"
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" className="input" autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="reg-password"
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
