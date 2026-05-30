// app/api/profile/email-prefs/route.ts
// User-facing email/notification toggles. Stored in profiles.email_prefs
// jsonb (added in migration_v4). GET returns the current map; PATCH accepts
// a partial map and merges it in — so individual toggles can flip without
// the client having to read the whole record first.
//
// PATCH uses the admin (service-role) client for the actual UPDATE. The
// v9 column lockdown revoked UPDATE on every column except `name` and
// `updated_at` from the `authenticated` role, so a session-client write
// to email_prefs returns "permission denied for column email_prefs" —
// the toggle was silently failing for every user. User identity is
// still authoritatively resolved via supabase.auth.getUser() above, so
// this stays a strict own-row write.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { logError } from '@/lib/log';

const VALID_KEYS = ['marketing', 'job_alerts', 'billing', 'product_updates'] as const;

// Defaults sent back when a profile predates migration_v4 (email_prefs null).
const DEFAULT_PREFS: Record<string, boolean> = {
  marketing:       true,
  job_alerts:      true,
  billing:         true,
  product_updates: true,
};

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('email_prefs')
    .eq('id', user.id)
    .maybeSingle();

  const prefs = { ...DEFAULT_PREFS, ...((profile?.email_prefs as Record<string, boolean>) ?? {}) };
  return NextResponse.json({ prefs });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  // Validate: every submitted key must be in VALID_KEYS and value must be boolean.
  // Silently drop unknown keys so a stale client doesn't error.
  const patch: Record<string, boolean> = {};
  for (const k of VALID_KEYS) {
    if (k in body) {
      if (typeof body[k] !== 'boolean') {
        return NextResponse.json({ error: `${k} must be boolean` }, { status: 400 });
      }
      patch[k] = body[k] as boolean;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid prefs to update' }, { status: 400 });
  }

  // Fetch current prefs and merge — supabase doesn't expose a per-key jsonb
  // patch operator from the client SDK, so read-modify-write is the cleanest.
  const { data: profile } = await supabase
    .from('profiles')
    .select('email_prefs')
    .eq('id', user.id)
    .maybeSingle();

  const current = { ...DEFAULT_PREFS, ...((profile?.email_prefs as Record<string, boolean>) ?? {}) };
  const next    = { ...current, ...patch };

  const admin = createAdminSupabaseClient();
  const { error: updErr } = await admin
    .from('profiles')
    .update({ email_prefs: next, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (updErr) {
    logError({ event: 'profile.email_prefs.update_failed', user_id: user.id, error: updErr.message });
    return NextResponse.json({ error: 'Failed to save preferences. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ prefs: next });
}
