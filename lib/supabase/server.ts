// lib/supabase/server.ts
// Server-side Supabase client (use in API routes, Server Components, middleware)
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components can't mutate cookies — middleware handles refresh.
          }
        },
      },
    }
  );
}

// Admin client with service role key — bypasses RLS.
// ONLY use in trusted server contexts (API routes), never expose to client.
//
// Cached at module scope so the 44 call sites across the codebase share
// one instance instead of rebuilding the client (and its internal HTTP
// agent / token cache) per request. The previous per-request `require()`
// + `createClient()` showed up as measurable cold-start latency in the
// audit and prevented connection pooling.
//
// Fail fast when SUPABASE_SERVICE_ROLE_KEY is missing: the previous `!`
// assertion let `createClient` get called with `undefined` and threw
// downstream as a confusing "Cannot read properties of undefined" 500.
let _adminClient: SupabaseClient | null = null;
export function createAdminSupabaseClient(): SupabaseClient {
  if (_adminClient) return _adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. ' +
      'Check your environment configuration.'
    );
  }
  _adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}
