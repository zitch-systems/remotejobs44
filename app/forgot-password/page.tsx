'use client';
import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUIStore } from '@/lib/store';

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const { toast } = useUIStore();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) { toast(error.message, 'error'); setLoading(false); return; }
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 mb-1">Reset your password</h1>
          <p className="text-sm text-stone-400 dark:text-stone-500">Enter your email and we'll send a reset link</p>
        </div>
        {sent ? (
          <div className="card p-6 text-center">
            <div className="text-4xl mb-3">📧</div>
            <p className="font-bold text-stone-900 dark:text-stone-100 mb-1">Check your email</p>
            <p className="text-sm text-stone-400">We sent a password reset link to <strong>{email}</strong></p>
          </div>
        ) : (
          <div className="card p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Email address</label>
                <input id="forgot-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input" placeholder="you@example.com" />
              </div>
              <button type="submit" disabled={loading || !email}
                className="w-full py-3 bg-brand-700 text-white font-bold rounded-lg hover:bg-brand-600 disabled:opacity-60 transition-colors">
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          </div>
        )}
        <p className="text-center text-sm text-stone-400 mt-5">
          <Link href="/login" className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">← Back to login</Link>
        </p>
      </div>
    </div>
  )