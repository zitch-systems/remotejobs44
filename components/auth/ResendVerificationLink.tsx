'use client';
// components/auth/ResendVerificationLink.tsx
//
// "Didn't receive a verification email?" affordance for the login page.
//
// Background: when Supabase's "Enable email confirmations" dashboard
// setting is ON (it is on this project), an unverified account can't
// sign in — signInWithPassword returns an "Email not confirmed"
// error which the login page collapses into the generic
// "Invalid email or password" message (to prevent account enumeration
// via the response text). That leaves a real user who never received
// or lost their confirmation email with no UX path: they can't sign
// in, /forgot-password sends a recovery link not a confirmation link,
// and they can't see VerifyEmailBanner because they can't reach
// /dashboard.
//
// This component bridges that gap. Default render is a tiny link;
// click expands into an inline email-input form. On submit it calls
// supabase.auth.resend({ type: 'signup' }) — Supabase rate-limits this
// per-email upstream, so we don't add another layer. We ALWAYS render
// the same "if an account exists, check your inbox" message
// regardless of whether the resend actually fired, so a probing user
// can't enumerate which addresses are registered + unverified.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, Loader2, Check } from 'lucide-react';

export function ResendVerificationLink() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (sending || done || !email.trim()) return;
    setSending(true);
    try {
      // The redirect path the user lands on after clicking the link
      // mirrors /register so a fresh signup and a re-sent confirmation
      // end at the same place.
      await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
      });
    } catch {
      // Swallow — see the "always render the same message" rationale
      // in the file header.
    }
    setDone(true);
    setSending(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:underline"
      >
        Didn&rsquo;t receive a verification email?
      </button>
    );
  }

  if (done) {
    return (
      <div className="card p-3 mt-3 border-brand-200 dark:border-brand-900/40 bg-brand-50 dark:bg-brand-900/10 flex items-start gap-2">
        <Check className="w-4 h-4 text-brand-700 dark:text-brand-400 shrink-0 mt-0.5" />
        <p className="text-xs text-brand-900 dark:text-brand-200 leading-relaxed">
          If an account exists for that address and isn&rsquo;t confirmed yet, we&rsquo;ve sent the verification link. Check your inbox and spam folder.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleResend} className="card p-3 mt-3 border-slate-200 dark:border-[#1e3a5f] flex flex-col gap-2">
      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
        Email address
      </label>
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          disabled={sending}
          className="input flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={sending || !email.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-brand-700 dark:bg-brand-600 text-white text-xs font-semibold hover:bg-brand-600 disabled:opacity-60 transition-colors whitespace-nowrap"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
          {sending ? 'Sending' : 'Resend'}
        </button>
      </div>
    </form>
  );
}
