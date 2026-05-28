// app/api/profile/cancel-subscription/route.ts
// User-initiated subscription cancellation.
//
// Behaviour: soft-cancel in our DB so the user keeps access until
// current_period_end, then a cron (or the next webhook) downgrades them to
// 'free'. We also attempt to call Paystack's disable endpoint best-effort —
// it needs `code` + `token` and we don't currently persist the email_token
// (schema migration needed). If the call fails we still mark cancelled
// locally so the user sees immediate feedback.
import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { fetchActiveSubscriptionForCustomer } from '@/lib/paystack/subscription';
import { logError } from '@/lib/log';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? '';

export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('plan,status,paystack_subscription_code,paystack_email_token,paystack_customer_code,current_period_end')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: 'No active subscription to cancel' }, { status: 404 });
  }
  if (sub.status === 'cancelled') {
    return NextResponse.json({ error: 'Subscription is already cancelled' }, { status: 400 });
  }

  // Try to disable on Paystack. Path A: we already have the email_token
  // (migration_v4 + persisted in webhook/verify). Path B: legacy rows from
  // before that migration — look up the token from Paystack first.
  let paystackDisabled = false;
  if (PAYSTACK_SECRET && sub.paystack_subscription_code) {
    let token: string | null = sub.paystack_email_token ?? null;
    if (!token && sub.paystack_customer_code) {
      const lookup = await fetchActiveSubscriptionForCustomer(sub.paystack_customer_code);
      token = lookup?.email_token ?? null;
    }
    if (token) {
      try {
        const disableRes = await fetch('https://api.paystack.co/subscription/disable', {
          method: 'POST',
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: sub.paystack_subscription_code, token }),
        });
        paystackDisabled = disableRes.ok;
      } catch (err) {
        logError({ event: 'subscription.cancel.paystack_disable_failed', user_id: user.id, error: (err as Error)?.message ?? String(err) });
      }
    }
  }

  // Mark cancelled locally regardless of Paystack call outcome. The user
  // keeps Pro access until current_period_end (handled by the existing
  // expire-daily cron). This is the same as Netflix-style cancellation.
  await admin.from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', user.id);

  return NextResponse.json({
    success: true,
    paystack_disabled: paystackDisabled,
    access_until: sub.current_period_end,
  });
}
