// lib/auth/request-auth.ts — who is calling this API route?
//
// The web sends its Supabase session cookie; the native app has no cookie jar
// and sends its session's access token as `Authorization: Bearer <token>`
// (see mobile/src/lib/api.ts). Routes that the app needs call this instead of
// reading the cookie client directly, so one handler serves both.
//
// The returned client acts AS the user (RLS applies) in both modes — callers
// that need the service role still reach for createAdminSupabaseClient().
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export type RequestAuth =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false };

/**
 * Supabase Auth answers a good token with a user object. Anything else — an
 * error, no user, or a 200 carrying something that isn't a user (a misbehaving
 * proxy, a test double that answers every path) — is not a signed-in caller.
 */
function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null
    && typeof (value as { id?: unknown }).id === 'string'
    && (value as { id: string }).id.length > 0;
}

/**
 * The bearer token on a request: `null` when there is no Bearer header at all,
 * and `''` when the header is present but empty. Both the header name and the
 * scheme are matched case-insensitively (RFC 7235).
 */
export function bearerToken(req: { headers?: Headers } | undefined): string | null {
  const value = req?.headers?.get?.('authorization');
  if (!value) return null;
  const match = /^bearer(?:\s+(.*))?$/i.exec(value.trim());
  return match ? (match[1] ?? '').trim() : null;
}

/**
 * Resolve the signed-in user for an API request.
 *
 * A Bearer header is authoritative: if it is present and the token is not
 * accepted by Supabase Auth the request is unauthenticated — it never falls
 * through to a cookie, so a stale token can't silently act as a different
 * (cookie) identity. Without a Bearer header the cookie session is used.
 */
export async function authenticateRequest(req?: { headers?: Headers }): Promise<RequestAuth> {
  const token = bearerToken(req);

  if (token !== null) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!token || !url || !key) return { ok: false };
    try {
      const supabase = createClient(url, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      return !error && isUser(user) ? { ok: true, user, supabase } : { ok: false };
    } catch {
      return { ok: false };
    }
  }

  const supabase = (await createServerSupabaseClient()) as unknown as SupabaseClient;
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && isUser(user) ? { ok: true, user, supabase } : { ok: false };
}
