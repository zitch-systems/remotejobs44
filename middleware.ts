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

// Redirect responses must carry over any cookies the Supabase client queued
// via setAll during getUser() — that call silently rotates the refresh token
// when the access token has expired. Building a bare NextResponse.redirect
// drops those Set-Cookie headers, so the browser keeps the OLD (already
// consumed) refresh token; its next refresh then trips GoTrue's reuse
// detection, which revokes the whole session family — i.e. a random logout /
// permanent "Verifying your session…" for that user. This is the documented
// supabase/ssr middleware pitfall ("when creating a new response object,
// copy over the cookies").
function redirectWithAuthCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
  return redirect;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAdminRoute     = path === '/admin' || path.startsWith('/admin/');
  const isDashboardRoute = path === '/dashboard' || path.startsWith('/dashboard/');
  // The agent portal gates on cookie PRESENCE only (same as /dashboard) — the
  // authoritative role check lives in app/agent/layout.tsx + the /api/agent/*
  // routes, so we don't pay an Auth-server round-trip here.
  const isAgentRoute     = path === '/agent' || path.startsWith('/agent/');

  // Fast path for every non-gated route (homepage, ~250 SEO pages, /jobs,
  // /companies, /blog, …). Only the /admin branch below ever reads the
  // validated user, so everywhere else supabase.auth.getUser() was pure
  // overhead: it ran solely to refresh the session cookie — something the
  // browser client's background auto-refresh already does.
  //
  // Why it matters: getUser() calls /auth/v1/user on the Auth server, and this
  // project's Auth server is capped at 10 DB connections (Supabase advisor
  // `auth_db_connections_absolute`). Firing it from Edge middleware on EVERY
  // page view, soft navigation and RSC prefetch — for every logged-in visitor —
  // saturated those 10 connections, so /auth/v1/user climbed from <100ms to
  // 2–14s. The browser then times out getAuthedUserSafe (6s) and dead-ends on
  // "Verifying your session…", while signInWithPassword / signUp stall on the
  // same starved Auth server. Scoping the round-trip to the routes that
  // actually gate on it removes the self-inflicted flood.
  if (!isAdminRoute && !isDashboardRoute && !isAgentRoute) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  // /dashboard: gate on cookie PRESENCE only — no Auth-server round-trip.
  // The blocking getUser() here was the dashboard's entire TTFB story: the
  // page itself is a statically-prerendered client shell, so the auth
  // validation (often 1s+, and 2–14s during the connection-cap incidents)
  // was the only thing between the visitor and first byte. Speed Insights
  // had /dashboard as the worst route on the site (RES 37 desktop).
  //
  // This loses nothing real:
  //   * No cookie → redirect to /login, exactly as the old confirmedUnauthed
  //     path did — just without burning an Auth call to learn what the
  //     cookie jar already says.
  //   * Cookie present → let the page render. That was ALREADY the outcome
  //     whenever getUser() returned 401-with-cookie or any transient error
  //     ("only bounce when CERTAIN") — the client-side getAuthedUserSafe
  //     flow owns real validation, retry, and the sign-in fallback UI. A
  //     forged/stale cookie renders the same skeleton shell it always
  //     could, and every data fetch behind it authenticates itself.
  //   * Token refresh moves to the browser client's background auto-refresh,
  //     the same mechanism every other page (including /profile,
  //     /applications, /saved — which have no middleware gate at all)
  //     already relies on.
  //   * Hardcoded admins are no longer server-redirected /dashboard→/admin;
  //     the dashboard's client-side role check handles that (as it always
  //     has for DB-role admins).
  if (isDashboardRoute || isAgentRoute) {
    if (!hasSupabaseSessionCookie(request)) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', path);
      return NextResponse.redirect(url);
    }
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

  // Only /admin/* reaches this point (/dashboard and the non-gated routes
  // return from the fast paths above).

  // Only bounce to /login when we are CERTAIN the user has no session — not on
  // transient errors. Otherwise the page renders and its client-side auth check
  // can handle redirect or render a "loading" state.
  if (confirmedUnauthed) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return redirectWithAuthCookies(url, response);
  }

  // Server-side role gate for /admin/*. Without this, a logged-in non-admin
  // could render the admin shell (nav, layout chrome) until the client gate in
  // app/admin/layout.tsx finished its async profile fetch and redirected — the
  // admin UI structure leaked, even though every /api/admin/* route enforces
  // requireAdmin so no admin DATA was ever served. The per-page-load latency
  // concern that keeps getUser() off the rest of the site does NOT apply here:
  // /admin/* is low-traffic, and getUser() already ran above, so this adds at
  // most one profiles read on admin navigations only.
  if (user && !isAdminEmail(user.email)) {
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    // Only bounce on a CONFIRMED non-admin. On a transient read error (or a
    // not-yet-provisioned profile row) keep the prior behaviour — let the
    // client gate decide — so a DB blip can never lock a real DB-role admin
    // out of /admin.
    if (!profErr && profile && profile.role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      return redirectWithAuthCookies(url, response);
    }
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
    // The Supabase getUser() validation now runs ONLY for /admin (see the
    // fast paths at the top of middleware — /dashboard gates on cookie
    // presence alone) — every other matched route returns immediately
    // without touching the Auth server.
    // Session-cookie refresh on public pages is handled by the browser client's
    // background auto-refresh and by the route handlers themselves, so scoping
    // the auth round-trip this way loses nothing.
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
