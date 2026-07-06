'use client';
// components/auth/ResetPasswordForm.tsx
//
// Form-only client island for /reset-password. The page shell (logo,
// heading, "set new password" copy) is server-rendered.
import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUIStore } from '@/lib/store';
import { validatePassword, friendlyAuthError } from '@/lib/auth/password';

export function ResetPasswordForm() {
  const { toast } = useUIStore();
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Trim BEFORE validation so the user's "8 char" includes their
    // accidental trailing space — and so the stored password matches
    // what /login + /register store (both trim too). Without this,
    // resetting to "hello   " stored that raw, but a subsequent login
    // submit was trimmed to "hello" and failed.
    const trimmed        = password.trim();
    const trimmedConfirm = confirm.trim();
    // Same policy as signup (length + uppercase + number) — see
    // lib/auth/password.ts. A new password must be at least as strong as
    // one created at registration.
    const passwordError = validatePassword(trimmed);
    if (passwordError) { toast(passwordError, 'error'); return; }
    if (trimmed !== trimmedConfirm) { toast('Passwords do not match', 'error'); return; }
    setLoading(true);

    // Watchdog: never leave the button stuck on "Updating…". Same pattern
    // as /login's sign-in watchdog. updateUser() can stall past its result
    // in two real ways: a slow /auth/v1/user round-trip, or waiting on the
    // cross-tab auth lock (navigator.locks) that another tab is holding —
    // and when that lock wait exceeds 5s, auth-js THROWS
    // NavigatorLockAcquireTimeoutError instead of returning { error }.
    // Without the try/catch below, that throw escaped handleSubmit as an
    // unhandled rejection and the spinner span forever.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setLoading(false);
      toast('This is taking longer than expected. Please try again.', 'error');
    }, 15000);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: trimmed });
      clearTimeout(timer);
      if (timedOut) return; // user already saw the timeout message
      if (error) {
        // Friendly, actionable copy instead of raw GoTrue text — e.g. a
        // leaked-password rejection tells the user to pick a different one.
        // Full detail stays in the console for support.
        console.error('[reset-password]', error.message);
        // No recovery session — the emailed link expired, was already used,
        // or the cookies didn't survive to this page. Only a fresh link fixes
        // that, so say so instead of the raw "Auth session missing!".
        const msg = /session/i.test(error.message)
          ? 'Your reset link has expired or was already used. Please request a new one from the login page.'
          : friendlyAuthError(error.message);
        toast(msg, 'error');
        setLoading(false);
        return;
      }
      toast('Password updated! Please log in.', 'success');
      window.location.replace('/login');
    } catch (err: unknown) {
      clearTimeout(timer);
      if (timedOut) return;
      console.error('[reset-password]', err);
      toast('Could not update your password. Please try again.', 'error');
      setLoading(false);
    }
  }

  return (
    <div className="card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">New Password</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} required value={password}
              onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"
              className="input pr-10" autoComplete="new-password" />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {/* Disclose the rules validatePassword() enforces, matching /register. */}
          <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
            Use 8+ characters with an uppercase letter and a number.
          </p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Confirm Password</label>
          <input type="password" required value={confirm}
            onChange={e => setConfirm(e.target.value)} placeholder="Repeat password"
            className="input" autoComplete="new-password" />
        </div>
        <button type="submit" disabled={loading || !password || !confirm}
          className="w-full flex items-center justify-center gap-2 py-3 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-800 disabled:opacity-60 transition-colors">
          {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock className="w-4 h-4" />}
          {loading ? 'Updating…' : 'Set New Password'}
        </button>
      </form>
    </div>
  );
}
