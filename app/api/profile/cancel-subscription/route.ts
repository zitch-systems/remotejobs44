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

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? '';

export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('plan,status,paystack_subscription_code,current_period_end')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: 'No active subscription to cancel' }, { status: 404 });
  }
  if (sub.status === 'cancelled') {
    return NextResponse.json({ error: 'Subscription is already cancelled' }, { status: 400 });
  }

  // Best-effort: ask Paystack to disable. Without a saved email_token this
  // typically returns 400 ("invalid token"), but if their dashboard sends a
  // subscription.disable webhook later we still reconcile.
  let paystackDisabled = false;
  if (PAYSTACK_SECRET && sub.paystack_subscription_code) {
    try {
      // Fetch the subscription to learn the email_token (each disable call needs both).
      const fetchRes = await fetch(
        `https://api.paystack.co/subscription/${sub.paystack_subscription_code}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
      );
      const fetchData = await fetchRes.json();
      const token = fetchData?.data?.email_token;
      if (token) {
        const disableRes = await fetch('https://api.paystack.co/subscription/disable', {
          method: 'POST',
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: sub.paystack_subscription_code, token }),
        });
        paystackDisabled = disableRes.ok;
      }
    } catch (err) {
      console.error('[cancel-subscription] paystack disable failed:', err);
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
