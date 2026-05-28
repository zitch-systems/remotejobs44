// lib/supabase/client.ts — Browser-side Supabase client
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key';
  return createBrowserClient(url, key);
}

// `supabase.auth.getUser()` hits /auth/v1/user to validate the access token.
// When the browser has been asleep / the access token has just expired, that
// call returns 401 *before* the JS client's auto-refresh has run, even though
// a perfectly valid refresh token is sitting in storage. The refresh fires
// moments later and a TOKEN_REFRESHED event restores the session, but if we
// reacted to the first 401 by calling setUser(null) or routing to /login the
// UI would flicker subscribed → not-subscribed → subscribed (or admin → /login
// → admin). This helper retries a 401 once with a short delay so the refresh
// has a chance to complete first.
export type AuthedUserResult = {
  user: { id: string; email?: string | null } | null;
  status: 'ok' | 'unauthed' | 'transient';
  /**
   * The user id from the *local* Supabase session (i.e. whatever
   * localStorage says the signed-in user is). Available on all three
   * statuses when a session exists locally, including transient — useful
   * for cross-account detection: a caller can compare this against their
   * persisted Zustand user id even when the network getUser() failed.
   * Null only when there is no local session at all.
   */
  sessionUserId: string | null;
};

export async function getAuthedUserSafe(
  supabase: SupabaseClient,
  opts: { retries?: number; delayMs?: number; timeoutMs?: number } = {}
): Promise<AuthedUserResult> {
  const retries  = opts.retries  ?? 2;
  const delayMs  = opts.delayMs  ?? 400;
  const timeoutMs = opts.timeoutMs ?? 6000;

  // Cheap local check first: if there is no Supabase session at all in
  // localStorage, the user really is logged out — no point hitting the
  // network. If there IS a session, treat 401s as transient rather than
  // unauthed. Random logouts from cold-lambda / slow-network refreshes
  // were the #1 user complaint; this guard absorbs them.
  let sessionUserId: string | null = null;
  let hasLocalSession = false;
  try {
    const { data } = await supabase.auth.getSession();
    hasLocalSession = !!data.session;
    sessionUserId   = data.session?.user?.id ?? null;
  } catch {
    // getSession() reads from localStorage — should never throw, but
    // if it does, assume there's a session so we don't false-logout.
    hasLocalSession = true;
  }
  if (!hasLocalSession) {
    return { user: null, status: 'unauthed', sessionUserId: null };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    let result: Awaited<ReturnType<typeof supabase.auth.getUser>> | null = null;
    try {
      result = await Promise.race([
        supabase.auth.getUser(),
        new Promise<null>(res => setTimeout(() => res(null), timeoutMs)),
      ]) as any;
    } catch {
      return { user: null, status: 'transient', sessionUserId };
    }
    if (!result) return { user: null, status: 'transient', sessionUserId }; // timeout

    const { data: { user }, error } = result;
    if (user) return { user, status: 'ok', sessionUserId: user.id };

    const code = (error as any)?.status;
    if (code === 401 || code === 403) {
      // Stale access token mid-refresh — wait briefly and retry.
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      // After retries: local session still exists, server says 401.
      // Return 'transient' rather than 'unauthed' — Supabase's auto-refresh
      // may still complete in the background and fire TOKEN_REFRESHED.
      // The Header's auth listener will re-sync once it lands.
      return { user: null, status: 'transient', sessionUserId };
    }
    return { user: null, status: 'transient', sessionUserId };
  }
  return { user: null, status: 'transient', sessionUserId };
}
