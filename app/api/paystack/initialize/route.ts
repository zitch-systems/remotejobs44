// app/api/paystack/initialize/route.ts
// Paystack payment initialization — called when user clicks Subscribe
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// Plan codes from your Paystack dashboard
// Create these in: Paystack Dashboard → Subscriptions → Plans
// Plan codes from your Paystack dashboard
const PLAN_CODES: Record<string, Record<string, string>> = {
  daily: {
    daily: process.env.PAYSTACK_DAILY_PLAN_CODE ?? '',
  },
  pro: {
    monthly:  process.env.PAYSTACK_PRO_MONTHLY_PLAN_CODE  ?? '',
    annually: process.env.PAYSTACK_PRO_ANNUAL_PLAN_CODE   ?? '',
  },
};

// Prices in kobo (NGN * 100)
const PLAN_AMOUNTS: Record<string, Record<string, number>> = {
  daily: {
    daily: 100000, // N1,000
  },
  pro: {
    monthly:  899900,   // N8,999
    annually: 8999900,  // N89,999
  },
};

export async function POST(req: NextRequest) {
  try {
    const { plan, billing, currency = 'NGN' } = await req.json();

    if (!plan || !billing) {
      return NextResponse.json({ error: 'plan and billing are required' }, { status: 400 });
    }

    // Get authenticated user
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const amount = PLAN_AMOUNTS[plan]?.[billing];
    if (!amount) {
      return NextResponse.json({ error: 'Invalid plan or billing period' }, { status: 400 });
    }

    const planCode = PLAN_CODES[plan]?.[billing];

    // Initialize Paystack transaction
    const body: Record<string, any> = {
      email: user.email,
      amount,
      currency,
      callback_url: `${APP_URL}/api/paystack/verify`,
      metadata: {
        user_id: user.id,
        plan,
        billing,
        cancel_action: `${APP_URL}/pricing`,
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
