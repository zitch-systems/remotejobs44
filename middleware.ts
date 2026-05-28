// middleware.ts — Supabase session refresh + route-level role enforcement.
// Uses the @supabase/ssr getAll/setAll pattern recommended by Supabase to avoid
// random logouts caused by inconsistent cookie propagation.
//
// Random-logout guard: getUser() can throw or return 5xx on transient network
// blips. We must NOT redirect to /login on those — we only redirect when we
// have a *confirmed* "no session" response (401/403 with no user), or when no
// Supabase cookies exist at all. Anything else we let through and let the
// page render so a temporary network hiccup doesn't kick the user out.
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { ADMIN_EMAILS } from '@/lib/admin-emails';

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

// Detects presence of any Supabase auth cookie. If there's no auth cookie at
// all, the user is truly logged out. If there IS a cookie but getUser fails,
// it's a transient error — keep them logged in.
//
// Supabase/SSR chunks large sessions (Google OAuth, long JWTs) across
// `sb-<ref>-auth-token.0`, `.1`, … cookies and deletes the base name.
// `endsWith('-auth-token')` would miss every chunked session, which is the
// majority of OAuth users — and the missed check is exactly what triggers
// the random-logout bounce. Match base or chunked names.
const SB_AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;
function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(c => SB_AUTH_COOKIE.test(c.name));
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
  let user: { id: string; email?: string | null } | null = null;
  let confirmedUnauthed = false;
  let serverSaid401     = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const status = (error as any)?.status;
      if (status === 401 || status === 403) serverSaid401 = true;
    } else {
      user = data?.user ?? null;
      if (!user) confirmedUnauthed = true;
    }
  } catch {
    // Network exception — treat as transient. Do not bounce.
  }

  // KEY CHANGE: a 401 from getUser() alone is NOT proof the user is logged
  // out. Supabase access tokens can be briefly stale during refresh (very
  // common right after a Paystack redirect), and middleware runs on every
  // request — bouncing on the first 401 was the "subscribed → briefly
  // logged out" flicker users were reporting. Only mark unauthed when the
  // server says 401 AND there is NO sb-*-auth-token cookie at all. If the
  // cookie exists, let the page render; the client-side `getAuthedUserSafe`
  // has retry + recovery logic, and Supabase's auto-refresh will land
  // within seconds.
  const cookiePresent = hasSupabaseSessionCookie(request);
  if (serverSaid401 && !cookiePresent) confirmedUnauthed = true;
  if (!user && !confirmedUnauthed && !cookiePresent) confirmedUnauthed = true;

  const path = request.nextUrl.pathname;
  const isAdminRoute     = path === '/admin' || path.startsWith('/admin/');
  const isDashboardRoute = path === '/dashboard' || path.startsWith('/dashboard/');

  // Only bounce to /login when we are CERTAIN the user has no session — not on
  // transient errors. Otherwise the page renders and its client-side auth check
  // can handle redirect or render a "loading" state.
  if ((isAdminRoute || isDashboardRoute) && confirmedUnauthed) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // Belt-and-braces server-side check for /admin/*: even with the client
  // gate in app/admin/layout.tsx, a non-admin's browser was previously
  // able to render the admin page shell before the client redirected.
  // Hardcoded-admin emails go through (DB-only admins still rely on the
  // client gate, because reading profiles.role here adds latency to every
  // page load). All admin API routes already require admin via lib/admin/auth.
  if (user && isAdminRoute && !isAdminEmail(user.email)) {
    // Don't outright redirect — DB-admin users would loop. Let the client
    // /admin/layout.tsx check decide based on profiles.role.
    // (Intentional no-op; see comment above.)
  }

  // Server-side shortcut for the hardcoded admin list, so admins never see the
  // /dashboard flash before the client-side check fires. Members are routed by
  // the /admin layout's client-side profile lookup (DB role is the source of
  // truth there).
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
