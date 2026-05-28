'use client';
// components/auth/ForgotPasswordForm.tsx
//
// Form-only client island. Always renders the "check your email"
// confirmation regardless of whether the address exists — closes the
// account-enumeration vector. Real errors are logged structured for
// ops debugging.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function ForgotPasswordForm() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // SECURITY: always render the confirmation, regardless of whether
    // the address actually exists. Showing a distinct error when
    // Supabase reports "user not found" leaks account existence — the
    // same enumeration vector closed on /login.
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      // Browser-side console is the right channel here — we don't want
      // to import lib/log into a client bundle, and the failure mode
      // only matters during admin-side debugging via DevTools.
      if (error) console.error('[forgot-password]', error.message);
    } catch (err) {
      console.error('[forgot-password]', err);
    }
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="card p-6 text-center">
        <div className="text-4xl mb-3">📧</div>
        <p className="font-bold text-stone-900 dark:text-stone-100 mb-1">Check your email</p>
        <p className="text-sm text-stone-400">We sent a password reset link to <strong>{email}</strong></p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Email address</label>
          <input
            id="forgot-email"
            type="email" required
            value={email} onChange={e => setEmail(e.target.value)}
            className="input" placeholder="you@example.com"
          />
        </div>
        <button type="submit" disabled={loading || !email}
          className="w-full py-3 bg-brand-700 text-white font-bold rounded-lg hover:bg-brand-600 disabled:opacity-60 transition-colors">
          {loading ? 'Sending…' : 'Send Reset Link'}
        </button>
      </form>
    </div>
  );
}
