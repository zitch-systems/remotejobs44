// lib/referral/attribution.ts
// Links a brand-new user to the agent whose referral link brought them in.
//
// Called at the signup choke-points (the email/password auto-confirm flow via
// /api/referral/attribute, and the OAuth / email-confirm first login in
// /auth/callback). The `rj44_ref` cookie carries the agent's code from the
// moment of the click; here we resolve it to an agent and stamp
// profiles.referred_by — but only ONCE, and never for the agent's own
// account.
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError, logInfo } from '@/lib/log';

// Matches randomReferralCode output plus a little slack for any future
// human-readable codes. Anything outside this set can't be a real code, so
// we skip the DB round-trip.
const CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;

export async function attributeReferral(
  admin: SupabaseClient,
  opts: { userId: string; code: string | null | undefined },
): Promise<{ attributed: boolean }> {
  const code = (opts.code ?? '').trim();
  if (!code || !CODE_RE.test(code)) return { attributed: false };

  try {
    const { data: agent } = await admin
      .from('profiles')
      .select('id, role')
      .eq('referral_code', code)
      .maybeSingle();
    // Only live agents earn attribution. A code that maps to a demoted /
    // deleted account is ignored.
    if (!agent || agent.role !== 'agent') return { attributed: false };
    if (agent.id === opts.userId) return { attributed: false };

    // `.is('referred_by', null)` makes this idempotent and one-shot: a user
    // who is already attributed (to this or any agent) is never re-stamped,
    // so a later click on a different link can't steal an existing referral.
    const { data: updated, error } = await admin
      .from('profiles')
      .update({ referred_by: agent.id, updated_at: new Date().toISOString() })
      .eq('id', opts.userId)
      .is('referred_by', null)
      .select('id')
      .maybeSingle();

    if (error) {
      logError({ event: 'referral.attribute_failed', error: error.message, user_id: opts.userId });
      return { attributed: false };
    }
    if (updated) logInfo({ event: 'referral.attributed', user_id: opts.userId, agent_id: agent.id });
    return { attributed: !!updated };
  } catch (err: any) {
    logError({ event: 'referral.attribute_exception', error: err?.message ?? String(err) });
    return { attributed: false };
  }
}
