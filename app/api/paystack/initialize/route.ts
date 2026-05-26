// app/api/paystack/initialize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PLAN_AMOUNTS_KOBO as PLAN_AMOUNTS } from '@/lib/paystack/plans';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

// Plan codes set in Paystack Dashboard → Subscriptions → Plans
// For 'daily' we use a one-time charge, not a subscription plan
const SUBSCRIPTION_PLAN_CODES: Record<string, string | undefined> = {
  pro:        process.env.PAYSTACK_PRO_MONTHLY_PLAN_CODE,
  pro_annual: process.env.PAYSTACK_PRO_ANNUAL_PLAN_CODE,
};

export async function POST(req: NextRequest) {
  try {
    // Prefer NEXT_PUBLIC_APP_URL to avoid localhost bleed on Paystack callback
    const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '') || new URL(req.url).origin;
    const { plan } = await req.json();

    if (!plan || !PLAN_AMOUNTS[plan]) {
      return NextResponse.json({ error: 'Invalid plan. Must be: daily, pro, or pro_annual' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
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
      console.error('Paystack error:', data);
      return NextResponse.json({ error: data.message ?? 'Payment initialization failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
    });
  } catch (err: any) {
    console.error('Initialize error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
