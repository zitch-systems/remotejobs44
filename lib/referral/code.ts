// lib/referral/code.ts
// Short, unambiguous referral-code generation + DB allocation for agents.
//
// Codes go straight into a shareable URL (`/r/<code>`), so they avoid
// look-alike characters (no I/L/O/0/1) and stay case-stable. 7 chars over a
// 30-symbol alphabet is ~22 billion combinations — collisions are
// astronomically unlikely, but ensureAgentReferralCode still verifies
// uniqueness against the DB and retries, so a clash is impossible, not just
// improbable.
import type { SupabaseClient } from '@supabase/supabase-js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomReferralCode(length = 7): string {
  const bytes = new Uint32Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Allocate (or reuse) a unique referral_code for a profile. Idempotent: if
// the profile already has a code we return it unchanged, so re-promoting an
// agent who was demoted and re-promoted keeps the same shareable link.
//
// Must run with the service-role client — profiles.referral_code is not in
// the column-level UPDATE grant for the `authenticated` role (migration_v9).
export async function ensureAgentReferralCode(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .maybeSingle();
  if (existing?.referral_code) return existing.referral_code;

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomReferralCode();
    const { data: clash } = await admin
      .from('profiles')
      .select('id')
      .eq('referral_code', code)
      .maybeSingle();
    if (clash) continue;
    const { error } = await admin
      .from('profiles')
      .update({ referral_code: code, updated_at: new Date().toISOString() })
      .eq('id', userId);
    // A concurrent allocation can still win the unique index between the
    // check and the write (23505) — just try a fresh code.
    if (!error) return code;
  }
  throw new Error('Could not allocate a unique referral code');
}
