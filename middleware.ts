// middleware.ts — Supabase session refresh + route-level role enforcement.
// Uses the @supabase/ssr getAll/setAll pattern recommended by Supabase to avoid
// random logouts caused by inconsistent cookie propagation.
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { ADMIN_EMAILS } from '@/lib/admin-emails';

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and supabase.auth.getUser()
  // — doing so can cause users to be randomly logged out (per Supabase docs).
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {}

  const path = request.nextUrl.pathname;
  const isAdminRoute     = path === '/admin' || path.startsWith('/admin/');
  const isDashboardRoute = path === '/dashboard' || path.startsWith('/dashboard/');

  if ((isAdminRoute || isDashboardRoute) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // Cheap role hint based on hardcoded admin list — DB lookup happens client-side
  // in the layout for accuracy. This middleware just shortcuts the obvious wrong-area
  // bounces so the user doesn't see the wrong area flash on screen.
  if (user && isDashboardRoute && isAdminEmail(user.email)) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
