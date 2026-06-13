// lib/referral/commission.ts
// Records an agent's commission when one of their referrals pays.
//
// Called from BOTH credit paths for a Paystack charge — the synchronous
// /api/paystack/verify redirect and the asynchronous webhook — because
// either can run first. The unique index on agent_commissions.paystack_
// reference makes the second caller a harmless no-op (23505). The whole
// function is wrapped so commission bookkeeping can NEVER break the
// subscription crediting it rides alongside.
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError, logInfo } from '@/lib/log';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function recordReferralCommission(
  admin: SupabaseClient,
  opts: {
    referredUserId: string;
    plan: string;              // resolved tier — 'daily' | 'pro'
    billing?: string | null;   // 'daily' | 'monthly' | 'annually'
    amount: number;            // gross charge in major units (e.g. 500 NGN)
    currency?: string | null;
    reference?: string | null; // Paystack reference (idempotency key)
  },
): Promise<void> {
  try {
    const { data: refUser } = await admin
      .from('profiles')
      .select('referred_by')
      .eq('id', opts.referredUserId)
      .maybeSingle();
    const agentId = refUser?.referred_by;
    if (!agentId) return; // not a referred user → nothing to record

    const { data: agent } = await admin
      .from('profiles')
      .select('id, role, commission_rate')
      .eq('id', agentId)
      .maybeSingle();
    if (!agent || agent.role !== 'agent') return; // referrer demoted / removed

    const rate = Number(agent.commission_rate ?? 0);
    const gross = Number(opts.amount ?? 0);
    const commission = round2((gross * rate) / 100);

    // We record the conversion even when rate is 0 (the chosen default): the
    // agent still needs the "X subscribed" / plan-mix stats, and a 0-payout
    // row documents that the admin hadn't set a rate at the time of sale.
    const { error } = await admin.from('agent_commissions').insert({
      agent_id:           agentId,
      referred_user_id:   opts.referredUserId,
      plan:               opts.plan,
      billing:            opts.billing ?? null,
      amount:             gross,
      currency:           opts.currency ?? 'NGN',
      commission_rate:    rate,
      commission_amount:  commission,
      paystack_reference: opts.reference ?? null,
      status:             'pending',
    });

    if (error) {
      // 23505 = the sibling credit path already logged this exact charge.
      if ((error as { code?: string }).code === '23505') return;
      logError({ event: 'referral.commission_insert_failed', error: error.message, user_id: opts.referredUserId });
      return;
    }
    logInfo({
      event: 'referral.commission_recorded',
      agent_id: agentId, user_id: opts.referredUserId, plan: opts.plan, rate, commission,
    });
  } catch (err: any) {
    logError({ event: 'referral.commission_exception', error: err?.message ?? String(err) });
  }
}
