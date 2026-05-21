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

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser?.email) {
          const name = authUser.user_metadata?.name ?? authUser.email.split('@')[0];
          const { subject, html } = welcomeEmail(name);
          await sendEmail({ to: authUser.email, subject, html });
        }
        // Redirect admins to admin panel if no explicit next destination
        if (next === '/dashboard' && authUser) {
          const { data: profile } = await supabase
            .from('profiles').select('role').eq('id', authUser.id).maybeSingle();
          if (profile?.role === 'admin') {
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
