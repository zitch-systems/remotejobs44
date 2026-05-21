// app/api/paystack/webhook/route.ts
// Paystack webhook — receives subscription lifecycle events
// Set webhook URL in: Paystack Dashboard → Settings → API Keys & Webhooks
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('x-paystack-signature');

  // Verify webhook authenticity
  const hash = createHmac('sha512', PAYSTACK_SECRET).update(body).digest('hex');
  if (hash !== signature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(body);
  const supabase = createAdminSupabaseClient();

  switch (event.event) {
    case 'charge.success': {
      // One-time or first subscription payment succeeded
      const { metadata, customer } = event.data;
      if (metadata?.user_id && metadata?.plan) {
        await supabase.from('profiles').update({ plan: metadata.plan }).eq('id', metadata.user_id);
      }
      break;
    }

    case 'subscription.create': {
      // Recurring subscription created
      const sub = event.data;
      const userId = sub.metadata?.user_id;
      if (userId) {
        const periodEnd = new Date(sub.next_payment_date);
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          plan: sub.plan?.name?.toLowerCase().includes('pro') ? 'pro' : 'daily',
          billing: sub.plan?.interval === 'annually' ? 'annually' : 'monthly',
          status: 'active',
          paystack_subscription_code: sub.subscription_code,
          paystack_customer_code: sub.customer?.customer_code,
          current_period_end: periodEnd.toISOString(),
        }, { onConflict: 'user_id' });
      }
      break;
    }

    case 'subscription.disable':
    case 'subscription.not_renew': {
      // Subscription cancelled
      const subCode = event.data.subscription_code;
      if (subCode) {
        await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('paystack_subscription_code', subCode);
        // Downgrade user
        const { data: sub } = await supabase.from('subscriptions').select('user_id').eq('paystack_subscription_code', subCode).single();
        if (sub?.user_id) {
          await supabase.from('profiles').update({ plan: 'free' }).eq('id', sub.user_id);
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const subCode = event.data.subscription?.subscription_code;
      if (subCode) {
        await supabase.from('subscriptions').update({ status: 'past_due' }).eq('paystack_subscription_code', subCode);
      }
      break;
    }

    default:
      // Unhandled event — log and return 200 so Paystack doesn't retry
      console.log('Unhandled Paystack event:', event.event);
  }

  return NextResponse.json({ received: true });
}
