import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const reference = searchParams.get('reference');

  if (!reference) {
    return NextResponse.redirect(new URL('/?status=failed', req.url));
  }

  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const data = await res.json();

    if (data.status && data.data.status === 'success') {
      const { user_id, plan, billing } = data.data.metadata;
      const supabase = createAdminSupabaseClient();
      
      // Update user profile plan
      await supabase.from('profiles').update({ plan }).eq('id', user_id);
      
      // Create/Update subscription record
      await supabase.from('subscriptions').upsert({
        user_id, 
        plan, 
        billing, 
        status: 'active',
        paystack_customer_code: data.data.customer.customer_code,
        paystack_subscription_code: data.data.subscription_code || null,
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }, { onConflict: 'user_id' });

      return NextResponse.redirect(new URL('/?status=success', req.url));
    }
    return NextResponse.redirect(new URL('/?status=failed', req.url));
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(new URL('/?status=error', req.url));
  }
}