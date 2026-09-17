'use client';
// components/auth/ForgotPasswordForm.tsx
//
// Form-only client island. Always renders the "check your email"
// confirmation regardless of whether the address exists, closing the
// account-enumeration vector.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function ForgotPasswordForm() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [website, setWebsite] = useState('');
  const [requestError, setRequestError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (website) {
      setSent(true);
      return;
    }

    setLoading(true);
    setRequestError('');
    const normalizedEmail = email.trim().toLowerCase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        }),
        new Promise<null>(resolve => {
          timer = setTimeout(() => resolve(null), 15_000);
        }),
      ]);
      if (!result) {
        setRequestError('The request is taking too long. Please try again.');
        return;
      }
      if (result.error) console.error('[forgot-password]', result.error.message);
    } catch (err) {
      console.error('[forgot-password]', err);
    } finally {
      if (timer) clearTimeout(timer);
      setLoading(false);
    }
    // Do this for both success and server errors so the form never reveals
    // whether an address is registered.
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="card p-6 text-center" aria-live="polite">
        <div className="text-4xl mb-3">📧</div>
        <p className="font-bold text-stone-900 dark:text-stone-100 mb-1">Check your email</p>
        <p className="text-sm text-stone-400">We sent a password reset link to <strong>{email}</strong></p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
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
          <label htmlFor="forgot-email" className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Email address</label>
          <input
            id="forgot-email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input"
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
          />
        </div>
        {requestError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{requestError}</p>}
        <button type="submit" disabled={loading || !email.trim()} className="w-full min-h-11 py-3 bg-brand-700 text-white font-bold rounded-lg hover:bg-brand-600 disabled:opacity-60 transition-colors">
          {loading ? 'Sending…' : 'Send Reset Link'}
        </button>
      </form>
    </div>
  );
}
