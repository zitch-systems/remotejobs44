'use client';
// components/auth/VerifyEmailBanner.tsx
//
// Surfaces a "please verify your email" affordance when the signed-in
// user's auth.users row has email_confirmed_at IS NULL.
//
// Why it exists: the round-32 server-side gates on
// /api/applications, /api/cv, /api/ai/*, /api/alerts, and
// /api/paystack/initialize return 403 to unverified users with a
// "check your inbox" message. Without this banner, that error only
// fires AFTER the user attempts the action — they had no signal that
// their account was in a half-set-up state, and no UX path to
// re-trigger the confirmation email if the original got lost in
// spam, mistyped, or expired.
//
// Mount this near the top of any page a signed-in user spends time
// on (dashboard, profile, applications). The component self-hides
// when the user is signed-out or already confirmed.
//
// Resend uses the supabase-js client `auth.resend({ type: 'signup' })`
// call — Supabase enforces its own rate-limit on this (per email),
// so we don't need to add one here. Generic toast on error so a
// rate-limit message can't be used to enumerate accounts.
import { useEffect, useState } from 'react';
import { Mail, Loader2, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUIStore } from '@/lib/store';

export function VerifyEmailBanner() {
  const supabase = createClient();
  const { toast } = useUIStore();
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Direct getUser() rather than the persisted Zustand store
      // because email_confirmed_at isn't shipped into the rj44-auth
      // shape — Zustand only persists name/plan/role/etc. Pulling
      // straight from the auth client is one round-trip but always
      // fresh (the user may have just clicked the link in another
      // tab and we want the banner to disappear after a soft refresh).
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      if (!user.email_confirmed_at && user.email) {
        setUnconfirmed(true);
        setEmail(user.email);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleResend() {
    if (sending || sent || !email) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
      });
      if (error) throw new Error(error.message);
      setSent(true);
      toast('Verification email sent. Check your inbox.', 'success', 5000);
    } catch {
      // Surface generic copy — Supabase's rate-limit string would
      // confirm the address is on file and leak account existence
      // to anyone shoulder-surfing.
      toast('Could not send verification email. Try again in a few minutes.', 'error', 6000);
    } finally {
      setSending(false);
    }
  }

  if (!unconfirmed) return null;

  return (
    <div className="card p-4 mb-6 border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 flex flex-wrap items-center gap-3">
      <Mail className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">
          Confirm your email to unlock the full account
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
          We sent a verification link to <strong className="break-all">{email}</strong>. Click it to apply for jobs, use AI tools, and subscribe.
        </p>
      </div>
      <button
        onClick={handleResend}
        disabled={sending || sent}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-600 dark:border-amber-500 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-60 transition-colors"
      >
        {sent ? (
          <>
            <Check className="w-3.5 h-3.5" /> Sent
          </>
        ) : sending ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending
          </>
        ) : (
          <>Resend email</>
        )}
      </button>
    </div>
  );
}
