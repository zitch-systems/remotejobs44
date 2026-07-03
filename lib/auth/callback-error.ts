// lib/auth/callback-error.ts — human copy for /auth/callback failures.
//
// When the OAuth / email-link callback (app/auth/callback/route.ts) fails it
// redirects to /login?error=auth_callback_failed&reason=<detail> (or with a
// raw provider error code). The login page previously rendered only the
// `error` slug ("auth callback failed"), throwing away `reason` — so the user
// (and support) had no idea WHY it failed or what to do next. This maps the
// error + reason to an actionable message.
//
// NOTE: a failing callback is almost always an environment/config issue, not
// app code — a stale/used link, or Supabase Auth URL/redirect/provider
// settings. The copy below nudges the user toward a workaround (retry, use the
// same device, or fall back to email+password) while the real fix happens in
// the Supabase dashboard.

export function describeAuthCallbackError(
  errorCode: string | null | undefined,
  reason?: string | null,
): string | null {
  if (!errorCode) return null;

  const code = errorCode.toLowerCase();
  const why = (reason ?? '').toLowerCase();

  // User dismissed the Google consent screen (or the provider denied it).
  if (code.includes('access_denied') || why.includes('access_denied')) {
    return 'Google sign-in was cancelled. Please try again, or sign in with your email and password below.';
  }

  if (code === 'auth_callback_failed') {
    // PKCE code_verifier missing — link opened in a different browser/device
    // than the one that started sign-in. Check this before the generic
    // no-code case since the reason string can mention both.
    if (why.includes('verifier')) {
      return 'Please finish signing in on the same device and browser you started on, then try again.';
    }
    // Expired or already-consumed email link / one-time code.
    if (why.includes('expired') || why.includes('otp') || why.includes('token')) {
      return 'This sign-in link has expired or was already used. Request a new one and try again.';
    }
    // No code/token reached the callback, or an invalid flow state — usually a
    // stale/malformed link or an OAuth redirect-URL misconfiguration.
    if (why.includes('no_code') || why.includes('flow state') || why.includes('invalid')) {
      return 'We could not complete sign-in — the link may be incomplete or already used. Please try again, or use your email and password below.';
    }
    return 'We could not complete sign-in. Please try again — if it keeps happening, sign in with your email and password below.';
  }

  // Any other provider error code (server_error, temporarily_unavailable, …).
  return 'Sign-in did not complete. Please try again in a moment.';
}
