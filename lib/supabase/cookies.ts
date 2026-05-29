// lib/supabase/cookies.ts — Supabase auth-cookie detection helpers.
//
// Used by middleware (Edge) and AuthSyncProvider (browser) to decide
// whether a request still has an auth cookie. Both contexts MUST agree
// — when they drift, the random-logout bug returns: middleware sees no
// cookie and bounces to /login while the browser still has chunked
// `sb-*-auth-token.0`/`.1` cookies set by supabase/ssr.
//
// The two callers see different shapes:
//   * NextRequest.cookies.getAll() returns individual { name, value } —
//     matched against IS_SB_AUTH_COOKIE_NAME (^…$ anchored).
//   * document.cookie is a single string with all cookies joined by
//     "; " — matched against SB_AUTH_COOKIE_IN_DOCUMENT (unanchored,
//     stops at `=` so the value bytes aren't picked up).
//
// History: chunked sessions (long Google-OAuth JWTs) live under
// `sb-<projectRef>-auth-token.0`, `…1`, … with the base name deleted.
// A previous middleware regex used `endsWith('-auth-token')` and missed
// every chunked session — the missed check was the random-logout cause.
// Keep these two regexes in lock-step.

/**
 * Matches a single Supabase auth cookie NAME exactly (anchored).
 * Use against entries from NextRequest.cookies.getAll() or similar.
 *
 * Examples that match:
 *   - "sb-abcdefg-auth-token"
 *   - "sb-abcdefg-auth-token.0"
 *   - "sb-abcdefg-auth-token.42"
 *
 * Examples that don't:
 *   - "sb-abcdefg-auth-token.foo"   (chunk suffix must be all digits)
 *   - "sb-abcdefg-auth-tokenfoo"    (anchored)
 *   - "session"                     (no sb- prefix)
 */
export const IS_SB_AUTH_COOKIE_NAME = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Matches an `sb-…-auth-token` occurrence inside a serialised cookie
 * header (the string you get from document.cookie). Unanchored because
 * other cookies may sit on either side. The `[^=]+` mid-section stops
 * at the `=` separator so a cookie VALUE that happens to contain
 * "sb-foo-auth-token" doesn't false-positive.
 *
 * Examples in document.cookie that match:
 *   - "sb-abcdefg-auth-token=eyJhbGc..."
 *   - "x=y; sb-abcdefg-auth-token.0=...; sb-abcdefg-auth-token.1=..."
 *
 * Examples that don't:
 *   - "x=sb-abcdefg-auth-token-value"   (in a value, not at name start)
 *   - "session=eyJ..."                  (no sb-… name at all)
 */
export const SB_AUTH_COOKIE_IN_DOCUMENT = /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?/;

/**
 * True when any cookie in the given list has an `sb-*-auth-token(.N)?`
 * name. Pass NextRequest.cookies.getAll() (Edge middleware) or any
 * array shaped like `{ name: string }`.
 */
export function hasSupabaseAuthCookie(cookies: Array<{ name: string }>): boolean {
  return cookies.some(c => IS_SB_AUTH_COOKIE_NAME.test(c.name));
}

/**
 * True when document.cookie contains an `sb-*-auth-token(.N)?` cookie.
 * Use from a browser context — no-op + returns false in SSR.
 */
export function documentHasSupabaseAuthCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return SB_AUTH_COOKIE_IN_DOCUMENT.test(document.cookie);
}
