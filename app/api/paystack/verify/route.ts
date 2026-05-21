// app/api/paystack/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { paymentSuccessEmail } from '@/lib/email/templates';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

function getPlanExpiry(plan: string): Date {
  const now = new Date();
  if (plan === 'daily')      { now.setHours(now.getHours() + 24); return now; }
  if (plan === 'pro')        { now.setMonth(now.getMonth() + 1);  return now; }
  if (plan === 'pro_annual') { now.setFullYear(now.getFullYear() + 1); return now; }
  return now;
}

// Map plan id → UserPlan value in DB
function getPlanTier(plan: string): string {
  if (plan === 'daily')      return 'daily';
  if (plan === 'pro')        return 'pro';
  if (plan === 'pro_annual') return 'pro';   // annual is still 'pro' tier
  return 'free';
}

export async function GET(req: NextRequest) {
  // Use the request's own origin so it works on any deployment
  const APP_URL = new URL(req.url).origin;
  const reference = req.nextUrl.searchParams.get('reference') ?? req.nextUrl.searchParams.get('trxref');
  if (!reference) return NextResponse.redirect(`${APP_URL}/pricing?error=no_reference`);

  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET}` },
    });
    const data = await res.json();

    if (!data.status || data.data.status !== 'success') {
      return NextResponse.redirect(`${APP_URL}/pricing?error=payment_failed`);
    }

    const { metadata, customer, amount, currency } = data.data;
    const { user_id, plan } = metadata ?? {};

    if (!user_id || !plan) {
      return NextResponse.redirect(`${APP_URL}/pricing?error=invalid_metadata`);
    }

    const supabase = createAdminSupabaseClient();
    const planTier = getPlanTier(plan);
    const expiresAt = getPlanExpiry(plan);

    // Upgrade user plan
    await supabase.from('profiles').update({ plan: planTier }).eq('id', user_id);

    // Upsert subscription record
    await supabase.from('subscriptions').upsert({
      user_id,
      plan: planTier,
      billing: plan === 'daily' ? 'daily' : plan === 'pro_annual' ? 'annually' : 'monthly',
      status: 'active',
      paystack_customer_code: customer?.customer_code,
      current_period_start: new Date().toISOString(),
      current_period_end: expiresAt.toISOString(),
      currency: currency ?? 'NGN',
      price: (amount ?? 0) / 100,
    }, { onConflict: 'user_id' });

    // For daily passes — schedule downgrade back to free after 24h
    // (In production you'd use a cron job or Paystack webhook for this)

    // Send payment confirmation email
    try {
      const { data: profile } = await supabase.from('profiles').select('name, email').eq('id', user_id).single();
      if (profile?.email) {
        const amountFormatted = `₦${((amount ?? 0) / 100).toLocaleString()}`;
        const { subject, html } = paymentSuccessEmail(profile.name ?? 'there', plan, amountFormatted);
        await sendEmail({ to: profile.email, subject, html });
      }
    } catch {}

    return NextResponse.redirect(`${APP_URL}/dashboard?subscribed=1&plan=${plan}`);
  } catch (err: any) {
    console.error('Verify error:', err);
    return NextResponse.redirect(`${APP_URL}/pricing?error=server_error`);
  }
}
