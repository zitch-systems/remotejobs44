// app/api/paystack/initialize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// Plan codes from your Paystack dashboard
const PLAN_CODES: Record<string, string> = {
  daily: process.env.PAYSTACK_DAILY_PLAN_CODE ?? '',
  pro: process.env.PAYSTACK_PRO_MONTHLY_PLAN_CODE ?? '',
  pro_annual: process.env.PAYSTACK_PRO_ANNUAL_PLAN_CODE ?? '',
};

// Prices in kobo (NGN * 100)
const PLAN_AMOUNTS: Record<string, number> = {
  daily: 100000,      // N1,000
  pro: 899900,        // N8,999
  pro_annual: 8999900,// N89,999
};

export async function POST(req: NextRequest) {
  try {
    const { plan } = await req.json();
    if (!plan) {
      return NextResponse.json({ error: 'plan is required' }, { status: 400 });
    }

    // Get authenticated user
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const amount = PLAN_AMOUNTS[plan];
    if (!amount) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const planCode = PLAN_CODES[plan];

    const body: Record<string, any> = {
      email: user.email,
      amount,
      currency: 'NGN',
      callback_url: `${APP_URL}/api/paystack/verify`,
      metadata: {
        user_id: user.id,
        plan,
        cancel_action: `${APP_URL}/`,
      },
    };

    // If plan code exists, create a subscription (recurring)
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
      return NextResponse.json({ error: data.message ?? 'Paystack error' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
    });
  } catch (err: any) {
    console.error('Paystack initialize error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}