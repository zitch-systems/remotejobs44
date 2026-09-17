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
import { logError } from '@/lib/log';

export async function GET(req: NextRequest) {
  const auth = requireCronSecret(req, 'cron.expire_daily');
  if (!auth.ok) return auth.res;

  const supabase = createAdminSupabaseClient();
  try {
    // Subscription status and profile entitlement must move together. The RPC
    // also takes the same profile locks as payment fulfillment, so a renewal
    // cannot race this expiry sweep and be downgraded after it was credited.
    const { data, error } = await supabase.rpc('expire_subscriptions', { p_batch_size: 500 });
    if (error) throw error;
    if (!data || typeof data.expiredDayPasses !== 'number' || typeof data.expiredPro !== 'number') {
      throw new Error('Invalid expire_subscriptions result');
    }

    return NextResponse.json({
      expired_daily: data.expiredDayPasses,
      expired_pro:   data.expiredPro,
    });
  } catch (err: any) {
    const message = err?.message ?? String(err);
    logError({ event: 'cron.expire_daily.failed', error: message });
    return NextResponse.json({
      expired_daily: 0,
      expired_pro:   0,
    }, { status: 500 });
  }
}
