// lib/auth/recovery-route.ts
//
// Single source of truth for "is the browser currently on the password
// -recovery route?". Used by AuthSyncProvider to SKIP its mount-time auth
// sync while a user is mid-password-reset.
//
// Why this matters (the /reset-password stall):
// On the recovery route the user holds a short-lived recovery session and
// the only auth call that should run is updateUser(). But AuthSyncProvider
// is mounted globally in app/layout.tsx, so on every page — including
// /reset-password — it fires a burst of auth operations on mount
// (getUser, a PostgREST profile fetch, saved-jobs + applications hydrates,
// and event-driven profile fetches from onAuthStateChange). Every one of
// those acquires the SAME cross-tab navigator.locks Web Lock that
// updateUser() needs. On slow / mobile connections that contention starves
// updateUser() past ResetPasswordForm's watchdog — the user sees
// "This is taking longer than expected." PR #160 removed the *deadlock*
// (made the auth callback synchronous) but not this *contention*.
//
// Keeping the check here (a) makes it unit-testable in the node-env vitest
// suite without a DOM, and (b) keeps the matched paths in lock-step with
// any future recovery route (e.g. a locale-prefixed variant).

/**
 * True when `pathname` is the password-recovery page. Matches the exact
 * route and any sub-path / trailing slash, and is agnostic to query string
 * and hash (callers should pass `window.location.pathname`, which already
 * excludes both, but we defensively strip them so a full URL also works).
 */
export function isRecoveryRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  // Defensive: tolerate a full href or a path with a query/hash appended.
  const path = pathname.split('?')[0].split('#')[0];
  return path === '/reset-password' || path.startsWith('/reset-password/');
}
