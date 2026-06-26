'use client';
// app/security/2fa/page.tsx — admin email one-time-code verification.
//
// After password login, an admin requests a 6-digit code that is emailed to
// the admin mailbox (admin@remotejobs44.com), then enters it here to set the
// signed 2FA session cookie that /api/admin routes require.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Loader2, Mail } from 'lucide-react';
import { ADMIN_2FA_EMAIL_DISPLAY } from '@/lib/auth/mfa';

type Phase = 'loading' | 'intro' | 'enter' | 'done' | 'forbidden';

export default function TwoFactorPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/admin';

  const [phase, setPhase] = useState<Phase>('loading');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/2fa/status');
        if (!active) return;
        if (res.status === 401 || res.status === 403) { setPhase('forbidden'); return; }
        const data = await res.json().catch(() => ({}));
        setPhase(data?.verified ? 'done' : 'intro');
      } catch {
        if (active) setPhase('intro');
      }
    })();
    return () => { active = false; };
  }, []);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/2fa/send', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error ?? 'Could not send the code.'); return; }
      setSentTo(data?.sentTo ?? null);
      setPhase('enter');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const c = code.replace(/\D/g, '');
    if (c.length < 6) { setError('Enter the 6-digit code.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error ?? 'Verification failed.'); return; }
      setPhase('done');
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="card p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-brand-700 dark:text-brand-400" />
          </div>
          <h1 className="font-display font-extrabold text-xl text-stone-900 dark:text-stone-100">
            Admin verification
          </h1>
        </div>

        {phase === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 mt-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </p>
        )}

        {phase === 'forbidden' && (
          <div className="mt-4 text-sm text-stone-500 dark:text-stone-400">
            <p>You need to be signed in as an admin to verify.</p>
            <Link href={`/login?next=${encodeURIComponent('/security/2fa')}`} className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">Go to login →</Link>
          </div>
        )}

        {phase === 'intro' && (
          <div className="mt-4">
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-4 flex items-start gap-2">
              <Mail className="w-4 h-4 mt-0.5 shrink-0" />
              For security, we&apos;ll email a 6-digit code to <strong className="text-stone-700 dark:text-stone-200">{ADMIN_2FA_EMAIL_DISPLAY}</strong>. Enter it to continue to the admin area.
            </p>
            {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>}
            <button
              onClick={sendCode}
              disabled={busy}
              className="w-full py-3 font-bold rounded-xl bg-brand-700 dark:bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}Email me a code
            </button>
          </div>
        )}

        {phase === 'enter' && (
          <div className="mt-4">
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
              We sent a code to <strong className="text-stone-700 dark:text-stone-200">{sentTo ?? ADMIN_2FA_EMAIL_DISPLAY}</strong>. Enter it below (expires in 10 minutes).
            </p>
            <form onSubmit={(e) => { e.preventDefault(); verify(); }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                aria-label="6-digit code"
                className="w-full text-center tracking-[0.4em] font-mono text-lg py-3 rounded-xl border border-stone-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0d1a2e] text-stone-900 dark:text-stone-100 mb-3 focus:outline-none focus:border-brand-500"
              />
              {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3 text-center">{error}</p>}
              <button
                type="submit"
                disabled={busy || code.length < 6}
                className="w-full py-3 font-bold rounded-xl bg-brand-700 dark:bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}Verify
              </button>
            </form>
            <button
              onClick={sendCode}
              disabled={busy}
              className="w-full mt-3 text-xs text-stone-400 dark:text-stone-500 hover:underline"
            >
              Didn&apos;t get it? Resend code
            </button>
          </div>
        )}

        {phase === 'done' && (
          <div className="mt-4">
            <p className="text-sm text-green-600 dark:text-green-400 font-semibold mb-4">✅ Verified for this session.</p>
            <button
              onClick={() => router.replace(next)}
              className="w-full py-3 font-bold rounded-xl bg-brand-700 dark:bg-brand-500 text-white hover:bg-brand-600 transition-colors"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
