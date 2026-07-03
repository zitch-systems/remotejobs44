// app/auth/callback/route.ts
// Supabase Auth callback handler — required for magic-link, OAuth, email
// confirmation, and password-reset flows. Performance matters here: this
// is the page the user lands on after clicking "Confirm your email" or
// "Reset your password" in their inbox. Every extra DB roundtrip before
// the final redirect = extra seconds of "loading…" with no feedback.
//
// Critical path (must await):
//   1. exchangeCodeForSession — sets the session cookie. Required.
// Everything else (profile upsert for first-login, welcome email, role
// lookup) happens AFTER we know the redirect destination, either inline
// (cheap email-based role check) or fire-and-forget (DB writes).
import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email/send';
import { welcomeEmail } from '@/lib/email/templates';
import { destinationForRole, type Role } from '@/lib/auth/redirect';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { attributeReferral } from '@/lib/referral/attribution';
import { waitUntil } from '@vercel/functions';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get('code');
  // Email-confirm / password-reset / magic-link templates can use the
  // token_hash variant (recommended) so the user can click the link from
  // any device — no PKCE code_verifier needed.
  const tokenHash = searchParams.get('token_hash');
  const tokenType = searchParams.get('type') as EmailOtpType | null;
  const next  = searchParams.get('next');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error) {
    console.error(`[auth/callback] provider error: ${error} — ${errorDescription ?? '(no description)'}`);
    // Carry the provider's description through as `reason` so /login can show
    // an actionable message (e.g. cancelled consent vs. a real provider error).
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error)}&reason=${encodeURIComponent(errorDescription ?? '')}`
    );
  }

  if (!code && !(tokenHash && tokenType)) {
    console.error('[auth/callback] no code OR token_hash+type param in callback URL');
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed&reason=no_code`);
  }

  // Use the shared helper so the PKCE code_verifier cookie is read with the
  // SAME getAll/setAll API that the browser client used to write it.
  const supabase = await createServerSupabaseClient();

  // Branch on which flow we're in:
  //   * `code`            → PKCE OAuth / magic-link from the SAME device
  //                         that initiated. Needs the code_verifier cookie.
  //   * `token_hash+type` → Email-confirm / password-reset / magic-link
  //                         from ANY device. Doesn't need a verifier.
  //
  // Email-confirm via PKCE was failing for users who opened the email on
  // a different browser/device than the one that signed up — the
  // code_verifier cookie isn't there. Supporting the token_hash flow
  // here (and pointing the email templates at it) fixes that.
  let authError: { message: string } | null = null;
  let authUser: { id: string; email?: string | null; created_at?: string; last_sign_in_at?: string; user_metadata?: Record<string, any> } | null = null;

  if (code) {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) authError = exchangeError;
    else               authUser  = data.user as any;
  } else if (tokenHash && tokenType) {
    const { data, error: otpError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: tokenType,
    });
    if (otpError) authError = otpError;
    else          authUser  = data.user as any;
  }

  if (authError) {
    console.error('[auth/callback] auth verification failed:', authError.message);
    return NextResponse.redirect(
      `${origin}/login?error=auth_callback_failed&reason=${encodeURIComponent(authError.message)}`
    );
  }
  if (!authUser?.email) {
    return NextResponse.redirect(`${origin}${destinationForRole('user', next)}`);
  }

  // Decide redirect destination synchronously via hardcoded-admin email
  // check — no DB roundtrip. If the user is a regular member, they land
  // on /dashboard; if they're a hardcoded admin, /admin. Members whose
  // role is admin only in the DB (not the env list) will hit /dashboard
  // first, then the dashboard's loadSession reads the DB role and
  // re-routes to /admin — one extra navigation rather than blocking the
  // entire callback on a DB query.
  const role: Role = isHardcodedAdmin(authUser.email) ? 'admin' : 'user';
  const dest = destinationForRole(role, next);

  // First-login bookkeeping (welcome email + profile row) goes to the
  // background. Use the admin client + the service role key so RLS doesn't
  // need the user's session — we already established it, but the cookie
  // jar in this request has been "locked" by `cookies()` and writes from
  // unrelated promises after the response begins can throw.
  const createdAt  = authUser.created_at      ? new Date(authUser.created_at).getTime()      : 0;
  const lastSignIn = authUser.last_sign_in_at ? new Date(authUser.last_sign_in_at).getTime() : 0;
  const isFirstLogin = Math.abs(createdAt - lastSignIn) < 30_000;

  if (isFirstLogin) {
    const name = (authUser.user_metadata?.name as string | undefined)
      ?? authUser.email.split('@')[0];
    // waitUntil keeps the lambda alive past the redirect response so these
    // tasks actually complete. Without it, Vercel suspends the function
    // immediately and the welcome email + profile upsert silently die.
    waitUntil(
      sendEmail({ to: authUser.email, subject: welcomeEmail(name).subject, html: welcomeEmail(name).html })
        .catch(() => {})
    );
    waitUntil(
      (async () => {
        try {
          const admin = createAdminSupabaseClient();
          await admin.from('profiles').upsert({
            id:   authUser.id,
            email: authUser.email,
            name,
            plan: 'free',
            role: 'user',
            // profile_completion omitted — DEFAULT 0 (migration_v24).
            // The recompute fires on the next /api/profile GET.
          }, { onConflict: 'id', ignoreDuplicates: true });

          // Referral attribution: when the user clicked an agent's link on
          // this browser, the rj44_ref cookie carries the code. Stamp
          // referred_by once (attributeReferral is a no-op if it's already
          // set or the code isn't a live agent). Covers OAuth + email-confirm
          // first logins; the email/password auto-confirm flow attributes via
          // /api/referral/attribute instead.
          const refCode = request.cookies.get('rj44_ref')?.value ?? null;
          if (refCode) await attributeReferral(admin, { userId: authUser.id, code: refCode });
        } catch (err) {
          console.error('[auth/callback] background profile upsert failed:', err);
        }
      })()
    );
  }

  return NextResponse.redirect(`${origin}${dest}`);
}
