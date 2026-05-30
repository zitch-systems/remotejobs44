// app/api/paystack/initialize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PLAN_AMOUNTS_KOBO as PLAN_AMOUNTS } from '@/lib/paystack/plans';
import { rateLimit, getIP } from '@/lib/rate-limit';
import { logError, logWarn } from '@/lib/log';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

// Plan codes set in Paystack Dashboard → Subscriptions → Plans
// For 'daily' we use a one-time charge, not a subscription plan
const SUBSCRIPTION_PLAN_CODES: Record<string, string | undefined> = {
  pro:        process.env.PAYSTACK_PRO_MONTHLY_PLAN_CODE,
  pro_annual: process.env.PAYSTACK_PRO_ANNUAL_PLAN_CODE,
};

export async function POST(req: NextRequest) {
  // Per-IP rate-limit: payment-init is a free outbound hop to Paystack.
  // A bot loop creating Paystack reference objects costs us API quota and
  // pollutes the merchant dashboard. 5/hour per IP is plenty for legit
  // users (a single user only ever clicks "subscribe" a handful of times).
  const ip = getIP(req);
  const rl = rateLimit(`paystack-init:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.success) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    logWarn({ event: 'paystack.initialize.rate_limited', ip });
    return NextResponse.json(
      { error: `Too many subscription attempts. Try again in ${retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    // Prefer NEXT_PUBLIC_APP_URL to avoid localhost bleed on Paystack callback
    const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '') || new URL(req.url).origin;
    const { plan } = await req.json();

    if (!plan || !PLAN_AMOUNTS[plan]) {
      return NextResponse.json({ error: 'Invalid plan. Must be: daily, pro, or pro_annual' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'You must be logged in to subscribe' }, { status: 401 });
    }

    const amount = PLAN_AMOUNTS[plan];
    const planCode = SUBSCRIPTION_PLAN_CODES[plan];

    const body: Record<string, any> = {
      email: user.email,
      amount,
      currency: 'NGN',
      callback_url: `${APP_URL}/api/paystack/verify`,
      metadata: {
        user_id: user.id,
        plan,
        cancel_action: `${APP_URL}/pricing`,
      },
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    };

    // Pro plans use Paystack subscription (recurring)
    // Daily pass is a one-time charge
    if (planCode) {
      body.plan = planCode;
    }

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!data.status) {
      // Don't echo Paystack's upstream message to the browser. Their
      // failure strings sometimes include integration hints
      // ("Invalid key", "Plan code X not found", "Test mode key on live
      // call") that leak more about our merchant config than a generic
      // message would.
      logError({ event: 'paystack.initialize.upstream_error', upstream_data: data });
      return NextResponse.json({ error: 'Payment initialization failed. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
    });
  } catch (err: any) {
    logError({ event: 'paystack.initialize.unhandled', error: err?.message ?? String(err) });
    // Generic message — Paystack SDK / env errors can carry internal
    // detail that doesn't belong on a public response.
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 500 });
  }
}
