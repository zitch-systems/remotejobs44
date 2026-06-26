'use client';
// app/security/2fa/page.tsx — admin two-factor (TOTP) setup + challenge.
//
// One screen that adapts to the session state:
//   • aal2 already           → "2FA is on" + continue
//   • verified factor, aal1  → challenge (enter current code)
//   • no factor              → enroll (scan QR / enter secret, then verify)
//
// Talks to Supabase Auth directly (auth.mfa.*), so it works even while the
// /api/admin routes are gated on aal2 (this page never calls them).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Phase = 'loading' | 'enroll' | 'challenge' | 'done' | 'nosession';

export default function TwoFactorPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/admin';
  // Lazy init → one stable client for the component's life, created render-safe.
  const [supabase] = useState(() => createClient());

  const [phase, setPhase] = useState<Phase>('loading');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        if (!user) { setPhase('nosession'); return; }

        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!active) return;
        if (aal?.currentLevel === 'aal2') { setPhase('done'); return; }

        const { data: factors } = await supabase.auth.mfa.listFactors();
        if (!active) return;
        const verified = factors?.totp?.find((f) => f.status === 'verified');
        if (verified) { setFactorId(verified.id); setPhase('challenge'); return; }

        // No verified factor → enroll. Clear any stale unverified factor first
        // so re-visiting this page doesn't pile up half-finished enrollments.
        for (const f of (factors?.all ?? [])) {
          if (f.status === 'unverified') {
            await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
          }
        }
        const { data: enrolled, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
        if (!active) return;
        if (enrollErr || !enrolled) {
          setError(enrollErr?.message ?? 'Could not start 2FA setup.');
          setPhase('enroll');
          return;
        }
        setFactorId(enrolled.id);
        setQr(enrolled.totp.qr_code);
        setSecret(enrolled.totp.secret);
        setPhase('enroll');
      } catch (e: any) {
        if (active) { setError(e?.message ?? 'Something went wrong.'); setPhase('enroll'); }
      }
    })();
    return () => { active = false; };
  }, [supabase]);

  async function verify() {
    const trimmed = code.replace(/\s/g, '');
    if (!factorId || trimmed.length < 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: vErr } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: trimmed });
    setBusy(false);
    if (vErr) { setError(vErr.message ?? 'Invalid code — try again.'); return; }
    setPhase('done');
    // Refresh server components / middleware with the new aal2 session.
    router.refresh();
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="card p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-brand-700 dark:text-brand-400" />
          </div>
          <h1 className="font-display font-extrabold text-xl text-stone-900 dark:text-stone-100">
            Two-factor authentication
          </h1>
        </div>

        {phase === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 mt-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </p>
        )}

        {phase === 'nosession' && (
          <div className="mt-4 text-sm text-stone-500 dark:text-stone-400">
            <p>Please log in first.</p>
            <Link href={`/login?next=${encodeURIComponent('/security/2fa')}`} className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">Go to login →</Link>
          </div>
        )}

        {phase === 'enroll' && (
          <div className="mt-4">
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
              Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code to finish.
            </p>
            {qr && (
              <div
                className="bg-white p-3 rounded-xl border border-stone-200 dark:border-[#1e3a5f] w-fit mx-auto mb-3 [&_svg]:w-44 [&_svg]:h-44"
                // qr_code is SVG markup returned by Supabase Auth (trusted).
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            )}
            {secret && (
              <p className="text-xs text-stone-400 dark:text-stone-500 text-center mb-4 break-all">
                Can&apos;t scan? Enter this key manually:<br />
                <code className="text-stone-600 dark:text-stone-300 font-mono">{secret}</code>
              </p>
            )}
            <CodeForm code={code} setCode={setCode} busy={busy} onSubmit={verify} error={error} cta="Verify & enable" />
          </div>
        )}

        {phase === 'challenge' && (
          <div className="mt-4">
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
              Enter the current 6-digit code from your authenticator app to continue.
            </p>
            <CodeForm code={code} setCode={setCode} busy={busy} onSubmit={verify} error={error} cta="Verify" />
          </div>
        )}

        {phase === 'done' && (
          <div className="mt-4">
            <p className="text-sm text-green-600 dark:text-green-400 font-semibold mb-4">✅ Two-factor authentication is active for this session.</p>
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

function CodeForm({
  code, setCode, busy, onSubmit, error, cta,
}: {
  code: string; setCode: (v: string) => void; busy: boolean; onSubmit: () => void; error: string | null; cta: string;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        aria-label="6-digit authentication code"
        className="w-full text-center tracking-[0.4em] font-mono text-lg py-3 rounded-xl border border-stone-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0d1a2e] text-stone-900 dark:text-stone-100 mb-3 focus:outline-none focus:border-brand-500"
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3 text-center">{error}</p>}
      <button
        type="submit"
        disabled={busy || code.length < 6}
        className="w-full py-3 font-bold rounded-xl bg-brand-700 dark:bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}{cta}
      </button>
    </form>
  );
}
