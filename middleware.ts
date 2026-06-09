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
import { hasSupabaseAuthCookie } from '@/lib/supabase/cookies';

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

// Detects presence of any Supabase auth cookie. If there's no auth cookie at
// all, the user is truly logged out. If there IS a cookie but getUser fails,
// it's a transient error — keep them logged in.
//
// The actual regex + matcher lives in lib/supabase/cookies.ts so middleware
// and AuthSyncProvider stay in lock-step — they used to drift, and any
// drift here reintroduces the random-logout bounce for chunked OAuth
// sessions (the cookie names supabase/ssr writes when the JWT is large).
function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return hasSupabaseAuthCookie(request.cookies.getAll());
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAdminRoute     = path === '/admin' || path.startsWith('/admin/');
  const isDashboardRoute = path === '/dashboard' || path.startsWith('/dashboard/');

  // Fast path for every non-gated route (homepage, ~250 SEO pages, /jobs,
  // /companies, /blog, …). Only the /admin and /dashboard branches below ever
  // read the validated user, so everywhere else supabase.auth.getUser() was
  // pure overhead: it ran solely to refresh the session cookie — something the
  // browser client's background auto-refresh already does.
  //
  // Why it matters: getUser() calls /auth/v1/user on the Auth server, and this
  // project's Auth server is capped at 10 DB connections (Supabase advisor
  // `auth_db_connections_absolute`). Firing it from Edge middleware on EVERY
  // page view, soft navigation and RSC prefetch — for every logged-in visitor —
  // saturated those 10 connections, so /auth/v1/user climbed from <100ms to
  // 2–14s. The browser then times out getAuthedUserSafe (6s) and dead-ends on
  // "Verifying your session…", while signInWithPassword / signUp stall on the
  // same starved Auth server. Scoping the round-trip to the two routes that
  // actually gate on it removes the self-inflicted flood.
  if (!isAdminRoute && !isDashboardRoute) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

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

  // path / isAdminRoute / isDashboardRoute are computed at the top of the
  // function (the non-gated fast path returns before we ever reach here).

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
    // Exclude /api/* from middleware. Every API route already authenticates
    // itself (requireAdmin / supabase.auth.getUser / cron secret), so running
    // getUser() here too just doubled the auth-server load on every request —
    // a dashboard load fires page + /api/jobs + /api/applications +
    // /api/saved-jobs + … and each was a separate /auth/v1/user call. That
    // flood is what tipped calls into rate-limited / transient failures.
    // The Supabase getUser() validation now runs ONLY for /admin and
    // /dashboard (see the non-gated fast path at the top of middleware) — every
    // other matched route returns immediately without touching the Auth server.
    // Session-cookie refresh on public pages is handled by the browser client's
    // background auto-refresh and by the route handlers themselves, so scoping
    // the auth round-trip this way loses nothing.
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
