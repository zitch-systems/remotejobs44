// app/auth/callback/route.ts
// Supabase Auth callback handler for OAuth, email confirmation, magic links,
// and password recovery.
import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType, User } from '@supabase/supabase-js';
import { sendWelcomeEmailOnce } from '@/lib/email/welcome';
import { destinationForRole, resolveRole, type Role } from '@/lib/auth/redirect';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { attributeReferral } from '@/lib/referral/attribution';
import { loadCallbackProfileRole } from '@/lib/auth/callback-role';
import { waitUntil } from '@vercel/functions';

function failedCallback(origin: string, reason: string) {
  return NextResponse.redirect(
    `${origin}/login?error=auth_callback_failed&reason=${encodeURIComponent(reason)}`,
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const tokenType = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next');
  const providerError = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (providerError) {
    console.error(`[auth/callback] provider error: ${providerError} — ${errorDescription ?? '(no description)'}`);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(providerError)}&reason=${encodeURIComponent(errorDescription ?? '')}`,
    );
  }

  if (!code && !(tokenHash && tokenType)) {
    console.error('[auth/callback] no code OR token_hash+type param in callback URL');
    return failedCallback(origin, 'no_code');
  }

  // Auth SDK calls can throw for malformed input, a missing PKCE verifier,
  // or a browser that lost its auth cookies. Always turn those failures into
  // the same actionable login redirect instead of an opaque route 500.
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  let authUser: User | null = null;
  try {
    supabase = await createServerSupabaseClient();
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return failedCallback(origin, error.message);
      authUser = data.user;
    } else {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash!,
        type: tokenType!,
      });
      if (error) return failedCallback(origin, error.message);
      authUser = data.user;
    }
  } catch (err: any) {
    console.error('[auth/callback] auth verification threw:', err?.message ?? err);
    return failedCallback(origin, err?.message ?? 'auth_verification_failed');
  }

  if (!authUser?.email) {
    return NextResponse.redirect(`${origin}${destinationForRole('user', next)}`);
  }

  // Resolve DB-only admin/agent roles before redirecting. The query is
  // best-effort and bounded: a missing profile on a brand-new signup or a
  // transient database failure falls back to the safe email-based role, and
  // the destination page can retry profile loading.
  const profileRole = await loadCallbackProfileRole(() =>
    supabase
      .from('profiles')
      .select('role')
      .eq('id', authUser!.id)
      .maybeSingle()
      .then(({ data }) => data?.role ?? null),
  );
  const role: Role = resolveRole({ profileRole, email: authUser.email });
  const dest = destinationForRole(role, next);

  // Profile upsert, referral attribution, and welcome email are background
  // work. The session exchange and role-safe redirect above stay on the
  // critical path.
  const name = (authUser.user_metadata?.name as string | undefined)
    ?? authUser.email.split('@')[0];
  waitUntil((async () => {
    try {
      const admin = createAdminSupabaseClient();
      await admin.from('profiles').upsert({
        id: authUser!.id,
        email: authUser!.email,
        name,
        plan: 'free',
        role: 'user',
      }, { onConflict: 'id', ignoreDuplicates: true });

      const refCode = request.cookies.get('rj44_ref')?.value ?? null;
      if (refCode) await attributeReferral(admin, { userId: authUser!.id, code: refCode });
      await sendWelcomeEmailOnce(admin, {
        userId: authUser!.id,
        email: authUser!.email!,
        name,
      });
    } catch (err) {
      console.error('[auth/callback] background onboarding tasks failed:', err);
    }
  })());

  return NextResponse.redirect(`${origin}${dest}`);
}
