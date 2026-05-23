// app/auth/callback/route.ts
// Supabase Auth callback handler — required for magic link + OAuth flows
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { sendEmail } from '@/lib/email/send';
import { welcomeEmail } from '@/lib/email/templates';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get('code');
  const next  = searchParams.get('next') ?? '/dashboard';
  const error = searchParams.get('error');

  // Handle OAuth/magic-link errors from Supabase
  if (error) {
    console.error('Auth callback error:', error, searchParams.get('error_description'));
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }

  if (code) {
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

    const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();

        if (authUser?.email) {
          // Only send welcome email on first-ever sign-in (not every OAuth login)
          // Detect first login: created_at and last_sign_in_at are within 30s of each other
          const createdAt = authUser.created_at ? new Date(authUser.created_at).getTime() : 0;
          const lastSignIn = authUser.last_sign_in_at ? new Date(authUser.last_sign_in_at).getTime() : 0;
          const isFirstLogin = Math.abs(createdAt - lastSignIn) < 30_000;

          if (isFirstLogin) {
            const name = authUser.user_metadata?.name ?? authUser.email.split('@')[0];
            const { subject, html } = welcomeEmail(name);
            // Fire and forget — don't block redirect
            sendEmail({ to: authUser.email, subject, html }).catch(() => {});

            // Auto-create profile row if it doesn't exist yet (handles missing DB trigger)
            try {
              await supabase.from('profiles').upsert({
                id:   authUser.id,
                name: name,
                plan: 'free',
                role: 'user',
                profile_completion: 20,
              }, { onConflict: 'id', ignoreDuplicates: true });
            } catch {}
          }
        }

        // Redirect admins to admin panel if no explicit next destination
        if (next === '/dashboard' && authUser) {
          const ADMIN_EMAILS = ['admin@remotejobs44.com', 'admin@remotejobs4.com', 'zitchinfo@gmail.com'];
          const isHardcodedAdmin = ADMIN_EMAILS.includes(authUser.email?.toLowerCase() ?? '');
          let isAdmin = isHardcodedAdmin;
          if (!isAdmin) {
            const { data: profile } = await supabase
              .from('profiles').select('role').eq('id', authUser.id).maybeSingle();
            isAdmin = profile?.role === 'admin';
          }
          if (isAdmin) {
            return NextResponse.redirect(`${origin}/admin`);
          }
        }
      } catch {}
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error('Code exchange error:', exchangeError.message);
  }

  // Fallback — something went wrong
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
