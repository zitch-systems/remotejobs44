// app/api/cron/expire-daily/route.ts
// Scheduled cron — downgrades subscriptions whose current_period_end has
// passed. Despite the name (kept for vercel.json stability) it now covers
// ALL billing tiers:
//
//   * billing='daily'                    → hard expiry (no grace)
//   * billing IN ('monthly','annually')  → expire only after a 24h grace
//     window. Paystack renewal webhooks usually arrive within seconds of
//     the period end; the grace absorbs short outages so a paying user
//     isn't wrongly downgraded just because Paystack lagged.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireCronSecret } from '@/lib/cron-auth';

const PRO_GRACE_MS  = 24 * 60 * 60 * 1000; // 24h

export async function GET(req: NextRequest) {
  const auth = requireCronSecret(req, 'cron.expire_daily');
  if (!auth.ok) return auth.res;

  const supabase = createAdminSupabaseClient();
  const now      = new Date().toISOString();
  const proCutoff = new Date(Date.now() - PRO_GRACE_MS).toISOString();

  // ── Day Pass: hard expiry ───────────────────────────────────────────
  // Compare-and-set: expire the subscription rows with the expiry predicate
  // re-checked *inside* the UPDATE (not a stale id list from an earlier
  // SELECT), and derive the profile ids from the rows actually updated. If a
  // Paystack renewal lands between reads and writes — extending
  // current_period_end and flipping status back to 'active' — that row no
  // longer matches `status='active' AND current_period_end < now`, so a
  // just-paid user is never wrongly downgraded.
  const { data: expiredDaily } = await supabase
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('billing', 'daily')
    .eq('status', 'active')
    .lt('current_period_end', now)
    .select('user_id');

  const dailyIds = (expiredDaily ?? []).map((s: { user_id: string }) => s.user_id);
  if (dailyIds.length > 0) {
    // Skip admins — profile.plan='admin' is a display tag we don't want
    // a paid-then-expired admin to lose. role='admin' keeps their actual
    // access regardless of the plan column, so demoting them to 'free'
    // is purely a wrong-label bug but worth avoiding.
    await supabase.from('profiles').update({ plan: 'free' })
      .in('id', dailyIds).neq('role', 'admin');
  }

  // ── Pro Monthly / Annual: 24h grace period ──────────────────────────
  // status check is broader than 'active' here — when a user cancels via
  // /api/profile/cancel-subscription we mark the row 'cancelled' but keep
  // profile.plan='pro' until current_period_end + grace passes. Both
  // statuses need to be eligible for the downgrade once expiry is real.
  const { data: expiredPro } = await supabase
    .from('subscriptions')
    .update({ status: 'expired' })
    .in('billing', ['monthly', 'annually'])
    // payment_failed users are downgraded in this sweep too — Paystack
    // marks them via invoice.payment_failed webhook, which sets
    // current_period_end to now, so they fall past `proCutoff` on the
    // next cron run.
    .in('status', ['active', 'cancelled', 'payment_failed'])
    // Same compare-and-set as the daily branch: the expiry predicate is part
    // of the UPDATE, so a renewal that pushes current_period_end past
    // proCutoff between reads and writes excludes the row from downgrade.
    .lt('current_period_end', proCutoff)
    .select('user_id');

  const proIds = (expiredPro ?? []).map((s: { user_id: string }) => s.user_id);
  if (proIds.length > 0) {
    await supabase.from('profiles').update({ plan: 'free' })
      .in('id', proIds).neq('role', 'admin');
  }

  return NextResponse.json({
    expired_daily: dailyIds.length,
    expired_pro:   proIds.length,
  });
}
