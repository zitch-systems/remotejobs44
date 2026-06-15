// supabase/functions/delete-account/index.ts
//
// Permanently deletes the signed-in user's account (the in-app account-deletion
// flow required by Apple / Google). Verifies the caller's JWT, then deletes
// their user-owned rows + the auth user with the service role.
//
// Deploy: supabase functions deploy delete-account
// No extra secrets needed — SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are injected into every function by default.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// User-owned rows to clear first (service role bypasses RLS). Done explicitly so
// deletion succeeds whether or not every FK has ON DELETE CASCADE.
const OWNED: [table: string, column: string][] = [
  ['device_push_tokens', 'user_id'],
  ['saved_jobs', 'user_id'],
  ['applications', 'user_id'],
  ['referrals', 'referrer_id'],
  ['profiles', 'id'],
];

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Sign in first.' }, { status: 401 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identify the caller from their JWT.
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return Response.json({ error: 'Sign in first.' }, { status: 401 });

  // Delete with the service role.
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Best-effort cleanup of owned rows (ignore "table doesn't exist" etc.).
  for (const [table, column] of OWNED) {
    await admin.from(table).delete().eq(column, user.id);
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
});
