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
export async function getAuthedUserSafe(
  supabase: SupabaseClient,
  opts: { retries?: number; delayMs?: number; timeoutMs?: number } = {}
): Promise<{
  user: { id: string; email?: string | null } | null;
  status: 'ok' | 'unauthed' | 'transient';
}> {
  const retries  = opts.retries  ?? 2;
  const delayMs  = opts.delayMs  ?? 400;
  const timeoutMs = opts.timeoutMs ?? 6000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let result: Awaited<ReturnType<typeof supabase.auth.getUser>> | null = null;
    try {
      result = await Promise.race([
        supabase.auth.getUser(),
        new Promise<null>(res => setTimeout(() => res(null), timeoutMs)),
      ]) as any;
    } catch {
      return { user: null, status: 'transient' };
    }
    if (!result) return { user: null, status: 'transient' }; // timeout

    const { data: { user }, error } = result;
    if (user) return { user, status: 'ok' };

    const code = (error as any)?.status;
    if (code === 401 || code === 403) {
      // Likely a stale access token mid-refresh — wait briefly and retry.
      // If we've exhausted retries the session really is gone.
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      return { user: null, status: 'unauthed' };
    }
    // Some other error (network, 5xx). Don't log the user out — let the caller
    // keep whatever they had and retry on the next render.
    return { user: null, status: 'transient' };
  }
  return { user: null, status: 'transient' };
}
