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
import { createServerClient } from '@supabase/ssr';
import { sendEmail } from '@/lib/email/send';
import { welcomeEmail } from '@/lib/email/templates';
import { cookies } from 'next/headers';
import { destinationForRole, type Role } from '@/lib/auth/redirect';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { waitUntil } from '@vercel/functions';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get('code');
  const next  = searchParams.get('next');
  const error = searchParams.get('error');

  if (error) {
    console.error('Auth callback error:', error, searchParams.get('error_description'));
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options?: any) => { try { cookieStore.set({ name, value, ...options }); } catch {} },
        remove: (name: string, options?: any)        => { try { cookieStore.set({ name, value: '', ...options }); } catch {} },
      },
    }
  );

  // The single must-await — sets the session cookie. The exchange result
  // also gives us the user object so we can skip a separate getUser() roundtrip.
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error('Code exchange error:', exchangeError.message);
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const authUser = data.user;
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
            profile_completion: 20,
          }, { onConflict: 'id', ignoreDuplicates: true });
        } catch (err) {
          console.error('[auth/callback] background profile upsert failed:', err);
        }
      })()
    );
  }

  return NextResponse.redirect(`${origin}${dest}`);
}
