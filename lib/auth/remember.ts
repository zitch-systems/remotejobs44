// lib/auth/remember.ts — makes the /login "Remember me" checkbox real.
//
// The checkbox has been on the sign-in form (checked by default) since the
// page was written, wired to React state and read by nothing. Unticking it
// changed no behaviour whatsoever: the session persisted across browser
// restarts either way. On a shared or public machine that is exactly the
// promise a user relies on, so an inert control here is worse than no control.
//
// Why it takes a shim: supabase-js persists its session in localStorage, which
// by definition survives a browser restart, and the storage adapter is fixed
// when createBrowserClient() runs — long before the user has told us what they
// want. Swapping the client's storage per sign-in would mean rebuilding the
// client mid-flow and hand-managing cookie sync with @supabase/ssr.
//
// Instead we detect the restart and end the session then. The trick is that
// sessionStorage is per-tab and cleared when the browser closes, while
// localStorage is not:
//
//   sign in, unticked  →  localStorage['…session-only'] = '1'
//                         sessionStorage['…tab-alive']  = '1'
//   same tab / reload  →  both present            → keep the session
//   browser reopened   →  localStorage only       → sign out
//
// A brand-new tab opened during the same browser run also has no tab marker,
// so it re-stamps one instead of signing out — see markTabAlive(). That is the
// deliberate trade-off: this is "don't stay signed in after I close the
// browser", which is what the checkbox says, not per-tab isolation.

const SESSION_ONLY_KEY = 'rj44-session-only';
const TAB_ALIVE_KEY    = 'rj44-tab-alive';

/**
 * The decision itself, extracted so it can be unit-tested without a DOM.
 *
 * @param sessionOnly the user signed in with "Remember me" unticked
 * @param tabMarker   this browser run has already been seen
 */
export function shouldEndSessionOnRestart(sessionOnly: boolean, tabMarker: boolean): boolean {
  return sessionOnly && !tabMarker;
}

/** Records the user's choice at sign-in time. Call after a successful auth. */
export function setRememberChoice(remember: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (remember) {
      window.localStorage.removeItem(SESSION_ONLY_KEY);
      window.sessionStorage.removeItem(TAB_ALIVE_KEY);
    } else {
      window.localStorage.setItem(SESSION_ONLY_KEY, '1');
      window.sessionStorage.setItem(TAB_ALIVE_KEY, '1');
    }
  } catch {
    // Private mode / storage disabled. Falling back to "remember" matches the
    // pre-existing behaviour and never locks anyone out.
  }
}

/** Clears both flags — call on sign-out so the next user starts clean. */
export function clearRememberChoice(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_ONLY_KEY);
    window.sessionStorage.removeItem(TAB_ALIVE_KEY);
  } catch {}
}

/**
 * True when a session-only sign-in has survived a browser restart and should
 * now be ended. Stamps the tab marker as a side effect, so a new tab opened
 * during the same browser run is treated as a continuation rather than a
 * restart.
 *
 * Call once, early, on client boot.
 */
export function consumeRestartCheck(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const sessionOnly = window.localStorage.getItem(SESSION_ONLY_KEY) === '1';
    if (!sessionOnly) return false;

    const tabMarker = window.sessionStorage.getItem(TAB_ALIVE_KEY) === '1';
    if (shouldEndSessionOnRestart(sessionOnly, tabMarker)) {
      window.localStorage.removeItem(SESSION_ONLY_KEY);
      return true;
    }
    // Same browser run, possibly a tab that has never been stamped.
    window.sessionStorage.setItem(TAB_ALIVE_KEY, '1');
    return false;
  } catch {
    return false;
  }
}
