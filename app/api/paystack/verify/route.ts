// app/api/paystack/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { paymentSuccessEmail } from '@/lib/email/templates';
import { fetchActiveSubscriptionForCustomer } from '@/lib/paystack/subscription';
import { recordReferralCommission } from '@/lib/referral/commission';
import {
  isValidPlan, chargeMatchesPlan, getPlanTier, getBilling,
} from '@/lib/paystack/plans';
import { fulfillPaystackCharge, paymentPlanFromMetadata } from '@/lib/paystack/fulfill';
import { paystackReferenceSchema } from '@/lib/api-schemas';
import { logError, logWarn } from '@/lib/log';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? '';

export async function GET(req: NextRequest) {
  // Hard-fail when NEXT_PUBLIC_APP_URL is unset. The previous fallback to
  // `new URL(req.url).origin` would use whatever Host header the request
  // carried — fine on Vercel (the proxy strips it) but a footgun on any
  // self-hosted deployment, and it also means the post-payment redirect
  // could land on an unexpected origin if envs are misconfigured.
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
  if (!APP_URL) {
    logError({ event: 'paystack.verify.misconfigured', detail: 'NEXT_PUBLIC_APP_URL missing' });
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

  // Whitelist the reference character set before interpolating into the
  // Paystack URL path. Paystack's own references are alphanumeric +
  // `_` / `-` (e.g. `T_675846_3yk2j`); anything else is either a
  // copy-paste error or an attacker trying to walk the URL path
  // (`xyz/../customer/123`). Without this, the fetch below would issue
  // a request the attacker designed against api.paystack.co — Bearer
  // auth is automatically attached, so they could potentially probe
  // other Paystack endpoints on our merchant account.
  if (!paystackReferenceSchema.safeParse(reference).success) {
    logWarn({ event: 'paystack.verify.invalid_reference', reference: reference.slice(0, 30) });
    return NextResponse.redirect(`${APP_URL}/pricing?error=invalid_reference`);
  }

  try {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }, signal: AbortSignal.timeout(20_000), cache: 'no-store' }
    );
    const data = await res.json();

    if (!res.ok || !data.status || data.data?.status !== 'success') {
      return NextResponse.redirect(`${APP_URL}/pricing?error=payment_failed`);
    }

    const { metadata, customer, amount, currency } = data.data;
    const user_id = metadata?.user_id;
    const plan = paymentPlanFromMetadata(metadata);

    if (!user_id || !plan || !isValidPlan(plan)) {
      return NextResponse.redirect(`${APP_URL}/pricing?error=invalid_metadata`);
    }

    // Validate the Paystack-verified amount matches the expected price for
    // the metadata plan. Stops "metadata says pro_annual but the charge is
    // only ₦500" tampering attacks (and accidental price drift between
    // initialize and the Paystack dashboard).
    if (!chargeMatchesPlan(plan, amount, currency)) {
      logWarn({ event: 'paystack.verify.amount_mismatch', plan, amount, currency });
      return NextResponse.redirect(`${APP_URL}/pricing?error=amount_mismatch`);
    }

    const supabase  = createAdminSupabaseClient();
    const planTier  = getPlanTier(plan);

    const paystackSub = plan === 'daily'
      ? null
      : await fetchActiveSubscriptionForCustomer(customer?.customer_code);
    const fulfillment = await fulfillPaystackCharge(supabase, {
      reference, userId: user_id, plan, amount, currency,
      customerCode: customer?.customer_code,
      subscriptionCode: paystackSub?.subscription_code,
      emailToken: paystackSub?.email_token,
    });
    if (!fulfillment.credited) {
      return NextResponse.redirect(`${APP_URL}/pricing?success=1&plan=${planTier}&upgraded=1`);
    }

    // Referral commission — if an agent referred this user, log the agent's
    // cut for this charge. Idempotent (unique on reference) so the webhook
    // recording the same charge is a harmless no-op, and internally guarded
    // so it can never break the subscription credit or the redirect.
    await recordReferralCommission(supabase, {
      referredUserId: user_id,
      plan:           planTier,
      billing:        getBilling(plan),
      amount:         (amount ?? 0) / 100,
      currency:       currency ?? 'NGN',
      reference,
    });

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
    logError({ event: 'paystack.verify.unhandled', error: err?.message ?? String(err) });
    return NextResponse.redirect(`${APP_URL}/pricing?error=server_error`);
  }
}
