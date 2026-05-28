// app/api/paystack/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { paymentSuccessEmail } from '@/lib/email/templates';
import { fetchActiveSubscriptionForCustomer } from '@/lib/paystack/subscription';
import {
  isValidPlan, chargeMatchesPlan, getPlanTier, getBilling, getPlanExpiry,
} from '@/lib/paystack/plans';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? '';

export async function GET(req: NextRequest) {
  // Hard-fail when NEXT_PUBLIC_APP_URL is unset. The previous fallback to
  // `new URL(req.url).origin` would use whatever Host header the request
  // carried — fine on Vercel (the proxy strips it) but a footgun on any
  // self-hosted deployment, and it also means the post-payment redirect
  // could land on an unexpected origin if envs are misconfigured.
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
  if (!APP_URL) {
    console.error('[paystack/verify] NEXT_PUBLIC_APP_URL is required for safe post-payment redirect');
    return NextResponse.json(
      { error: 'Server misconfigured: NEXT_PUBLIC_APP_URL not set' },
      { status: 500 },
    );
  }
  const reference = req.nextUrl.searchParams.get('reference')
    ?? req.nextUrl.searchParams.get('trxref');

  if (!reference) {
    return NextResponse.redirect(`${APP_URL}/pricing?error=no_reference`);
  }

  try {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    const data = await res.json();

    if (!data.status || data.data?.status !== 'success') {
      return NextResponse.redirect(`${APP_URL}/pricing?error=payment_failed`);
    }

    const { metadata, customer, amount, currency } = data.data;
    const { user_id, plan } = metadata ?? {};

    if (!user_id || !plan || !isValidPlan(plan)) {
      return NextResponse.redirect(`${APP_URL}/pricing?error=invalid_metadata`);
    }

    // Validate the Paystack-verified amount matches the expected price for
    // the metadata plan. Stops "metadata says pro_annual but the charge is
    // only ₦500" tampering attacks (and accidental price drift between
    // initialize and the Paystack dashboard).
    if (!chargeMatchesPlan(plan, amount, currency)) {
      console.warn(`[verify] amount mismatch — plan=${plan} got=${amount}${currency}`);
      return NextResponse.redirect(`${APP_URL}/pricing?error=amount_mismatch`);
    }

    const supabase  = createAdminSupabaseClient();
    const planTier  = getPlanTier(plan);
    const expiresAt = getPlanExpiry(plan);

    // Idempotency: if this paystack_reference is already recorded, the
    // user has already been credited for this charge — short-circuit so a
    // refresh of the callback URL doesn't extend their period again.
    // Same check is in the webhook; whichever ran first wins.
    const { data: existingRef } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('paystack_reference', reference)
      .maybeSingle();
    if (existingRef) {
      return NextResponse.redirect(`${APP_URL}/pricing?success=1&plan=${planTier}&upgraded=1`);
    }

    // Update user plan — but never overwrite an admin's special 'admin' plan tag.
    const { data: existing } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user_id)
      .maybeSingle();
    if (existing?.role !== 'admin') {
      const { error: planErr } = await supabase
        .from('profiles')
        .update({ plan: planTier, plan_expires_at: expiresAt.toISOString(), updated_at: new Date().toISOString() })
        .eq('id', user_id);
      if (planErr) console.error('[verify] profile plan update failed:', planErr.message);
    }

    // Look up the actual Paystack subscription so we can persist its
    // email_token. Without that, user-initiated cancellation has to fall
    // back to a soft cancel in our DB. Day Pass is one-off — no
    // subscription row — so we skip the lookup there.
    const paystackSub = plan === 'daily'
      ? null
      : await fetchActiveSubscriptionForCustomer(customer?.customer_code);

    // Upsert by user_id (one active sub per user). The unique-on-
    // paystack_reference idempotency check above means we only get here
    // once per real charge; subsequent retries short-circuit at the
    // existingRef branch.
    await supabase.from('subscriptions').upsert({
      user_id,
      plan: planTier,
      billing:     getBilling(plan),
      status:      'active',
      paystack_reference:         reference,
      paystack_customer_code:     customer?.customer_code ?? null,
      paystack_subscription_code: paystackSub?.subscription_code ?? null,
      paystack_email_token:       paystackSub?.email_token ?? null,
      current_period_start:   new Date().toISOString(),
      current_period_end:     expiresAt.toISOString(),
      currency:    currency ?? 'NGN',
      price:       (amount ?? 0) / 100,
    }, { onConflict: 'user_id' });

    // Send confirmation email
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('id', user_id)
        .single();
      if (profile?.email) {
        const fmt = `₦${((amount ?? 0) / 100).toLocaleString()}`;
        const { subject, html } = paymentSuccessEmail(
          profile.name ?? 'there', plan, fmt
        );
        await sendEmail({ to: profile.email, subject, html });
      }
    } catch {}

    // Redirect to /pricing with success params so the page shows the plan updated
    return NextResponse.redirect(
      `${APP_URL}/pricing?success=1&plan=${planTier}&upgraded=1`
    );

  } catch (err: any) {
    console.error('Verify error:', err);
    return NextResponse.redirect(`${APP_URL}/pricing?error=server_error`);
  }
}
