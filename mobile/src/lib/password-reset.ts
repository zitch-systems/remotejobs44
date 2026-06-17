// src/lib/password-reset.ts — native password reset (recovery) flow.
//
// Flow:
//   1. forgot-password screen calls sendPasswordReset(email). Supabase emails a
//      recovery link pointing at `resetRedirectUri` (a `remotejobs44://` deep
//      link). With PKCE (see lib/supabase.ts) supabase-js stashes a code
//      verifier in storage at this point.
//   2. The user opens the email on the SAME device and taps the link. Supabase
//      verifies the token and redirects back to `resetRedirectUri?code=…`.
//   3. usePasswordRecoveryLink() (mounted in the root layout) catches that deep
//      link and routes to the top-level /reset-password screen with the code.
//   4. /reset-password exchanges the code for a (recovery) session and lets the
//      user set a new password via supabase.auth.updateUser({ password }).
//
// Setup required (one-time, Supabase dashboard): the redirect URL — or the
// wildcard `remotejobs44://**` — MUST be in Auth → URL Configuration → Redirect
// URLs, otherwise the link can't return to the app. This is the SAME allow-list
// entry native OAuth needs (see lib/oauth.ts).
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import { router } from 'expo-router';
import { supabase } from './supabase';

/** The deep link Supabase redirects the recovery email back to. */
export const resetRedirectUri = makeRedirectUri({ scheme: 'remotejobs44', path: 'reset-password' });

/**
 * Send a password-reset email. Resolves even if the address has no account —
 * Supabase intentionally doesn't reveal whether an email exists, so callers
 * should show a neutral "if an account exists…" confirmation.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: resetRedirectUri,
  });
  if (error) throw error;
}

/**
 * Listen for the recovery deep link and hand it to the /reset-password screen.
 * Mounted once in the root layout. Robust to both `scheme://reset-password` (the
 * segment lands in `hostname`) and `scheme:///reset-password` (lands in `path`).
 */
export function usePasswordRecoveryLink(): void {
  const url = Linking.useURL();
  useEffect(() => {
    if (!url) return;
    let parsed: Linking.ParsedURL;
    try {
      parsed = Linking.parse(url);
    } catch {
      return;
    }
    const host = (parsed.hostname ?? '').toLowerCase();
    const path = (parsed.path ?? '').replace(/^\/+/, '').toLowerCase();
    const isReset = host === 'reset-password' || path === 'reset-password' || path.startsWith('reset-password/');
    if (!isReset) return;

    const qp = parsed.queryParams ?? {};
    const code = typeof qp.code === 'string' ? qp.code : '';
    const error =
      typeof qp.error_description === 'string'
        ? qp.error_description
        : typeof qp.error === 'string'
          ? qp.error
          : '';
    // Navigate BEFORE the code exchange runs (on the screen) so the auth-group
    // redirect can't whisk a freshly-recovered session off to the tabs first.
    // replace (not push) so the (auth) group unmounts — otherwise its
    // redirect-when-authed guard, still mounted underneath, would fire the
    // moment the exchange creates a session and bounce us off this screen.
    router.replace({ pathname: '/reset-password', params: { code, error } });
  }, [url]);
}
