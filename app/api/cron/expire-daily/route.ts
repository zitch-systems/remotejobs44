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
import { logError } from '@/lib/log';

const CRON_MIN_LEN = 16;
const PRO_GRACE_MS  = 24 * 60 * 60 * 1000; // 24h

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret || secret.length < CRON_MIN_LEN) {
    logError({ event: 'cron.expire_daily.misconfigured', detail: 'CRON_SECRET missing or too short' });
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const now      = new Date().toISOString();
  const proCutoff = new Date(Date.now() - PRO_GRACE_MS).toISOString();

  // ── Day Pass: hard expiry ───────────────────────────────────────────
  const { data: expiredDaily } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('billing', 'daily')
    .eq('status', 'active')
    .lt('current_period_end', now);

  const dailyIds = (expiredDaily ?? []).map((s: { user_id: string }) => s.user_id);
  if (dailyIds.length > 0) {
    await supabase.from('profiles').update({ plan: 'free' }).in('id', dailyIds);
    await supabase.from('subscriptions').update({ status: 'expired' })
      .in('user_id', dailyIds).eq('billing', 'daily');
  }

  // ── Pro Monthly / Annual: 24h grace period ──────────────────────────
  // status check is broader than 'active' here — when a user cancels via
  // /api/profile/cancel-subscription we mark the row 'cancelled' but keep
  // profile.plan='pro' until current_period_end + grace passes. Both
  // statuses need to be eligible for the downgrade once expiry is real.
  const { data: expiredPro } = await supabase
    .from('subscriptions')
    .select('user_id')
    .in('billing', ['monthly', 'annually'])
    // payment_failed users are downgraded in this sweep too — Paystack
    // marks them via invoice.payment_failed webhook, which sets
    // current_period_end to now, so they fall past `proCutoff` on the
    // next cron run.
    .in('status', ['active', 'cancelled', 'payment_failed'])
    .lt('current_period_end', proCutoff);

  const proIds = (expiredPro ?? []).map((s: { user_id: string }) => s.user_id);
  if (proIds.length > 0) {
    await supabase.from('profiles').update({ plan: 'free' }).in('id', proIds);
    await supabase.from('subscriptions').update({ status: 'expired' })
      .in('user_id', proIds).in('billing', ['monthly', 'annually']);
  }

  return NextResponse.json({
    expired_daily: dailyIds.length,
    expired_pro:   proIds.length,
  });
}
